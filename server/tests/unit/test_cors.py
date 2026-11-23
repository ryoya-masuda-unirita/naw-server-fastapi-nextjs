from httpx import Response, ASGITransport, AsyncClient

from app.main import app


async def _preflight(origin: str, request_headers: str = "content-type") -> Response:
    """指定オリジン・ヘッダーでのプリフライトリクエストを実アプリに送る。

    Parameters
    ----------
    origin : str
        `Origin` ヘッダーに設定する値。
    request_headers : str
        `Access-Control-Request-Headers` に設定する値。

    Returns
    -------
    Response
        アプリからのレスポンス。
    """
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        return await client.options(
            "/api/auth",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": request_headers,
            },
        )


class TestCorsMiddleware:
    """CORS ミドルウェアのテスト。"""

    async def test_allows_configured_origin(self) -> None:
        """許可オリジンからのプリフライトリクエストにAccess-Control-Allow-Originが返ること"""
        response = await _preflight("http://localhost:5173")

        assert (
            response.headers["access-control-allow-origin"] == "http://localhost:5173"
        )
        assert response.headers["access-control-allow-credentials"] == "true"

    async def test_rejects_unconfigured_origin(self) -> None:
        """許可されていないオリジンからのプリフライトリクエストには許可ヘッダーが付与されないこと"""
        response = await _preflight("http://evil.example.com")

        assert "access-control-allow-origin" not in response.headers

    async def test_allows_custom_tenant_header(self) -> None:
        """アプリが実際に送るX-Tenant-IDヘッダーがプリフライトで許可されること

        api-client.ts はテナントID判明後の全リクエストに X-Tenant-ID を付与し、
        バックエンドの認証系エンドポイントはこれを必須としている。CORS 側で
        この独自ヘッダーが許可されていないと、ブラウザがプリフライトの時点で
        リクエストをブロックしてしまう。
        """
        response = await _preflight(
            "http://localhost:5173", request_headers="content-type,x-tenant-id"
        )

        assert response.status_code == 200
