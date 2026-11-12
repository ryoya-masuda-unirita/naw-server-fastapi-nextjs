from datetime import datetime, timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import File, FilePart, FileStatus
from tests.conftest import FakeWahaClient

BASE = "/api/admin/indexes/idx-1"
TENANT = {"X-Tenant-ID": "tenant-1"}


async def insert_file(
    session_factory: async_sessionmaker[AsyncSession],
    file_id: str,
    *,
    tenant_id: str = "tenant-1",
    index_id: str = "idx-1",
    display_name: str = "表示名",
    user_id: str = "user-1",
    status: FileStatus = FileStatus.ENABLE,
    updated_at: datetime | None = None,
    part_ids: list[str] | None = None,
) -> None:
    async with session_factory() as session:
        file = File(
            id=file_id,
            tenant_id=tenant_id,
            name=f"{file_id}.txt",
            display_name=display_name,
            reference="ref",
            status=int(status),
            user_id=user_id,
            index_id=index_id,
        )
        if updated_at is not None:
            file.updated_at = updated_at
        session.add(file)
        await session.flush()
        for part_id in part_ids or []:
            session.add(FilePart(id=part_id, tenant_id=tenant_id, file_id=file_id))
        await session.commit()


async def get_file(
    session_factory: async_sessionmaker[AsyncSession], file_id: str
) -> File | None:
    async with session_factory() as session:
        return await session.get(File, file_id)


async def get_part_ids(
    session_factory: async_sessionmaker[AsyncSession], file_id: str
) -> list[str]:
    async with session_factory() as session:
        result = await session.execute(
            select(FilePart.id).where(FilePart.file_id == file_id)
        )
        return sorted(result.scalars().all())


