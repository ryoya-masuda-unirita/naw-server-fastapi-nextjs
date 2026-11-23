import importlib
import inspect
import pkgutil
from datetime import datetime
from typing import Annotated, Any

import pytest
from fastapi import FastAPI, Query
from httpx import ASGITransport, AsyncClient
from pydantic import AliasChoices, BaseModel, Field, ValidationError, field_validator

import app.schemas

from app.core.errors import register_exception_handlers, validation_error_message
from app.core.validation_messages import RequestModel, ValidationMessages

NAME_REQUIRED = "名前は必須です"
NAME_SIZE = "名前は3文字以内で入力してください"
TAGS_REQUIRED = "タグを1件以上指定してください"
NOTE_REQUIRED = "メモは必須です"
COUNT_MIN = "件数は1以上である必要があります"
COUNT_MAX = "件数は10以下である必要があります"
AT_REQUIRED = "日時は必須です"
AT_FORMAT = "日時は YYYY-MM-DDTHH:mm:ssZ 形式で指定してください"
CHILD_ID_REQUIRED = "子のIDは必須です"
CUSTOM_MESSAGE = "名前に ng は使えません"
LOGIN_ID_REQUIRED = "ログインIDは必須です"


class _Child(RequestModel):
    """ネストした子要素のテスト用モデル"""

    id: Annotated[str, ValidationMessages(not_blank=CHILD_ID_REQUIRED)]


class _Sample(RequestModel):
    """各種制約を持つテスト用リクエストモデル"""

    name: Annotated[
        str,
        Field(max_length=3),
        ValidationMessages(not_blank=NAME_REQUIRED, size=NAME_SIZE),
    ]
    tags: Annotated[
        list[str], Field(min_length=1), ValidationMessages(not_empty=TAGS_REQUIRED)
    ] = ["a"]
    note: Annotated[
        str, Field(min_length=1), ValidationMessages(not_null=NOTE_REQUIRED)
    ] = "x"
    count: Annotated[
        int,
        Field(ge=1, le=10),
        ValidationMessages(min_value=COUNT_MIN, max_value=COUNT_MAX),
    ] = 1
    at: Annotated[
        datetime | None,
        ValidationMessages(not_blank=AT_REQUIRED, iso8601_instant=AT_FORMAT),
    ] = None
    children: list[_Child] = []
    plain: Annotated[str, Field(max_length=3)] = "x"

    @field_validator("name")
    @classmethod
    def _reject_ng(cls, value: str) -> str:
        """値が ng のとき独自メッセージで検証エラーにする。

        Parameters
        ----------
        value : str
            検証する値。

        Returns
        -------
        str
            検証を通過した値。

        Raises
        ------
        ValueError
            値が ng の場合。
        """
        if value == "ng":
            raise ValueError(CUSTOM_MESSAGE)
        return value


class _Aliased(RequestModel):
    """エイリアス付き項目を持つテスト用モデル"""

    loginId: Annotated[
        str,
        Field(validation_alias=AliasChoices("loginId", "username")),
        ValidationMessages(not_blank=LOGIN_ID_REQUIRED),
    ]


def _first_message(data: dict[str, Any], model: type[RequestModel] = _Sample) -> str:
    """検証エラーになるデータを渡し、最初のエラーメッセージを返す。

    Parameters
    ----------
    data : dict[str, Any]
        検証するデータ。
    model : type[RequestModel]
        検証するモデル。

    Returns
    -------
    str
        最初のエラーのメッセージ。
    """
    with pytest.raises(ValidationError) as exc_info:
        model.model_validate(data)
    return validation_error_message(exc_info.value.errors())


