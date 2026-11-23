from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx

from app.core.config import Settings
from tests.conftest import AUTH_HEADERS, make_settings


async def test_hello_without_auth_key(client: httpx.AsyncClient) -> None:
    """稼働確認 API は認証キーなしで固定文言を返すこと"""
    res = await client.get("/api/hello", headers={"X-SERVER-AUTH-KEY": ""})
    assert res.status_code == 200
    assert res.text == "APIサーバは稼働中です。"
    assert res.headers["content-type"].startswith("text/plain")


async def test_valid_auth_key(client: httpx.AsyncClient) -> None:
    """正しい認証キーなら業務 API が応答すること"""
    res = await client.post("/api/messages/contents", json={"messageIds": []})
    assert res.status_code == 200
    assert res.json() == []


async def test_missing_auth_key_returns_401(client: httpx.AsyncClient) -> None:
    """認証キーがなければ 401（Spring 既定形式）になること"""
    del client.headers["X-SERVER-AUTH-KEY"]
    res = await client.post("/api/messages/contents", json={"messageIds": []})
    assert res.status_code == 401
    body = res.json()
    assert body["status"] == 401
    assert body["error"] == "Unauthorized"
    assert body["path"] == "/api/messages/contents"
    assert "timestamp" in body


async def test_invalid_auth_key_returns_401(client: httpx.AsyncClient) -> None:
    """認証キーが誤っていれば 401 になること"""
    res = await client.get(
        "/api/libraries/x/content", headers={"X-SERVER-AUTH-KEY": "wrong-key"}
    )
    assert res.status_code == 401


async def test_unauthorized_response_has_cors_header(
    client: httpx.AsyncClient,
) -> None:
    """401 にも CORS ヘッダーが付き、ブラウザから読めること"""
    res = await client.get(
        "/api/libraries/x/content",
        headers={"X-SERVER-AUTH-KEY": "wrong", "Origin": "https://naw.example.com"},
    )
    assert res.status_code == 401
    assert res.headers["access-control-allow-origin"] == "https://naw.example.com"


async def test_preflight_without_auth_key(client: httpx.AsyncClient) -> None:
    """プリフライトは認証なしで全オリジン・資格情報ありを許可すること"""
    del client.headers["X-SERVER-AUTH-KEY"]
    res = await client.options(
        "/api/messages/content",
        headers={
            "Origin": "https://naw.example.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-server-auth-key,content-type",
        },
    )
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == "https://naw.example.com"
    assert res.headers["access-control-allow-credentials"] == "true"
    assert "x-server-auth-key" in res.headers["access-control-allow-headers"].lower()


async def test_context_path(
    tmp_path: Path, app_factory: Callable[[Settings], Any]
) -> None:
    """コンテキストパス配下で応答し、稼働確認は認証不要になること"""
    app = app_factory(make_settings(tmp_path, CONTEXT_PATH="secuaigent/"))
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            hello = await client.get("/secuaigent/api/hello")
            assert hello.status_code == 200
            not_found = await client.get(
                "/api/libraries/x/content", headers=AUTH_HEADERS
            )
            assert not_found.status_code == 404
            unauthorized = await client.get("/secuaigent/api/libraries/x/content")
            assert unauthorized.status_code == 401
            authorized = await client.get(
                "/secuaigent/api/libraries/x/content", headers=AUTH_HEADERS
            )
            assert authorized.status_code == 404
            assert authorized.json()["message"] == "対象データが見つかりません"


async def test_missing_tenant_header_returns_400(client: httpx.AsyncClient) -> None:
    """必須ヘッダー（X-Tenant-ID）がなければ 422 ではなく 400 になること"""
    res = await client.get("/api/admin/indexes/idx/files?page=0&size=10")
    assert res.status_code == 400
    assert res.json()["error"] == "Bad Request"


async def test_unknown_route_returns_spring_style_404(
    client: httpx.AsyncClient,
) -> None:
    """存在しないパスは Spring 既定形式の 404 になること"""
    res = await client.get("/api/unknown")
    assert res.status_code == 404
    assert res.json()["error"] == "Not Found"
