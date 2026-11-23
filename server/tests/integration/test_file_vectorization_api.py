# ruff: noqa: F401, F811
"""クラウドの学習データ登録で、分割・埋め込み・ベクトルの保存を行う API のテスト（Issue #462）。

pgvector と Bedrock の通信は、クライアントの差し替えで確かめる（実際の pgvector は
`docs/issue-462/08_動作確認.md` に記録する）。DB は、他の結合テストと同じテスト用 DB を使う。
"""

from collections.abc import Iterator
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.bedrock_embedding import BedrockEmbeddingError
from app.core.llm_client import EmbeddingResult
from app.models.file import File, FileStatus
from app.models.index import Index, IndexEndpoint
from app.models.tenant import Tenant
from app.models.tenant_endpoint import EndpointType, TenantEndpoint
from app.models.token_usage import TokenUsage

# 他の結合テストのフィクスチャを、引数の名前で使い回す（ファイル先頭の noqa は、そのため）
from tests.integration.test_files import (
    file_storage_root,
    files_admin_headers,
    files_admin_user,
    files_index,
    files_tenant,
    override_file_storage,
)

PGVECTOR_URL = "postgresql://vector@vector-db:5432/vector"
FV = "app.core.file_vectorization"
SENTENCE = "あ" * 60


def _stored_files(root: Path) -> list[Path]:
    """テスト用ストレージに残っているファイルの一覧を返す。

    Parameters
    ----------
    root : Path
        ストレージのルート。

    Returns
    -------
    list[Path]
        ファイルのパス。
    """
    return [path for path in root.rglob("*") if path.is_file()] if root.exists() else []


async def _add_endpoint(
    session: AsyncSession,
    tenant: Tenant,
    endpoint_type: EndpointType,
    endpoint: str,
    index: Index | None = None,
) -> TenantEndpoint:
    """接続先を作り、必要なら学習先フォルダに結びつける。

    Parameters
    ----------
    session : AsyncSession
        非同期DBセッション。
    tenant : Tenant
        テナント。
    endpoint_type : EndpointType
        接続先の種別。
    endpoint : str
        接続先の URL。
    index : Index | None
        結びつける学習先フォルダ。

    Returns
    -------
    TenantEndpoint
        作った接続先。
    """
    created = TenantEndpoint(
        tenant_id=tenant.id,
        type=endpoint_type,
        endpoint_name=f"{endpoint_type.value}-test",
        endpoint=endpoint,
        api_key="secret-key",
    )
    session.add(created)
    await session.commit()
    await session.refresh(created)
    if index is not None:
        session.add(
            IndexEndpoint(
                index_id=index.id, tenant_id=tenant.id, endpoint_id=created.id
            )
        )
        await session.commit()
    return created


@pytest.fixture
async def pgvector_setup(
    session: AsyncSession, files_tenant: Tenant, files_index: Index
) -> None:
    """pgvector の VDB 接続先と、Bedrock の埋め込みの接続先を、フォルダに用意する"""
    await _add_endpoint(
        session, files_tenant, EndpointType.VDB, PGVECTOR_URL, files_index
    )
    await _add_endpoint(
        session,
        files_tenant,
        EndpointType.BEDROCK_EMBEDDING,
        "https://bedrock-runtime.example.invalid",
        files_index,
    )


class _Mocks:
    """差し替えたクライアントの記録。"""

    def __init__(self) -> None:
        """既定の振る舞い（成功）で、クライアントの代わりを作る。"""
        self.embed = AsyncMock(
            return_value=EmbeddingResult(embedding=[0.1] * 1536, tokens=4)
        )
        self.add_rows = AsyncMock()
        self.delete = AsyncMock(return_value=2)


@pytest.fixture
def mocks() -> Iterator[_Mocks]:
    """埋め込み・pgvector のクライアントを差し替える"""
    recorded = _Mocks()
    with (
        patch(f"{FV}.BedrockLlmEmbeddingClient.create_embedding", recorded.embed),
        patch(f"{FV}.PgVectorStoreClient.add_rows", recorded.add_rows),
        patch(f"{FV}.PgVectorStoreClient.delete_by_file_id", recorded.delete),
    ):
        yield recorded