class TestListFiles:
    async def test_list_files_filters_and_page_format(
        self,
        client: httpx.AsyncClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """テナント・インデックスと各条件で絞り込み、Page 形式で返すこと"""
        await insert_file(
            session_factory, "f1", display_name="議事録A", part_ids=["p1"]
        )
        await insert_file(session_factory, "f2", display_name="議事録B", user_id="u2")
        await insert_file(session_factory, "f3", display_name="仕様書")
        await insert_file(session_factory, "f4", status=FileStatus.DELETED)
        await insert_file(session_factory, "f5", tenant_id="other")
        await insert_file(session_factory, "f6", index_id="idx-2")

        res = await client.get(
            f"{BASE}/files",
            params={"page": 0, "size": 10, "displayName": "議事録", "status": "ENABLE"},
            headers=TENANT,
        )
        assert res.status_code == 200
        body = res.json()
        assert [f["id"] for f in body["content"]] == ["f1", "f2"]
        assert body["totalElements"] == 2
        assert body["totalPages"] == 1
        assert body["number"] == 0
        assert body["size"] == 10
        assert body["first"] is True
        assert body["last"] is True
        assert body["numberOfElements"] == 2
        assert body["empty"] is False
        assert body["pageable"]["pageNumber"] == 0
        assert body["pageable"]["offset"] == 0
        assert body["sort"] == {"empty": True, "sorted": False, "unsorted": True}

        file = body["content"][0]
        assert list(file) == [
            "id",
            "tenantId",
            "name",
            "displayName",
            "reference",
            "status",
            "userId",
            "indexId",
            "storageUrl",
            "feedbackId",
            "roomId",
            "createdAt",
            "updatedAt",
            "fileParts",
        ]
        assert file["status"] == "ENABLE"
        assert file["createdAt"].endswith("Z")
        assert [p["id"] for p in file["fileParts"]] == ["p1"]
        assert file["fileParts"][0]["fileId"] == "f1"

        res = await client.get(
            f"{BASE}/files",
            params={"page": 0, "size": 10, "userId": "u2"},
            headers=TENANT,
        )
        assert [f["id"] for f in res.json()["content"]] == ["f2"]

    async def test_list_files_paging(
        self,
        client: httpx.AsyncClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """ページングの各値が Spring の Page と一致すること"""
        for i in range(5):
            await insert_file(session_factory, f"f{i}")
        res = await client.get(
            f"{BASE}/files", params={"page": 1, "size": 2}, headers=TENANT
        )
        body = res.json()
        assert [f["id"] for f in body["content"]] == ["f2", "f3"]
        assert body["totalPages"] == 3
        assert body["first"] is False
        assert body["last"] is False
        assert body["pageable"]["offset"] == 2

    async def test_list_files_date_range(
        self,
        client: httpx.AsyncClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """更新日の範囲（yyyy-MM-dd、ローカル時刻の 0 時）で絞り込むこと"""
        old = datetime(2020, 1, 1)
        await insert_file(session_factory, "old", updated_at=old)
        await insert_file(session_factory, "new")
        today = datetime.now().date()
        res = await client.get(
            f"{BASE}/files",
            params={
                "page": 0,
                "size": 10,
                "updatedAtFrom": str(today - timedelta(days=1)),
                "updatedAtTo": str(today + timedelta(days=1)),
            },
            headers=TENANT,
        )
        assert [f["id"] for f in res.json()["content"]] == ["new"]

    @pytest.mark.parametrize(
        ("params", "status"),
        [
            ({"page": -1, "size": 10}, 400),
            ({"page": 0, "size": 0}, 400),
            ({"page": 0}, 400),
            ({"page": 0, "size": 10, "status": "UNKNOWN"}, 400),
            ({"page": 0, "size": 10, "updatedAtFrom": "2024/01/01"}, 400),
        ],
    )
    async def test_list_files_invalid_params_returns_400(
        self, client: httpx.AsyncClient, params: dict[str, object], status: int
    ) -> None:
        """不正なページ指定・状態・日付は 400 になること"""
        res = await client.get(f"{BASE}/files", params=params, headers=TENANT)
        assert res.status_code == status


class TestUploadFile:
    async def test_upload_file(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """Waha! の学習ジョブ結果（TSV）からファイルとパートを保存して返すこと"""
        fake_waha.download_content = '"file-1"\t"part-1"\r\nfile-1\tpart-2\r\n'
        res = await client.post(
            f"{BASE}/files",
            headers=TENANT,
            data={
                "creationServiceName": "create-svc",
                "name": "doc.pdf",
                "displayName": "資料",
                "reference": "/docs",
                "splitLength": "1000",
                "userId": "user-1",
            },
            files={"file": ("doc.pdf", b"%PDF", "application/pdf")},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["id"] == "file-1"
        assert body["displayName"] == "資料"
        assert body["status"] == "ENABLE"
        assert sorted(p["id"] for p in body["fileParts"]) == ["part-1", "part-2"]
        assert fake_waha.call_names() == [
            "start_session",
            "upload_file",
            "execute_learning",
            "get_results",
            "download_file",
            "end_session",
        ]
        assert fake_waha.calls[2][1] == ("session-1", "create-svc", "1000", "/docs")
        assert fake_waha.uploads[0].slot == "file"
        assert fake_waha.uploads[0].filename == "doc.pdf"
        assert await get_part_ids(session_factory, "file-1") == ["part-1", "part-2"]

    async def test_upload_file_with_bom(
        self, client: httpx.AsyncClient, fake_waha: FakeWahaClient
    ) -> None:
        """TSV 先頭の BOM を取り除くこと"""
        fake_waha.download_content = "\ufefffile-1\tpart-1"
        res = await client.post(
            f"{BASE}/files",
            headers=TENANT,
            data={"name": "a.txt", "userId": "u"},
            files={"file": ("a.txt", b"x", "text/plain")},
        )
        assert res.status_code == 200
        assert res.json()["id"] == "file-1"

    async def test_upload_file_empty_tsv_returns_500(
        self, client: httpx.AsyncClient, fake_waha: FakeWahaClient
    ) -> None:
        """Waha! の結果が空なら 500 になり、セッションは終了すること"""
        fake_waha.download_content = ""
        res = await client.post(
            f"{BASE}/files",
            headers=TENANT,
            data={"name": "a.txt", "userId": "u"},
            files={"file": ("a.txt", b"x", "text/plain")},
        )
        assert res.status_code == 500
        assert fake_waha.call_names()[-1] == "end_session"

    async def test_upload_file_without_file_returns_400(
        self, client: httpx.AsyncClient, fake_waha: FakeWahaClient
    ) -> None:
        """ファイル未添付なら Waha! を呼ばずに 400 を返すこと"""
        res = await client.post(
            f"{BASE}/files", headers=TENANT, data={"name": "a.txt", "userId": "u"}
        )
        assert res.status_code == 400
        assert res.json()["message"] == "ファイルが指定されていません"
        assert fake_waha.calls == []

    async def test_upload_file_job_failure_returns_500(
        self, client: httpx.AsyncClient, fake_waha: FakeWahaClient
    ) -> None:
        """Waha! のジョブ失敗は 500 と ErrorResponse になること"""
        fake_waha.fail_on = {"get_results"}
        res = await client.post(
            f"{BASE}/files",
            headers=TENANT,
            data={"name": "a.txt", "userId": "u"},
            files={"file": ("a.txt", b"x", "text/plain")},
        )
        assert res.status_code == 500
        assert res.json()["message"] == "get_results failed"


class TestUpdateFile:
    async def test_update_without_file(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """ファイルなしなら表示名・参照先だけを更新し Waha! は呼ばないこと"""
        await insert_file(session_factory, "f1", part_ids=["p1"])
        res = await client.patch(
            f"{BASE}/files/f1", headers=TENANT, data={"displayName": "新しい名前"}
        )
        assert res.status_code == 200
        body = res.json()
        assert body["displayName"] == "新しい名前"
        assert body["reference"] == "ref"
        assert fake_waha.calls == []

    async def test_update_without_file_not_found(
        self, client: httpx.AsyncClient
    ) -> None:
        """存在しないファイルの更新は 404 になること"""
        res = await client.patch(
            f"{BASE}/files/none", headers=TENANT, data={"displayName": "x"}
        )
        assert res.status_code == 404
        assert res.json()["message"] == "ファイルが存在しません。"

    async def test_update_with_file(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """ファイルありなら Waha! で削除してから登録し直すこと"""
        await insert_file(session_factory, "f1", part_ids=["p1", "p2"])
        fake_waha.download_content = "f-new\tq1"
        res = await client.patch(
            f"{BASE}/files/f1",
            headers=TENANT,
            data={
                "creationServiceName": "create",
                "deletionServiceName": "delete",
                "name": "b.txt",
                "displayName": "差し替え",
                "userId": "u",
            },
            files={"file": ("b.txt", b"new", "text/plain")},
        )
        assert res.status_code == 200
        assert res.json()["id"] == "f-new"
        assert await get_file(session_factory, "f1") is None
        assert ("execute", ("session-1", "delete")) in fake_waha.calls
        delete_upload = fake_waha.uploads[0]
        assert delete_upload.content == b"p1\np2\n"
        assert delete_upload.filename.startswith("ids")

    async def test_update_with_same_ids_recreates_parts(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """差し替え後に Waha! が同じファイル ID・パート ID を返してもパートが残ること"""
        await insert_file(session_factory, "f1", user_id="owner", part_ids=["p1", "p2"])
        fake_waha.download_content = "f1\tp1\r\nf1\tp2"
        res = await client.patch(
            f"{BASE}/files/f1",
            headers=TENANT,
            data={"name": "b.txt", "displayName": "差し替え", "userId": "u2"},
            files={"file": ("b.txt", b"new", "text/plain")},
        )
        assert res.status_code == 200
        assert sorted(p["id"] for p in res.json()["fileParts"]) == ["p1", "p2"]
        assert await get_part_ids(session_factory, "f1") == ["p1", "p2"]
        file = await get_file(session_factory, "f1")
        assert file is not None
        assert file.display_name == "差し替え"

    async def test_update_with_file_rolls_back_delete_on_failure(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """再登録に失敗したら削除も取り消し、元のファイルとパートが残ること"""
        await insert_file(session_factory, "f1", part_ids=["p1"])
        fake_waha.fail_on = {"execute_learning"}
        res = await client.patch(
            f"{BASE}/files/f1",
            headers=TENANT,
            data={"name": "b.txt", "userId": "u"},
            files={"file": ("b.txt", b"new", "text/plain")},
        )
        assert res.status_code == 500
        assert await get_file(session_factory, "f1") is not None
        assert await get_part_ids(session_factory, "f1") == ["p1"]

    async def test_upload_existing_file_keeps_user_id(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """既存のファイル ID で登録し直しても登録者（user_id）は変えないこと"""
        await insert_file(session_factory, "f1", user_id="owner")
        fake_waha.download_content = "f1\tp9"
        res = await client.post(
            f"{BASE}/files",
            headers=TENANT,
            data={"name": "a.txt", "displayName": "再登録", "userId": "other"},
            files={"file": ("a.txt", b"x", "text/plain")},
        )
        assert res.status_code == 200
        assert res.json()["userId"] == "owner"
        assert res.json()["displayName"] == "再登録"


class TestDeleteFile:
    async def test_delete_physical(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """物理削除ではファイルとパートを削除すること"""
        await insert_file(session_factory, "f1", part_ids=["p1"])
        res = await client.request(
            "DELETE",
            f"{BASE}/files/f1",
            json={"deletionServiceName": "del", "physicalDelete": True},
        )
        assert res.status_code == 204
        assert await get_file(session_factory, "f1") is None
        assert await get_part_ids(session_factory, "f1") == []
        assert fake_waha.call_names() == [
            "start_session",
            "upload_file",
            "execute",
            "get_results",
            "end_session",
        ]

    async def test_delete_logical(
        self,
        client: httpx.AsyncClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """論理削除（physicalDelete 省略）では状態を DELETED にすること"""
        await insert_file(session_factory, "f1", part_ids=["p1"])
        res = await client.request(
            "DELETE", f"{BASE}/files/f1", json={"deletionServiceName": "del"}
        )
        assert res.status_code == 204
        file = await get_file(session_factory, "f1")
        assert file is not None
        assert file.status == FileStatus.DELETED

    async def test_delete_not_found(
        self, client: httpx.AsyncClient, fake_waha: FakeWahaClient
    ) -> None:
        """存在しないファイルの削除は 404 になり Waha! は呼ばないこと"""
        res = await client.request("DELETE", f"{BASE}/files/none", json={})
        assert res.status_code == 404
        assert fake_waha.calls == []

    async def test_delete_waha_failure_returns_500(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """Waha! のジョブ失敗時は 500 になり、DB は変更しないこと"""
        await insert_file(session_factory, "f1")
        fake_waha.fail_on = {"get_results"}
        res = await client.request(
            "DELETE", f"{BASE}/files/f1", json={"physicalDelete": True}
        )
        assert res.status_code == 500
        assert await get_file(session_factory, "f1") is not None
        assert fake_waha.call_names()[-1] == "end_session"


class TestSyncFiles:
    async def test_sync_files(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """取得ジョブの TSV から未登録のファイルとパートを追加すること"""
        fake_waha.download_content = (
            '"C:\\\\docs\\\\manual.pdf"\t"p1"\t"fileAAAA1111"\r\n'
            "C:\\docs\\manual.pdf\tp2\tfileAAAA1111\r\n"
            "/data/spec.md\tp3\tfileBBBB2222\r\n"
        )
        res = await client.post(
            f"{BASE}/sync",
            headers=TENANT,
            json={"userId": "u1", "syncServiceName": "sync-svc"},
        )
        assert res.status_code == 204
        assert ("execute_sync", ("session-1", "sync-svc", 0, 100)) in fake_waha.calls
        file_a = await get_file(session_factory, "fileAAAA1111")
        assert file_a is not None
        assert file_a.name == "manual.pdf"
        assert file_a.display_name == "manual.pdf"
        assert file_a.reference == "C:/docs"
        assert file_a.user_id == "u1"
        assert file_a.tenant_id == "tenant-1"
        assert await get_part_ids(session_factory, "fileAAAA1111") == ["p1", "p2"]
        file_b = await get_file(session_factory, "fileBBBB2222")
        assert file_b is not None
        assert file_b.reference == "/data"

    async def test_sync_files_with_bom_and_short_id(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """BOM を除き、パスが空ならファイル ID の先頭 8 文字で名前を作ること"""
        fake_waha.download_content = (
            "\ufeff\tp1\tabc\r\nname-only.txt\tp2\tlongfileid99"
        )
        res = await client.post(f"{BASE}/sync", headers=TENANT, json={"userId": "u"})
        assert res.status_code == 204
        short = await get_file(session_factory, "abc")
        assert short is not None
        assert short.name == "ファイルabc"
        assert short.reference == "ファイルabc"
        name_only = await get_file(session_factory, "longfileid99")
        assert name_only is not None
        assert name_only.name == "name-only.txt"
        assert name_only.reference == "ファイルlongfile"

    async def test_sync_skips_existing(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """既に登録済みのファイル ID は追加・更新しないこと"""
        await insert_file(session_factory, "exists", display_name="元の名前")
        fake_waha.download_content = "/a/b.txt\tp9\texists\r\n/a/c.txt\tp8\tnew"
        res = await client.post(f"{BASE}/sync", headers=TENANT, json={})
        assert res.status_code == 204
        existing = await get_file(session_factory, "exists")
        assert existing is not None
        assert existing.display_name == "元の名前"
        assert await get_part_ids(session_factory, "exists") == []
        assert await get_file(session_factory, "new") is not None

    async def test_sync_merges_duplicate_and_existing_parts(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """TSV 内の重複パートや既存のパート ID があっても上書きで同期できること"""
        await insert_file(session_factory, "old", part_ids=["shared"])
        fake_waha.download_content = (
            "/a/x.txt\tp1\tnew\r\n/a/x.txt\tp1\tnew\r\n/a/x.txt\tshared\tnew"
        )
        res = await client.post(f"{BASE}/sync", headers=TENANT, json={})
        assert res.status_code == 204
        assert await get_part_ids(session_factory, "new") == ["p1", "shared"]
        assert await get_part_ids(session_factory, "old") == []


class TestAdditionalLearning:
    async def test_additional_learning_feedback(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """フィードバック指定では移植元どおりの名前・分割長で登録すること"""
        fake_waha.download_content = "fb-file\tp1"
        res = await client.post(
            f"{BASE}/additionalLeaning",
            headers=TENANT,
            data={"creationServiceName": "c", "feedbackId": "fb1", "userId": "u"},
            files={"content": ("qa.md", b"# Q&A", "text/markdown")},
        )
        assert res.status_code == 204
        assert (
            "execute_learning",
            ("session-1", "c", "3000", "フィードバック_fb1"),
        ) in (fake_waha.calls)
        file = await get_file(session_factory, "fb-file")
        assert file is not None
        assert file.name == "追加学習_fb1.md"
        assert file.display_name == "フィードバック学習"
        assert file.feedback_id == "fb1"
        assert file.room_id is None

    async def test_additional_learning_room(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """ルーム指定ではルーム用の名前で登録すること"""
        fake_waha.download_content = "room-file\tp1"
        res = await client.post(
            f"{BASE}/additionalLeaning",
            headers=TENANT,
            data={"roomId": "r1", "userId": "u"},
            files={"content": ("room.md", b"log", "text/markdown")},
        )
        assert res.status_code == 204
        file = await get_file(session_factory, "room-file")
        assert file is not None
        assert file.name == "追加学習_ルーム_r1.md"
        assert file.reference == "フィードバック_r1"
        assert file.room_id == "r1"

    @pytest.mark.parametrize(
        "data", [{"userId": "u"}, {"feedbackId": "f", "roomId": "r", "userId": "u"}]
    )
    async def test_additional_learning_invalid_source(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        data: dict[str, str],
    ) -> None:
        """フィードバックとルームの指定が両方なし・両方ありなら 400 になること"""
        res = await client.post(
            f"{BASE}/additionalLeaning",
            headers=TENANT,
            data=data,
            files={"content": ("a.md", b"x", "text/markdown")},
        )
        assert res.status_code == 400
        assert (
            res.json()["message"]
            == "追加学習のデータソースが正しく指定されていません。"
        )
        assert fake_waha.calls == []


async def test_download_returns_500(client: httpx.AsyncClient) -> None:
    """ダウンロードは移植元どおり常に 500 になること"""
    res = await client.get(f"{BASE}/files/f1")
    assert res.status_code == 500
    assert res.json()["status"] == 500
