"""入力チェックのエラーメッセージを、移植元の Bean Validation と同じ文言にする仕組み。

移植元は Request クラスの注釈ごとに`message`を指定し（例: `@Size(max = 16,
message = "カテゴリ名は16文字以内で入力してください")`）、エラー応答の`message`に
その文言を返す。Pydanticの組み込みの制約（`Field(max_length=...)`など）は英語の
既定文言を返すため、項目の型注釈に`ValidationMessages`を添えて文言を置き換える
（Issue #239）。

制約そのものは`Field()`で宣言したままにするため、受け付ける値とOpenAPIのスキーマは
変わらない。
"""

from collections.abc import Callable
from dataclasses import dataclass
from functools import cache
from typing import Any, Self, get_args

from pydantic import (
    AliasChoices,
    BaseModel,
    GetCoreSchemaHandler,
    ModelWrapValidatorHandler,
    ValidationError,
    model_validator,
)
from pydantic_core import (
    ErrorDetails,
    InitErrorDetails,
    PydanticCustomError,
    core_schema,
)
from pydantic_core.core_schema import ErrorType

# 移植元にメッセージの指定が無い制約の文言。移植元はリクエストの`Accept-Language`で
# Hibernate Validator（Spring Boot 3.5.10の既定の8.0.3.Final）の既定文言を補間し、
# 日本語の画面のクライアントには日本語の既定文言が返る。その文言に合わせる。
NOT_BLANK_DEFAULT_MESSAGE = "空白は許可されていません"
NOT_NULL_DEFAULT_MESSAGE = "null は許可されていません"
NOT_EMPTY_DEFAULT_MESSAGE = "空要素は許可されていません"

# 独自チェック（`field_validator`等で送出した例外）のエラー。文言は既に呼び出し側が
# 決めているため置き換えない。
_CUSTOM_ERROR_TYPES = frozenset({"value_error", "assertion_error"})
_TOO_LONG_ERROR_TYPES = frozenset({"string_too_long", "too_long"})
_TOO_SHORT_ERROR_TYPES = frozenset({"string_too_short", "too_short"})
_BELOW_MIN_ERROR_TYPES = frozenset({"greater_than", "greater_than_equal"})
_ABOVE_MAX_ERROR_TYPES = frozenset({"less_than", "less_than_equal"})
_MISSING_ERROR_TYPE = "missing"
_DATETIME_ERROR_TYPE_PREFIX = "datetime_"
# Pydantic組み込みのエラーの種類。置き換えないエラーは、元の種類と`ctx`のまま
# 作り直すために使う（独自の種類は`PydanticCustomError`でしか作り直せない）。
_KNOWN_ERROR_TYPES: frozenset[str] = frozenset(get_args(ErrorType))


