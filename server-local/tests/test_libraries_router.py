import httpx
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import LibraryContent
from app.services import library_content_service


async def test_get_library_content(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    """保存済みのライブラリ本文を {"data": 本文} で返すこと"""
    async with session_factory() as session:
        await library_content_service.save_content(session, "lib-1", "# 本文")
    res = await client.get("/api/libraries/lib-1/content")
    assert res.status_code == 200
    assert res.json() == {"data": "# 本文"}


async def test_get_library_content_not_found(client: httpx.AsyncClient) -> None:
    """存在しないライブラリは 404 と ErrorResponse を返すこと"""
    res = await client.get("/api/libraries/missing/content")
    assert res.status_code == 404
    body = res.json()
    assert body["message"] == "対象データが見つかりません"
    assert isinstance(body["timestamp"], int)


async def test_delete_library_content(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    """ライブラリ本文を削除でき、存在しなくても 204 になること"""
    async with session_factory() as session:
        await library_content_service.save_content(session, "lib-1", "本文")
    res = await client.delete("/api/libraries/lib-1")
    assert res.status_code == 204
    async with session_factory() as session:
        assert await session.get(LibraryContent, "lib-1") is None
    res = await client.delete("/api/libraries/lib-1")
    assert res.status_code == 204


async def test_save_content_upsert(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """既存のライブラリ本文は上書きし、None は空文字で保存すること"""
    async with session_factory() as session:
        await library_content_service.save_content(session, "lib-1", "初版")
        await library_content_service.save_content(session, "lib-1", None)
    async with session_factory() as session:
        entity = await session.get(LibraryContent, "lib-1")
        assert entity is not None
        assert entity.content == ""
