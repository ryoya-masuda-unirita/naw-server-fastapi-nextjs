import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


class TestHealthRouter:
    """ヘルスチェックエンドポイントのテスト"""

    @pytest.mark.asyncio
    async def test_health_check_returns_ok(self) -> None:
        """ヘルスチェックが正常に返ること"""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
