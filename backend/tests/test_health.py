import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


class TestHealthRouter:
    @pytest.mark.asyncio
    async def test_ヘルスチェックが正常に返ること(self):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