@dataclass(frozen=True)
class ValidationMessages:
    """項目の型注釈に添える、制約ごとのエラーメッセージ。

    引数名は移植元の注釈に対応させている。指定の無い制約のエラーは置き換えない。

    文言を置き換えるだけで、制約は追加しない。たとえば`not_blank`を指定しても空白のみの
    値は弾かれず、弾くには`Field(min_length=1)`や独自チェックを別に書く必要がある。

    Attributes
    ----------
    not_blank
        `@NotBlank`。欠落・null・空文字・空白のみの値が弾かれたとき。
    not_null
        `@NotNull`。欠落・nullで弾いたとき（空文字・空配列は対象外）。
    not_empty
        `@NotEmpty`。欠落・null・空文字・空配列で弾いたとき。
    size
        `@Size`。文字数・件数の上限を超えたとき。
    min_value
        `@Min`・`@DecimalMin`・`@PositiveOrZero`。下限を下回ったとき。
    max_value
        `@Max`・`@DecimalMax`。上限を超えたとき。
    iso8601_instant
        `@ISO8601Instant`。日時として解釈できないとき。
    """

    not_blank: str | None = None
    not_null: str | None = None
    not_empty: str | None = None
    size: str | None = None
    min_value: str | None = None
    max_value: str | None = None
    iso8601_instant: str | None = None

    @property
    def required(self) -> str | None:
        """欠落・nullのときの文言（`not_blank`・`not_null`・`not_empty`のいずれか）。"""
        return self.not_blank or self.not_null or self.not_empty

    def message_for(self, error: ErrorDetails) -> str | None:
        """1件のエラーを置き換える文言を返す。

        Parameters
        ----------
        error : ErrorDetails
            この項目で起きたPydanticのエラー。

        Returns
        -------
        str | None
            置き換える文言。置き換えない場合は`None`。
        """
        error_type = error["type"]
        value = error.get("input")
        if error_type in _CUSTOM_ERROR_TYPES:
            return None
        if error_type == _MISSING_ERROR_TYPE or value is None:
            return self.required
        if error_type in _TOO_LONG_ERROR_TYPES:
            return self.size
        if error_type in _TOO_SHORT_ERROR_TYPES:
            # `@NotNull`は空文字・空配列を拒否しないため、`not_null`だけの項目は
            # backend独自の制約（`min_length=1`など）として置き換えない。
            return self.not_blank or self.not_empty
        if error_type in _BELOW_MIN_ERROR_TYPES:
            return self.min_value
        if error_type in _ABOVE_MAX_ERROR_TYPES:
            return self.max_value
        # 日時の項目に空文字を送った場合など。移植元は`@NotBlank`が先に弾く。
        if isinstance(value, str) and not value.strip():
            return self.not_blank
        if error_type.startswith(_DATETIME_ERROR_TYPE_PREFIX):
            return self.iso8601_instant
        return None

    def __get_pydantic_core_schema__(
        self, source_type: Any, handler: GetCoreSchemaHandler
    ) -> core_schema.CoreSchema:
        """項目のスキーマを包み、項目自身のエラーを指定の文言に置き換える。

        Parameters
        ----------
        source_type : Any
            項目の型。
        handler : GetCoreSchemaHandler
            内側（`Field()`の制約を含む）のスキーマを作る関数。

        Returns
        -------
        core_schema.CoreSchema
            内側のスキーマを包んだスキーマ。
        """
        return core_schema.no_info_wrap_validator_function(
            self._validate, handler(source_type)
        )

    def _validate(
        self, value: Any, handler: core_schema.ValidatorFunctionWrapHandler
    ) -> Any:
        """内側の検証を行い、失敗したらエラーの文言を置き換えて送出する。

        配列の要素・入れ子のモデルのエラーは、この項目の制約ではないため置き換えない。

        Parameters
        ----------
        value : Any
            項目の入力値。
        handler : core_schema.ValidatorFunctionWrapHandler
            内側の検証。

        Returns
        -------
        Any
            検証済みの値。

        Raises
        ------
        ValidationError
            内側の検証に失敗した場合。
        """
        try:
            return handler(value)
        except ValidationError as exc:
            replaced = _replace_messages(
                exc, lambda error: self.message_for(error) if not error["loc"] else None
            )
            if replaced is None:
                raise
            raise replaced from None


def _replace_messages(
    exc: ValidationError, message_for: Callable[[ErrorDetails], str | None]
) -> ValidationError | None:
    """エラーの文言を置き換えた`ValidationError`を作る。

    エラーの種類（`type`）・位置・入力は保つ。種類を保つことで、共通の例外ハンドラの
    接頭辞の除去（`value_error`）とログ（位置と種類）がそのまま動く。置き換えない
    Pydantic組み込みのエラーは、`ctx`も含めて元のまま作り直す。

    Parameters
    ----------
    exc : ValidationError
        元のエラー。
    message_for : Callable[[ErrorDetails], str | None]
        1件のエラーを置き換える文言を返す関数（置き換えないなら`None`）。

    Returns
    -------
    ValidationError | None
        置き換えた`ValidationError`。置き換えるエラーが無ければ`None`。
    """
    errors = exc.errors()
    messages = [message_for(error) for error in errors]
    if all(message is None for message in messages):
        return None
    line_errors = [
        _line_error(error, message)
        for error, message in zip(errors, messages, strict=True)
    ]
    return ValidationError.from_exception_data(exc.title, line_errors)