async def _post(
    client: AsyncClient,
    index: Index,
    headers: dict[str, str],
    content: bytes,
    split_length: str | None = None,
    content_type: str = "text/plain",
    filename: str = "sample.txt",
) -> Any:
    """ファイルを登録する。

    Parameters
    ----------
    client : AsyncClient
        HTTP クライアント。
    index : Index
        学習先フォルダ。
    headers : dict[str, str]
        認証ヘッダー。
    content : bytes
        ファイルの中身。
    split_length : str | None
        分割長。
    content_type : str
        Content-Type。
    filename : str
        ファイル名。

    Returns
    -------
    Any
        応答。
    """
    data = {"name": filename, "displayName": "サンプル"}
    if split_length is not None:
        data["splitLength"] = split_length
    return await client.post(
        f"/api/admin/indexes/{index.id}/files",
        files={"file": (filename, content, content_type)},
        data=data,
        headers=headers,
    )


class TestUploadVectorization:
    """登録（POST）のベクトル化のテスト"""

    async def test_upload_splits_embeds_and_stores_vectors(
        self,
        client: AsyncClient,
        session: AsyncSession,
        files_index: Index,
        files_tenant: Tenant,
        files_admin_headers: dict[str, str],
        override_file_storage: None,
        pgvector_setup: None,
        mocks: _Mocks,
    ) -> None:
        """分割した部分ごとに埋め込み、ファイルの ID つきでベクトルを保存し、使用量を記録すること"""
        content = f"{SENTENCE}。{SENTENCE}。{SENTENCE}。".encode()

        response = await _post(client, files_index, files_admin_headers, content, "100")

        assert response.status_code == 200
        file_id = response.json()["id"] if "id" in response.json() else None
        stored = (await session.execute(select(File))).scalars().one()
        assert mocks.embed.await_count == 3
        mocks.add_rows.assert_awaited_once()
        assert mocks.add_rows.await_args is not None
        endpoint, password, tenant_id, rows = mocks.add_rows.await_args.args
        assert (endpoint, password, tenant_id) == (
            PGVECTOR_URL,
            "secret-key",
            files_tenant.id,
        )
        assert [row.content for row in rows] == [f"{SENTENCE}。"] * 3
        assert {row.file_id for row in rows} == {stored.id}
        assert file_id in (None, stored.id)
        usage = (await session.execute(select(TokenUsage))).scalars().one()
        assert usage.endpoint_type == "BEDROCK_EMBEDDING"
        assert usage.embedding_tokens == 12
        assert stored.status == FileStatus.ENABLE

    async def test_upload_without_split_length_uses_default(
        self,
        client: AsyncClient,
        files_index: Index,
        files_admin_headers: dict[str, str],
        override_file_storage: None,
        pgvector_setup: None,
        mocks: _Mocks,
    ) -> None:
        """splitLength を省略すると、既定の 1000 で分割されること（短い文は 1 部分）"""
        response = await _post(
            client,
            files_index,
            files_admin_headers,
            f"{SENTENCE}。{SENTENCE}。".encode(),
        )

        assert response.status_code == 200
        assert mocks.embed.await_count == 1

    @pytest.mark.parametrize("split_length", ["99", "10001", "abc"])
    async def test_invalid_split_length_returns_400_without_side_effects(
        self,
        client: AsyncClient,
        session: AsyncSession,
        files_index: Index,
        files_admin_headers: dict[str, str],
        file_storage_root: Path,
        override_file_storage: None,
        pgvector_setup: None,
        mocks: _Mocks,
        split_length: str,
    ) -> None:
        """splitLength が不正なら 400 になり、埋め込み・保存・ファイルの作成が起きないこと"""
        response = await _post(
            client, files_index, files_admin_headers, b"hello", split_length
        )

        assert response.status_code == 400
        mocks.embed.assert_not_awaited()
        mocks.add_rows.assert_not_awaited()
        assert (await session.execute(select(File))).scalars().all() == []
        assert _stored_files(file_storage_root) == []

    async def test_unsupported_format_returns_400_and_cleans_up(
        self,
        client: AsyncClient,
        session: AsyncSession,
        files_index: Index,
        files_admin_headers: dict[str, str],
        file_storage_root: Path,
        override_file_storage: None,
        pgvector_setup: None,
        mocks: _Mocks,
    ) -> None:
        """テキスト系でない形式は 400 になり、ストレージの実体もファイルの記録も残らないこと"""
        response = await _post(
            client,
            files_index,
            files_admin_headers,
            b"%PDF-1.4",
            content_type="application/pdf",
            filename="doc.pdf",
        )

        assert response.status_code == 400
        assert "取り出せません" in response.json()["message"]
        assert (await session.execute(select(File))).scalars().all() == []
        assert _stored_files(file_storage_root) == []

    async def test_embedding_failure_returns_400_and_rolls_back(
        self,
        client: AsyncClient,
        session: AsyncSession,
        files_index: Index,
        files_admin_headers: dict[str, str],
        file_storage_root: Path,
        override_file_storage: None,
        pgvector_setup: None,
        mocks: _Mocks,
    ) -> None:
        """埋め込みが失敗したら 400 になり、ストレージ・記録・使用量が残らず、後始末が呼ばれること"""
        mocks.embed.side_effect = BedrockEmbeddingError("失敗")

        response = await _post(
            client, files_index, files_admin_headers, f"{SENTENCE}。".encode()
        )

        assert response.status_code == 400
        assert response.json()["message"] == "Failed to create embedding for file"
        assert (await session.execute(select(File))).scalars().all() == []
        assert (await session.execute(select(TokenUsage))).scalars().all() == []
        assert _stored_files(file_storage_root) == []
        mocks.add_rows.assert_not_awaited()
        mocks.delete.assert_awaited_once()

    async def test_store_failure_returns_error_and_removes_vectors(
        self,
        client: AsyncClient,
        session: AsyncSession,
        files_index: Index,
        files_admin_headers: dict[str, str],
        file_storage_root: Path,
        override_file_storage: None,
        pgvector_setup: None,
        mocks: _Mocks,
    ) -> None:
        """ベクトルの保存が失敗したら、ストレージ・記録が残らず、ベクトルの後始末が呼ばれること"""
        from fastapi import HTTPException

        mocks.add_rows.side_effect = HTTPException(
            status_code=400, detail="Failed to connect to vector database"
        )

        response = await _post(
            client, files_index, files_admin_headers, f"{SENTENCE}。".encode()
        )

        assert response.status_code == 400
        assert (await session.execute(select(File))).scalars().all() == []
        assert _stored_files(file_storage_root) == []
        mocks.delete.assert_awaited_once()

    async def test_without_pgvector_vdb_only_the_record_is_created(
        self,
        client: AsyncClient,
        session: AsyncSession,
        files_index: Index,
        files_tenant: Tenant,
        files_admin_headers: dict[str, str],
        override_file_storage: None,
        mocks: _Mocks,
    ) -> None:
        """VDB が pgvector でない（https）フォルダは、従来どおり、記録だけが作られること"""
        await _add_endpoint(
            session,
            files_tenant,
            EndpointType.VDB,
            "https://x.search.windows.net",
            files_index,
        )

        response = await _post(client, files_index, files_admin_headers, b"hello")

        assert response.status_code == 200
        mocks.embed.assert_not_awaited()
        mocks.add_rows.assert_not_awaited()
        assert len((await session.execute(select(File))).scalars().all()) == 1

    async def test_without_embedding_endpoint_only_the_record_is_created(
        self,
        client: AsyncClient,
        session: AsyncSession,
        files_index: Index,
        files_tenant: Tenant,
        files_admin_headers: dict[str, str],
        override_file_storage: None,
        mocks: _Mocks,
    ) -> None:
        """埋め込みの接続先がないフォルダは、従来どおり、記録だけが作られること"""
        await _add_endpoint(
            session, files_tenant, EndpointType.VDB, PGVECTOR_URL, files_index
        )

        response = await _post(client, files_index, files_admin_headers, b"hello")

        assert response.status_code == 200
        mocks.add_rows.assert_not_awaited()

    async def test_empty_content_creates_record_without_vectors(
        self,
        client: AsyncClient,
        files_index: Index,
        files_admin_headers: dict[str, str],
        override_file_storage: None,
        pgvector_setup: None,
        mocks: _Mocks,
    ) -> None:
        """中身が空のファイルは、記録だけが作られ、ベクトルは保存されないこと"""
        response = await _post(client, files_index, files_admin_headers, b"")

        assert response.status_code == 200
        mocks.embed.assert_not_awaited()
        mocks.add_rows.assert_not_awaited()