class TestValidationMessages:
    """ValidationMessages のテスト"""

    def test_missing_field_uses_required_message(self) -> None:
        """必須の項目が無いとき、指定した必須の文言になること"""
        assert _first_message({}) == NAME_REQUIRED

    def test_null_uses_required_message(self) -> None:
        """必須の項目がnullのとき、指定した必須の文言になること"""
        assert _first_message({"name": None}) == NAME_REQUIRED

    def test_empty_list_uses_not_empty_message(self) -> None:
        """空不可の項目が空配列のとき、指定した文言になること"""
        assert _first_message({"name": "a", "tags": []}) == TAGS_REQUIRED

    def test_null_list_uses_not_empty_message(self) -> None:
        """空不可の項目がnullのとき、指定した文言になること"""
        assert _first_message({"name": "a", "tags": None}) == TAGS_REQUIRED

    def test_null_uses_not_null_message(self) -> None:
        """null不可の項目がnullのとき、指定した文言になること"""
        assert _first_message({"name": "a", "note": None}) == NOTE_REQUIRED

    def test_empty_string_is_not_replaced_for_not_null(self) -> None:
        """null不可だけの項目が空文字で弾かれたときは置き換えないこと（移植元は空文字を許すため）"""
        assert (
            _first_message({"name": "a", "note": ""})
            == "String should have at least 1 character"
        )

    def test_too_long_uses_size_message(self) -> None:
        """文字数の上限を超えたとき、文字数の文言になること"""
        assert _first_message({"name": "abcd"}) == NAME_SIZE

    def test_below_min_uses_min_message(self) -> None:
        """下限を下回ったとき、最小値の文言になること"""
        assert _first_message({"name": "a", "count": 0}) == COUNT_MIN

    def test_above_max_uses_max_message(self) -> None:
        """上限を超えたとき、最大値の文言になること"""
        assert _first_message({"name": "a", "count": 11}) == COUNT_MAX

    def test_invalid_datetime_uses_iso8601_message(self) -> None:
        """日時として解釈できないとき、形式の文言になること"""
        assert _first_message({"name": "a", "at": "2026/01/01"}) == AT_FORMAT

    def test_blank_datetime_uses_not_blank_message(self) -> None:
        """日時の項目が空文字のとき、必須の文言になること（移植元は@NotBlankが先に弾く）"""
        assert _first_message({"name": "a", "at": ""}) == AT_REQUIRED

    def test_custom_validator_message_is_kept(self) -> None:
        """独自チェックのエラーは置き換えず、独自チェックの文言のままであること"""
        assert _first_message({"name": "ng"}) == CUSTOM_MESSAGE

    def test_field_without_messages_is_not_replaced(self) -> None:
        """文言を指定していない項目のエラーは英語のままであること"""
        assert (
            _first_message({"name": "a", "plain": "abcd"})
            == "String should have at most 3 characters"
        )

    def test_type_error_is_not_replaced(self) -> None:
        """型が違う値のエラーは置き換えないこと（移植元はBean Validationに届かないため）"""
        assert (
            _first_message({"name": "a", "count": "x"})
            == "Input should be a valid integer, unable to parse string as an integer"
        )

    def test_nested_model_errors_use_nested_messages(self) -> None:
        """入れ子のモデルのエラーは、入れ子のモデルで指定した文言になること"""
        with pytest.raises(ValidationError) as exc_info:
            _Sample.model_validate({"name": "a", "children": [{}]})

        errors = exc_info.value.errors()
        assert errors[0]["loc"] == ("children", 0, "id")
        assert errors[0]["msg"] == CHILD_ID_REQUIRED

    def test_missing_aliased_field_uses_required_message(self) -> None:
        """別名（AliasChoices）の項目が無いとき、指定した必須の文言になること"""
        assert _first_message({}, _Aliased) == LOGIN_ID_REQUIRED

    def test_first_error_message_after_replacement(self) -> None:
        """複数のエラーがあるとき、置き換え後の最初の1件の文言を返すこと"""
        with pytest.raises(ValidationError) as exc_info:
            _Sample.model_validate({"name": "abcd", "count": 0})

        errors = exc_info.value.errors()
        assert [error["msg"] for error in errors] == [NAME_SIZE, COUNT_MIN]
        assert validation_error_message(errors) == NAME_SIZE

    def test_error_type_and_location_are_kept(self) -> None:
        """置き換えたエラーも、元のエラーの種類と位置を保つこと（ログで原因を追えるように）"""
        with pytest.raises(ValidationError) as exc_info:
            _Sample.model_validate({"name": "abcd", "plain": "abcd"})

        errors = exc_info.value.errors()
        assert [(error["type"], error["loc"]) for error in errors] == [
            ("string_too_long", ("name",)),
            ("string_too_long", ("plain",)),
        ]

    def test_kept_error_context_is_preserved(self) -> None:
        """他の項目の置き換えで作り直しても、置き換えないエラーのctxは元のまま残ること"""
        with pytest.raises(ValidationError) as exc_info:
            _Sample.model_validate({"name": "ng", "count": 0})

        errors = exc_info.value.errors()
        assert errors[0]["type"] == "value_error"
        assert str(errors[0]["ctx"]["error"]) == CUSTOM_MESSAGE
        assert errors[1]["msg"] == COUNT_MIN

    def test_value_error_prefix_is_still_removed(self) -> None:
        """他の項目の置き換えで作り直した後も、独自チェックの接頭辞が外れること"""
        with pytest.raises(ValidationError) as exc_info:
            _Sample.model_validate({"name": "ng", "count": 0})

        assert validation_error_message(exc_info.value.errors()) == CUSTOM_MESSAGE

    def test_valid_values_are_accepted(self) -> None:
        """上限・下限ちょうどの値は受け付けること（制約そのものは変わらないこと）"""
        sample = _Sample.model_validate(
            {"name": "abc", "count": 10, "at": "2026-01-01T00:00:00Z"}
        )

        assert sample.name == "abc"
        assert sample.count == 10

    def test_json_schema_keeps_constraints(self) -> None:
        """JSONスキーマ（OpenAPI）に制約が残ること"""
        properties = _Sample.model_json_schema()["properties"]

        assert properties["name"]["maxLength"] == 3
        assert properties["count"]["minimum"] == 1
        assert properties["count"]["maximum"] == 10