def _line_error(error: ErrorDetails, message: str | None) -> InitErrorDetails:
    """`ValidationError`を作り直すための1件分のエラーを作る。

    Parameters
    ----------
    error : ErrorDetails
        元のエラー。
    message : str | None
        置き換える文言。置き換えないなら`None`。

    Returns
    -------
    InitErrorDetails
        作り直すエラー。
    """
    if message is None and error["type"] in _KNOWN_ERROR_TYPES:
        line_error: InitErrorDetails = {
            "type": error["type"],
            "loc": error["loc"],
            "input": error["input"],
        }
        if "ctx" in error:
            line_error["ctx"] = error["ctx"]
        return line_error
    return {
        "type": PydanticCustomError(error["type"], message or error["msg"]),
        "loc": error["loc"],
        "input": error["input"],
    }


class RequestModel(BaseModel):
    """`ValidationMessages`を添えた項目を持つリクエストのスキーマの基底。

    項目の欠落は項目の検証が呼ばれず`ValidationMessages`で置き換えられないため、
    モデル単位で必須の文言に置き換える。
    """

    @model_validator(mode="wrap")
    @classmethod
    def _replace_missing_messages(
        cls, data: Any, handler: ModelWrapValidatorHandler[Self]
    ) -> Self:
        """モデル直下の項目の欠落を、その項目の必須の文言に置き換える。

        Parameters
        ----------
        data : Any
            入力値。
        handler : ModelWrapValidatorHandler[Self]
            モデルの検証。

        Returns
        -------
        Self
            検証済みのモデル。

        Raises
        ------
        ValidationError
            検証に失敗した場合。
        """
        try:
            return handler(data)
        except ValidationError as exc:
            replaced = _replace_messages(exc, cls._missing_message)
            if replaced is None:
                raise
            raise replaced from None

    @classmethod
    def _missing_message(cls, error: ErrorDetails) -> str | None:
        """モデル直下の項目の欠落なら、その項目の必須の文言を返す。

        Parameters
        ----------
        error : ErrorDetails
            モデルの検証で起きたエラー。

        Returns
        -------
        str | None
            必須の文言。対象外なら`None`。
        """
        if error["type"] != _MISSING_ERROR_TYPE or len(error["loc"]) != 1:
            return None
        messages = _field_messages_by_loc(cls).get(error["loc"][0])
        return messages.required if messages else None


@cache
def _field_messages_by_loc(
    model: type[BaseModel],
) -> dict[str | int, ValidationMessages]:
    """エラーの位置（項目名・別名）から、項目の`ValidationMessages`を引く表を作る。

    Pydanticはエラーの位置を別名で出すため、項目名と別名のどちらでも引けるようにする。
    モデルの項目は定義後に変わらないため、モデルごとに一度だけ作る。

    Parameters
    ----------
    model : type[BaseModel]
        対象のモデル。

    Returns
    -------
    dict[str | int, ValidationMessages]
        位置の名前から`ValidationMessages`への表。
    """
    by_loc: dict[str | int, ValidationMessages] = {}
    for name, field in model.model_fields.items():
        messages = next(
            (m for m in field.metadata if isinstance(m, ValidationMessages)), None
        )
        if messages is None:
            continue
        keys: list[str] = [name]
        if field.alias:
            keys.append(field.alias)
        if isinstance(field.validation_alias, str):
            keys.append(field.validation_alias)
        elif isinstance(field.validation_alias, AliasChoices):
            keys.extend(c for c in field.validation_alias.choices if isinstance(c, str))
        for key in keys:
            by_loc[key] = messages
    return by_loc
