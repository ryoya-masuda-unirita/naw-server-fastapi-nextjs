"""移植元と同じ`multipart/form-data`（`textData`パート＋添付ファイルパート）の解釈。

移植元は`@RequestPart("textData")`でリクエスト本体(JSON)を、別パートで添付ファイルを
受け取る。送信API（`MessageContentCreateRequest`、issue-182）と汎用チャットAPI
（`LlmChatRequest`、issue-224）が同じ受け取り方をするため、ここに共通化する。
"""

import base64
from typing import Any

from fastapi import UploadFile
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, TypeAdapter, ValidationError

# アップロードされたファイルにContent-Typeが付いていない場合の既定値。
_DEFAULT_ATTACHMENT_CONTENT_TYPE = "application/octet-stream"

# `textData`をJSONオブジェクトとして解釈する。不正なJSON・不正なUTF-8・オブジェクト
# 以外は、いずれもValidationErrorとして検出される。
_TEXT_DATA_ADAPTER: TypeAdapter[dict[str, Any]] = TypeAdapter(dict[str, Any])


def _to_request_validation_error(error: ValidationError) -> RequestValidationError:
    """`textData`の検証エラーを、ボディの入力エラー(400)へ変換する。

    依存関数内で発生したValidationErrorはFastAPIが入力エラーとして扱わず500に
    なるため明示的に変換する。locはログで原因箇所を特定できるよう
    `("body", "textData", ...)`に揃え、`input`は含めない（モデル単位のエラーでは
    添付ファイルを含むリクエスト全体が入り、例外が肥大化するため）。

    Parameters
    ----------
    error : ValidationError
        `textData`の解釈・検証で発生したエラー。

    Returns
    -------
    RequestValidationError
        共通の例外ハンドラ（`app.core.errors`）が400として返す入力エラー。
    """
    return RequestValidationError(
        [
            {
                "type": detail["type"],
                "loc": ("body", "textData", *detail["loc"]),
                "msg": detail["msg"],
            }
            for detail in error.errors(include_url=False)
        ]
    )


async def _to_attachment_payload(upload: UploadFile) -> dict[str, object]:
    """アップロードファイルを`AttachmentFile`の入力形式へ変換する。

    `AttachmentFile.data`は`Base64Bytes`型で、検証時にBase64をデコードして生の
    バイト列を保持する。そのため生のバイト列をBase64エンコードして渡す。

    Parameters
    ----------
    upload : UploadFile
        multipartで受け取ったファイル。

    Returns
    -------
    dict[str, object]
        `AttachmentFile`として検証できる辞書。
    """
    data = await upload.read()
    return {
        "name": upload.filename or "",
        "type": upload.content_type or _DEFAULT_ATTACHMENT_CONTENT_TYPE,
        "data": base64.b64encode(data),
    }


async def parse_text_data_form[ModelT: BaseModel](
    model: type[ModelT],
    text_data: UploadFile | str,
    file_parts: dict[str, list[UploadFile] | None],
) -> ModelT:
    """`textData`パートと添付ファイルパートを、指定したリクエストモデルへ変換する。

    クライアントは`textData`を`application/json`のBlobとして送るためファイルパート
    (`UploadFile`)として届くが、通常のフォーム値として送られた場合も受け付ける。

    Parameters
    ----------
    model : type[ModelT]
        検証先のリクエストモデル。
    text_data : UploadFile | str
        リクエスト本体(JSON)。
    file_parts : dict[str, list[UploadFile] | None]
        添付ファイルパート（モデルの項目名 → 受け取ったファイル一覧）。

    Returns
    -------
    ModelT
        検証済みのリクエスト。

    Raises
    ------
    RequestValidationError
        `textData`がUTF-8のJSONオブジェクトとして解釈できない
        場合、または項目の検証に失敗した場合（いずれも400）。
    """
    raw_text_data = (
        text_data.encode("utf-8")
        if isinstance(text_data, str)
        else await text_data.read()
    )
    try:
        payload: dict[str, Any] = _TEXT_DATA_ADAPTER.validate_json(raw_text_data)
        for field_name, uploads in file_parts.items():
            payload[field_name] = [
                await _to_attachment_payload(upload) for upload in uploads or []
            ]
        return model.model_validate(payload)
    except ValidationError as e:
        raise _to_request_validation_error(e) from e
