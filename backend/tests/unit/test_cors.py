from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from httpx import ASGITransport, AsyncClient


def _build_test_app(allowed_origins: list[str]) -> FastAPI:
    """CORSMiddleware のみを組み込んだ検証用アプリを作る。

    app.main の実アプリは Settings 経由で DB 接続設定等も要求するため、
    CORS 設定単体の振る舞いを確認するにはミドルウェアの組み込みロジックを
    そのまま再現した最小アプリを使うほうが単体テストとして安定する。
    """
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.get("/api/auth")
    async def get_auth() -> dict[str, str]:
        return {"status": "ok"}

    return app


class TestCorsMiddleware:
    async def test_allows_configured_origin(self):
        """許可オリジンからのプリフライトリクエストにAccess-Control-Allow-Originが返ること"""
        app = _build_test_app(["http://localhost:5173"])

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.options(
                "/api/auth",
                headers={
                    "Origin": "http://localhost:5173",
                    "Access-Control-Request-Method": "GET",
                },
            )

        assert (
            response.headers["access-control-allow-origin"]
            == "http://localhost:5173"
        )

    async def test_rejects_unconfigured_origin(self):
        """許可されていないオリジンからのプリフライトリクエストには許可ヘッダーが付与されないこと"""
        app = _build_test_app(["http://localhost:5173"])

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.options(
                "/api/auth",
                headers={
                    "Origin": "http://evil.example.com",
                    "Access-Control-Request-Method": "GET",
                },
            )

        assert "access-control-allow-origin" not in response.headers

    async def test_allows_credentials(self):
        """Access-Control-Allow-Credentials: trueが返ること"""
        app = _build_test_app(["http://localhost:5173"])

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.options(
                "/api/auth",
                headers={
                    "Origin": "http://localhost:5173",
                    "Access-Control-Request-Method": "GET",
                },
            )

        assert response.headers["access-control-allow-credentials"] == "true"
