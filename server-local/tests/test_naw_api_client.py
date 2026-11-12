import json
from collections.abc import Callable

import httpx
import pytest

from app.clients.naw_api_client import NawApiClient, NawApiError


def make_client(
    handler: Callable[[httpx.Request], httpx.Response],
    base_url: str = "http://naw.test/",
) -> tuple[NawApiClient, httpx.AsyncClient]:
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return NawApiClient(base_url=base_url, http_client=http), http


async def test_create_library_stub() -> None:
    """POST /api/libraries を Bearer・テナントヘッダー付きで呼び、data.id を返すこと"""
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"data": {"id": "lib-1"}})

    client, http = make_client(handler)
    async with http:
        assert await client.create_library_stub("msg-1", "tok", "tenant-1") == "lib-1"
    request = requests[0]
    assert request.method == "POST"
    assert str(request.url) == "http://naw.test/api/libraries"
    assert request.headers["authorization"] == "Bearer tok"
    assert request.headers["x-tenant-id"] == "tenant-1"
    assert json.loads(request.content) == {"messageId": "msg-1"}


async def test_create_library_stub_without_id() -> None:
    """応答に data.id がなければエラーにすること"""
    client, http = make_client(lambda _r: httpx.Response(200, json={"data": {}}))
    async with http:
        with pytest.raises(NawApiError, match="id がありません"):
            await client.create_library_stub("m", "tok", None)


async def test_update_library_title() -> None:
    """PATCH /api/libraries/{id}/title を呼び、テナント未指定ならヘッダーを付けないこと"""
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(204)

    client, http = make_client(handler)
    async with http:
        await client.update_library_title("lib-1", "タイトル", "tok", None)
    request = requests[0]
    assert request.method == "PATCH"
    assert str(request.url) == "http://naw.test/api/libraries/lib-1/title"
    assert "x-tenant-id" not in request.headers
    assert json.loads(request.content) == {"title": "タイトル"}


async def test_missing_base_url() -> None:
    """NAW の URL が未設定ならエラーにすること"""
    client, http = make_client(lambda _r: httpx.Response(200), base_url="")
    async with http:
        with pytest.raises(NawApiError, match="naw.base-url"):
            await client.create_library_stub("m", "tok", None)


async def test_missing_access_token() -> None:
    """accessToken がなければエラーにすること"""
    client, http = make_client(lambda _r: httpx.Response(200))
    async with http:
        with pytest.raises(NawApiError, match="accessToken"):
            await client.update_library_title("lib", "t", " ", None)


async def test_http_error() -> None:
    """NAW がエラーを返したら状態と本文を含むエラーにすること"""
    client, http = make_client(lambda _r: httpx.Response(403, text="forbidden"))
    async with http:
        with pytest.raises(NawApiError, match="status=403, body=forbidden"):
            await client.create_library_stub("m", "tok", None)
