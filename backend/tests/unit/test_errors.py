import time

import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel, field_validator

from app.core.errors import (
    DEFAULT_VALIDATION_MESSAGE,
    register_exception_handlers,
    validation_error_message,
)

ERROR_BODY_KEYS = {"timestamp", "message"}


class _NamedRequest(BaseModel):
    name: str
    count: int

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("名前は必須です")
        return value


def _create_app() -> FastAPI:
    test_app = FastAPI()
    register_exception_handlers(test_app)

    @test_app.get("/conflict")
    async def conflict() -> None:
        raise HTTPException(status_code=409, detail="使用中です")

    @test_app.get("/with-header")
    async def with_header() -> None:
        raise HTTPException(
            status_code=401, detail="認証が必要です", headers={"X-Test": "1"}
        )

    @test_app.get("/not-modified")
    async def not_modified() -> None:
        raise HTTPException(status_code=304)

    @test_app.get("/items")
    async def items(page: int) -> dict[str, int]:
        return {"page": page}

    @test_app.post("/named")
    async def named(request: _NamedRequest) -> dict[str, str]:
        return {"name": request.name}

    return test_app


@pytest.fixture
def client() -> AsyncClient:
    return AsyncClient(
        transport=ASGITransport(app=_create_app()), base_url="http://test"
    )


class TestHttpExceptionHandler:
    async def test_http_exception_returns_message_body(self, client):
        """業務エラーは指定したステータスのまま、移植元と同じ{timestamp, message}で返ること"""
        before = int(time.time())
        async with client as c:
            response = await c.get("/conflict")
        after = int(time.time())

        assert response.status_code == 409
        body = response.json()
        assert set(body) == ERROR_BODY_KEYS
        assert body["message"] == "使用中です"
        assert isinstance(body["timestamp"], int)
        assert before <= body["timestamp"] <= after

    async def test_http_exception_keeps_headers(self, client):
        """業務エラーで指定したヘッダーが応答に付くこと"""
        async with client as c:
            response = await c.get("/with-header")

        assert response.status_code == 401
        assert response.headers["X-Test"] == "1"
        assert response.json()["message"] == "認証が必要です"

    async def test_http_exception_without_body_status(self, client):
        """本文を持てないステータスは本文なしで返ること"""
        async with client as c:
            response = await c.get("/not-modified")

        assert response.status_code == 304
        assert response.content == b""

    async def test_unknown_path_returns_404_message(self, client):
        """存在しないURLは404で{timestamp, message}を返すこと"""
        async with client as c:
            response = await c.get("/unknown")

        assert response.status_code == 404
        body = response.json()
        assert set(body) == ERROR_BODY_KEYS
        assert body["message"] == "Not Found"

    async def test_method_not_allowed_returns_405_message(self, client):
        """許可されていないメソッドは405でAllowヘッダーと{timestamp, message}を返すこと"""
        async with client as c:
            response = await c.post("/conflict")

        assert response.status_code == 405
        assert response.headers["Allow"] == "GET"
        assert response.json()["message"] == "Method Not Allowed"


class TestRequestValidationErrorHandler:
    async def test_missing_body_field_returns_400(self, client):
        """ボディの必須項目がないと422ではなく400で{timestamp, message}を返すこと"""
        async with client as c:
            response = await c.post("/named", json={"name": "a"})

        assert response.status_code == 400
        body = response.json()
        assert set(body) == ERROR_BODY_KEYS
        assert body["message"] == "Field required"

    async def test_returns_only_first_validation_error(self, client):
        """複数の項目がエラーでも連結せず最初の1件のメッセージだけを返すこと"""
        async with client as c:
            response = await c.post("/named", json={"name": "   ", "count": "x"})

        assert response.status_code == 400
        assert response.json()["message"] == "名前は必須です"

    async def test_value_error_message_has_no_prefix(self, client):
        """独自チェックの日本語メッセージが接頭辞なしで返ること"""
        async with client as c:
            response = await c.post("/named", json={"name": "   ", "count": 1})

        assert response.status_code == 400
        assert response.json()["message"] == "名前は必須です"

    async def test_invalid_query_returns_400(self, client):
        """クエリの型が違うと400になること"""
        async with client as c:
            response = await c.get("/items", params={"page": "x"})

        assert response.status_code == 400
        assert set(response.json()) == ERROR_BODY_KEYS

    async def test_invalid_json_body_returns_400(self, client):
        """JSONとして読めないボディは400になること"""
        async with client as c:
            response = await c.post(
                "/named",
                content=b"{invalid",
                headers={"Content-Type": "application/json"},
            )

        assert response.status_code == 400
        assert response.json()["message"].startswith("JSON decode error")


class TestValidationErrorMessage:
    def test_validation_error_message_falls_back_when_empty(self):
        """エラー一覧が空なら「リクエストが不正です」を返すこと"""
        assert validation_error_message([]) == DEFAULT_VALIDATION_MESSAGE
