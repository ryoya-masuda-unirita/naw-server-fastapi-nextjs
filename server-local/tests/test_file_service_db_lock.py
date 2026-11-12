"""Waha! の処理を待つ間に SQLite の書き込みロックを持ち続けないこと（#251）。

SQLite は WAL モードでも書き込みが 1 本しかできない。学習ファイルの登録・差し替え・
削除で Waha! のジョブ完了を待つ間、別のリクエスト（チャットの回答保存など）が
DB に書き込めることを確かめる。
"""

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import MessageContent
from tests.conftest import FakeWahaClient
from tests.test_indexes_router import (
    BASE,
    TENANT,
    get_file,
    get_part_ids,
    insert_file,
)


class ConcurrentWriter:
    """別セッションから DB に書き込み、ロック待ちせずに成功したかを記録する。"""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory
        self.results: list[bool] = []

    async def write(self) -> None:
        number = len(self.results)
        async with self._session_factory() as session:
            # ロックされていたら 5 秒待たずに即座に失敗させる
            await session.execute(text("PRAGMA busy_timeout=0"))
            session.add(
                MessageContent(
                    id=f"concurrent-{number}",
                    message_id=f"concurrent-message-{number}",
                    status="OK",
                    question="質問",
                    answer="回答",
                )
            )
            try:
                await session.commit()
            except Exception:
                await session.rollback()
                self.results.append(False)
                raise
            self.results.append(True)


class TestDbLockWhileWaitingWaha:
    async def test_update_with_file_does_not_lock_db(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """ファイル差し替えで Waha! の削除・登録を待つ間も、別セッションで書き込めること"""
        await insert_file(session_factory, "f1", part_ids=["p1"])
        writer = ConcurrentWriter(session_factory)
        fake_waha.on_get_results = writer.write
        fake_waha.download_content = "f-new\tq1"
        res = await client.patch(
            f"{BASE}/files/f1",
            headers=TENANT,
            data={"name": "b.txt", "displayName": "差し替え", "userId": "u"},
            files={"file": ("b.txt", b"new", "text/plain")},
        )
        assert res.status_code == 200
        # 削除ジョブと登録ジョブの両方の完了待ちで書き込めた
        assert writer.results == [True, True]
        assert await get_file(session_factory, "f1") is None
        assert await get_part_ids(session_factory, "f-new") == ["q1"]

    async def test_create_file_does_not_lock_db(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """新規登録で Waha! の学習ジョブを待つ間も、別セッションで書き込めること"""
        writer = ConcurrentWriter(session_factory)
        fake_waha.on_get_results = writer.write
        fake_waha.download_content = "f1\tp1"
        res = await client.post(
            f"{BASE}/files",
            headers=TENANT,
            data={"name": "a.txt", "userId": "u"},
            files={"file": ("a.txt", b"x", "text/plain")},
        )
        assert res.status_code == 200
        assert writer.results == [True]

    async def test_delete_file_does_not_lock_db(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """削除で Waha! の削除ジョブを待つ間も、別セッションで書き込めること"""
        await insert_file(session_factory, "f1", part_ids=["p1"])
        writer = ConcurrentWriter(session_factory)
        fake_waha.on_get_results = writer.write
        res = await client.request(
            "DELETE", f"{BASE}/files/f1", json={"physicalDelete": True}
        )
        assert res.status_code == 204
        assert writer.results == [True]
        assert await get_file(session_factory, "f1") is None

    async def test_update_when_file_deleted_while_waiting(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """Waha! を待つ間に別リクエストで元のファイルが消されても、差し替えが完了すること"""
        await insert_file(session_factory, "f1", part_ids=["p1"])

        async def delete_original() -> None:
            async with session_factory() as session:
                await session.execute(text("DELETE FROM files WHERE id = 'f1'"))
                await session.commit()

        fake_waha.on_get_results = delete_original
        fake_waha.download_content = "f-new\tq1"
        res = await client.patch(
            f"{BASE}/files/f1",
            headers=TENANT,
            data={"name": "b.txt", "userId": "u"},
            files={"file": ("b.txt", b"new", "text/plain")},
        )
        assert res.status_code == 200
        assert res.json()["id"] == "f-new"
        assert await get_file(session_factory, "f1") is None