class TestDeleteAndReplaceVectors:
    """削除・差し替えのベクトルのテスト"""

    async def _create(
        self,
        client: AsyncClient,
        index: Index,
        headers: dict[str, str],
    ) -> str:
        """ファイルを登録して、ID を返す。

        Parameters
        ----------
        client : AsyncClient
            HTTP クライアント。
        index : Index
            学習先フォルダ。
        headers : dict[str, str]
            認証ヘッダー。

        Returns
        -------
        str
            ファイルの ID。
        """
        response = await _post(client, index, headers, f"{SENTENCE}。".encode())
        assert response.status_code == 200
        return str(
            response.json()["fileId"]
            if "fileId" in response.json()
            else response.json()["id"]
        )

    async def test_delete_removes_vectors_of_the_file(
        self,
        client: AsyncClient,
        session: AsyncSession,
        files_index: Index,
        files_admin_headers: dict[str, str],
        override_file_storage: None,
        pgvector_setup: None,
        mocks: _Mocks,
    ) -> None:
        """削除で、そのファイルのベクトルが（ファイルの削除のあとに）削除されること"""
        file_id = await self._create(client, files_index, files_admin_headers)
        mocks.delete.reset_mock()

        response = await client.request(
            "DELETE",
            f"/api/admin/indexes/{files_index.id}/files/{file_id}",
            json={"physicalDelete": True},
            headers=files_admin_headers,
        )

        assert response.status_code == 204
        mocks.delete.assert_awaited_once()
        assert mocks.delete.await_args is not None
        assert mocks.delete.await_args.args[3] == file_id

    async def test_delete_succeeds_even_when_vector_deletion_fails(
        self,
        client: AsyncClient,
        session: AsyncSession,
        files_index: Index,
        files_admin_headers: dict[str, str],
        file_storage_root: Path,
        override_file_storage: None,
        pgvector_setup: None,
        mocks: _Mocks,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """ベクトルの削除が失敗しても、ファイルは削除され、失敗が記録されること（ファイルのないベクトルは検索で読み飛ばされる）"""
        file_id = await self._create(client, files_index, files_admin_headers)
        mocks.delete.side_effect = RuntimeError("pgvector down")

        response = await client.request(
            "DELETE",
            f"/api/admin/indexes/{files_index.id}/files/{file_id}",
            json={"physicalDelete": True},
            headers=files_admin_headers,
        )

        assert response.status_code == 204
        deleted = (await session.execute(select(File))).scalars().one()
        assert deleted.status == FileStatus.DELETED
        assert _stored_files(file_storage_root) == []
        assert "ベクトルの削除に失敗しました" in caplog.text

    async def test_replace_removes_old_and_adds_new_vectors(
        self,
        client: AsyncClient,
        session: AsyncSession,
        files_index: Index,
        files_admin_headers: dict[str, str],
        override_file_storage: None,
        pgvector_setup: None,
        mocks: _Mocks,
    ) -> None:
        """ファイルを添付した更新で、古いベクトルが消え、新しいファイルのベクトルが保存されること"""
        old_id = await self._create(client, files_index, files_admin_headers)
        mocks.delete.reset_mock()
        mocks.add_rows.reset_mock()

        response = await client.patch(
            f"/api/admin/indexes/{files_index.id}/files/{old_id}",
            files={"file": ("new.txt", "新しい内容。".encode(), "text/plain")},
            data={"name": "new.txt", "displayName": "新"},
            headers=files_admin_headers,
        )

        assert response.status_code == 200
        assert mocks.delete.await_args is not None
        assert mocks.delete.await_args.args[3] == old_id
        mocks.add_rows.assert_awaited_once()
        assert mocks.add_rows.await_args is not None
        assert mocks.add_rows.await_args is not None
        rows = mocks.add_rows.await_args.args[3]
        assert rows[0].content == "新しい内容。"
        assert rows[0].file_id != old_id

    async def test_metadata_update_does_not_touch_vectors(
        self,
        client: AsyncClient,
        files_index: Index,
        files_admin_headers: dict[str, str],
        override_file_storage: None,
        pgvector_setup: None,
        mocks: _Mocks,
    ) -> None:
        """メタデータだけの更新は、ベクトルに触れないこと"""
        file_id = await self._create(client, files_index, files_admin_headers)
        mocks.delete.reset_mock()
        mocks.add_rows.reset_mock()
        mocks.embed.reset_mock()

        response = await client.patch(
            f"/api/admin/indexes/{files_index.id}/files/{file_id}",
            data={"displayName": "名前だけ変更"},
            headers=files_admin_headers,
        )

        assert response.status_code == 200
        mocks.delete.assert_not_awaited()
        mocks.add_rows.assert_not_awaited()
        mocks.embed.assert_not_awaited()

    async def test_failed_replace_keeps_old_file_and_vectors(
        self,
        client: AsyncClient,
        session: AsyncSession,
        files_index: Index,
        files_admin_headers: dict[str, str],
        file_storage_root: Path,
        override_file_storage: None,
        pgvector_setup: None,
        mocks: _Mocks,
    ) -> None:
        """差し替えの登録が失敗したら、古いファイル・ストレージ・ベクトルが残ること"""
        old_id = await self._create(client, files_index, files_admin_headers)
        mocks.delete.reset_mock()

        response = await client.patch(
            f"/api/admin/indexes/{files_index.id}/files/{old_id}",
            files={"file": ("new.pdf", b"%PDF-1.4", "application/pdf")},
            data={"name": "new.pdf", "displayName": "新"},
            headers=files_admin_headers,
        )

        assert response.status_code == 400
        stored = (await session.execute(select(File))).scalars().all()
        assert [f.id for f in stored] == [old_id]
        assert len(_stored_files(file_storage_root)) == 1
        # 新しいファイルの後始末は呼ばれるが、古いファイルのベクトルは消さない
        assert all(call.args[3] != old_id for call in mocks.delete.await_args_list)


class TestGuards:
    """分割数の上限・空白・想定外の失敗のテスト"""

    async def test_too_many_chunks_returns_400_before_embedding(
        self,
        client: AsyncClient,
        session: AsyncSession,
        files_index: Index,
        files_admin_headers: dict[str, str],
        file_storage_root: Path,
        override_file_storage: None,
        pgvector_setup: None,
        mocks: _Mocks,
    ) -> None:
        """分割数が上限を超えるファイルは、埋め込む前に 400 になり、何も残らないこと"""
        with patch(f"{FV}.MAX_CHUNKS_PER_FILE", 2):
            response = await _post(
                client,
                files_index,
                files_admin_headers,
                f"{SENTENCE}。{SENTENCE}。{SENTENCE}。".encode(),
                "100",
            )

        assert response.status_code == 400
        assert "大きすぎます" in response.json()["message"]
        mocks.embed.assert_not_awaited()
        assert (await session.execute(select(File))).scalars().all() == []
        assert _stored_files(file_storage_root) == []

    async def test_whitespace_only_content_is_not_embedded(
        self,
        client: AsyncClient,
        files_index: Index,
        files_admin_headers: dict[str, str],
        override_file_storage: None,
        pgvector_setup: None,
        mocks: _Mocks,
    ) -> None:
        """空白と改行だけのファイルは、記録だけが作られ、埋め込まれないこと"""
        response = await _post(client, files_index, files_admin_headers, b"  \n \n  ")

        assert response.status_code == 200
        mocks.embed.assert_not_awaited()
        mocks.add_rows.assert_not_awaited()

    async def test_unexpected_store_error_returns_400_and_rolls_back(
        self,
        client: AsyncClient,
        session: AsyncSession,
        files_index: Index,
        files_admin_headers: dict[str, str],
        file_storage_root: Path,
        override_file_storage: None,
        pgvector_setup: None,
        mocks: _Mocks,
    ) -> None:
        """ベクトルの保存で想定外の例外（次元数の不一致など）が出ても、400 になり、後始末されること"""
        mocks.add_rows.side_effect = ValueError("embedding must have 1536 dimensions")

        response = await _post(
            client, files_index, files_admin_headers, f"{SENTENCE}。".encode()
        )

        assert response.status_code == 400
        assert response.json()["message"] == "Failed to store vectors for file"
        assert (await session.execute(select(File))).scalars().all() == []
        assert _stored_files(file_storage_root) == []
        mocks.delete.assert_awaited_once()
