"""インデックス API の入力値の扱いを移植元（Spring）に揃えること（#253）。"""

import httpx
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from tests.conftest import FakeWahaClient
from tests.test_indexes_router import BASE, TENANT, get_file, insert_file


class TestEmptyStatusParam:
    async def test_list_files_with_empty_status(
        self,
        client: httpx.AsyncClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """`status=`（空文字）は Spring と同じく未指定として扱い、絞り込まないこと"""
        await insert_file(session_factory, "f1")
        res = await client.get(
            f"{BASE}/files",
            headers=TENANT,
            params={"page": 0, "size": 10, "status": ""},
        )
        assert res.status_code == 200
        assert [f["id"] for f in res.json()["content"]] == ["f1"]


class TestEmptyFormValues:
    async def test_update_without_file_sets_empty_strings(
        self,
        client: httpx.AsyncClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """PATCH で `displayName=` `reference=` を送ると、空文字で上書きすること"""
        await insert_file(session_factory, "f1")
        res = await client.patch(
            f"{BASE}/files/f1",
            headers=TENANT,
            data={"displayName": "", "reference": ""},
        )
        assert res.status_code == 200
        assert res.json()["displayName"] == ""
        assert res.json()["reference"] == ""
        file = await get_file(session_factory, "f1")
        assert file is not None
        assert file.display_name == ""
        assert file.reference == ""

    async def test_update_without_values_keeps_current(
        self,
        client: httpx.AsyncClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """PATCH で項目を送らなければ、今の値のままにすること"""
        await insert_file(session_factory, "f1", display_name="表示名")
        res = await client.patch(
            f"{BASE}/files/f1", headers=TENANT, data={"userId": "u"}
        )
        assert res.status_code == 200
        assert res.json()["displayName"] == "表示名"
        assert res.json()["reference"] == "ref"

    async def test_upload_keeps_empty_display_name(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """登録時の空文字の表示名は、None ではなく空文字で保存すること"""
        fake_waha.download_content = "f1\tp1"
        res = await client.post(
            f"{BASE}/files",
            headers=TENANT,
            data={"name": "a.txt", "displayName": "", "userId": "u"},
            files={"file": ("a.txt", b"x", "text/plain")},
        )
        assert res.status_code == 200
        file = await get_file(session_factory, "f1")
        assert file is not None
        assert file.display_name == ""


class TestRequiredFileFields:
    async def test_upload_without_name_returns_400(
        self, client: httpx.AsyncClient, fake_waha: FakeWahaClient
    ) -> None:
        """name のない登録は Waha! を呼ばずに 400 にすること（移植元は NOT NULL で失敗）"""
        res = await client.post(
            f"{BASE}/files",
            headers=TENANT,
            data={"userId": "u"},
            files={"file": ("a.txt", b"x", "text/plain")},
        )
        assert res.status_code == 400
        assert res.json()["message"] == "name が指定されていません"
        assert fake_waha.calls == []

    async def test_upload_without_user_id_returns_400(
        self, client: httpx.AsyncClient, fake_waha: FakeWahaClient
    ) -> None:
        """userId のない登録は Waha! を呼ばずに 400 にすること"""
        res = await client.post(
            f"{BASE}/files",
            headers=TENANT,
            data={"name": "a.txt"},
            files={"file": ("a.txt", b"x", "text/plain")},
        )
        assert res.status_code == 400
        assert res.json()["message"] == "userId が指定されていません"
        assert fake_waha.calls == []

    async def test_upload_with_empty_name_and_user_id(
        self, client: httpx.AsyncClient, fake_waha: FakeWahaClient
    ) -> None:
        """空文字の name・userId は移植元と同じく NOT NULL を満たすため登録できること"""
        fake_waha.download_content = "f1\tp1"
        res = await client.post(
            f"{BASE}/files",
            headers=TENANT,
            data={"name": "", "userId": ""},
            files={"file": ("a.txt", b"x", "text/plain")},
        )
        assert res.status_code == 200
        assert res.json()["name"] == ""
        assert res.json()["userId"] == ""

    async def test_replace_without_user_id_returns_400(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """ファイルを差し替える PATCH で userId がなければ Waha! を呼ばずに 400 にすること"""
        await insert_file(session_factory, "f1", part_ids=["p1"])
        res = await client.patch(
            f"{BASE}/files/f1",
            headers=TENANT,
            data={"name": "b.txt"},
            files={"file": ("b.txt", b"new", "text/plain")},
        )
        assert res.status_code == 400
        assert res.json()["message"] == "userId が指定されていません"
        assert fake_waha.calls == []
        assert await get_file(session_factory, "f1") is not None

    async def test_additional_learning_without_user_id_returns_400(
        self, client: httpx.AsyncClient, fake_waha: FakeWahaClient
    ) -> None:
        """userId のない追加学習は Waha! を呼ばずに 400 にすること"""
        res = await client.post(
            f"{BASE}/additionalLeaning",
            headers=TENANT,
            data={"feedbackId": "fb1"},
            files={"content": ("qa.md", b"# Q&A", "text/markdown")},
        )
        assert res.status_code == 400
        assert res.json()["message"] == "userId が指定されていません"
        assert fake_waha.calls == []

    async def test_sync_new_files_without_user_id_returns_400(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """同期で新しく登録するファイルがあり userId がなければ、保存せずに 400 にすること"""
        fake_waha.download_content = "C:\\docs\\a.txt\tp1\tf-new"
        res = await client.post(f"{BASE}/sync", headers=TENANT, json={})
        assert res.status_code == 400
        assert res.json()["message"] == "userId が指定されていません"
        assert await get_file(session_factory, "f-new") is None

    async def test_sync_existing_files_without_user_id(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """同期で新しく登録するファイルがなければ、userId がなくても成功すること（移植元と同じ）"""
        await insert_file(session_factory, "f1")
        fake_waha.download_content = "C:\\docs\\a.txt\tp1\tf1"
        res = await client.post(f"{BASE}/sync", headers=TENANT, json={})
        assert res.status_code == 204