def _create_app() -> FastAPI:
    """例外ハンドラを登録したテスト用 FastAPI アプリを生成する。

    Returns
    -------
    FastAPI
        テスト用アプリ。
    """
    test_app = FastAPI()
    register_exception_handlers(test_app)

    @test_app.get("/items")
    async def items(
        page: Annotated[
            int,
            Query(ge=0),
            ValidationMessages(min_value="ページ番号は0以上である必要があります"),
        ] = 0,
    ) -> dict[str, int]:
        """クエリパラメータの page をそのまま返す。

        Parameters
        ----------
        page : int
            ページ番号。

        Returns
        -------
        dict[str, int]
            page を含む辞書。
        """
        return {"page": page}

    @test_app.post("/samples")
    async def samples(request: _Sample) -> dict[str, str]:
        """リクエストの name をそのまま返す。

        Parameters
        ----------
        request : _Sample
            リクエストボディ。

        Returns
        -------
        dict[str, str]
            name を含む辞書。
        """
        return {"name": request.name}

    return test_app


@pytest.fixture
def client() -> AsyncClient:
    """テスト用アプリに接続する AsyncClient を用意する。

    Returns
    -------
    AsyncClient
        テスト用クライアント。
    """
    return AsyncClient(
        transport=ASGITransport(app=_create_app()), base_url="http://test"
    )


class TestValidationMessagesInApi:
    """ValidationMessages の API 経由のテスト"""

    async def test_query_parameter_uses_messages(self, client: AsyncClient) -> None:
        """クエリパラメータに添えた文言が、400のmessageになること"""
        async with client as c:
            response = await c.get("/items", params={"page": -1})

        assert response.status_code == 400
        assert response.json()["message"] == "ページ番号は0以上である必要があります"

    async def test_missing_body_field_uses_messages(self, client: AsyncClient) -> None:
        """ボディの項目の欠落が、指定した必須の文言で400になること"""
        async with client as c:
            response = await c.post("/samples", json={})

        assert response.status_code == 400
        assert response.json()["message"] == NAME_REQUIRED

    async def test_openapi_keeps_query_constraints(self) -> None:
        """OpenAPIのクエリパラメータに制約が残ること"""
        parameters = _create_app().openapi()["paths"]["/items"]["get"]["parameters"]

        assert parameters[0]["schema"]["minimum"] == 0


def _schema_models() -> list[type[BaseModel]]:
    """app.schemas 配下で定義された Pydantic モデルを集める。

    Returns
    -------
    list[type[BaseModel]]
        スキーマモデルのリスト。
    """
    models: list[type[BaseModel]] = []
    for module_info in pkgutil.iter_modules(app.schemas.__path__):
        module = importlib.import_module(f"app.schemas.{module_info.name}")
        models.extend(
            obj
            for _, obj in inspect.getmembers(module, inspect.isclass)
            if issubclass(obj, BaseModel) and obj.__module__ == module.__name__
        )
    return models


def test_schemas_with_messages_inherit_request_model() -> None:
    """文言を添えた項目を持つスキーマは、欠落も置き換えられるようRequestModelを継承していること"""
    missing_base = [
        model.__name__
        for model in _schema_models()
        if any(
            isinstance(metadata, ValidationMessages)
            for field in model.model_fields.values()
            for metadata in field.metadata
        )
        and not issubclass(model, RequestModel)
    ]

    assert missing_base == []
