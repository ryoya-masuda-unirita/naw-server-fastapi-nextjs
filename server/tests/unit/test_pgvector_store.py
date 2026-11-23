"""pgvector のベクトルストアのクライアントのテスト（`pgvector-ext`）。"""

import re
import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import asyncpg  # type: ignore[import-untyped]
import pytest
from fastapi import HTTPException

from app.core.pgvector_store import (
    EMBEDDING_DIMENSIONS,
    PgVectorStoreClient,
    VectorRow,
    _connection_arguments,
    is_pgvector_endpoint,
    table_name_for_tenant,
    vector_literal,
)

ENDPOINT = "postgresql://vector@vector-db:5434/vector"
PASSWORD = "s3cret-password"
VECTOR = [0.5] * EMBEDDING_DIMENSIONS


def _connection(**overrides: Any) -> MagicMock:
    """`asyncpg` の接続の代わりを作る。

    Parameters
    ----------
    **overrides : Any
        差し替える属性（`fetch`・`execute` など）。

    Returns
    -------
    MagicMock
        接続の代わり。
    """
    connection = MagicMock()
    connection.fetch = AsyncMock(return_value=[])
    connection.execute = AsyncMock(return_value="DELETE 0")
    connection.executemany = AsyncMock()
    connection.close = AsyncMock()
    connection.fetchval = AsyncMock(return_value=None)
    transaction = MagicMock()
    transaction.__aenter__ = AsyncMock(return_value=None)
    transaction.__aexit__ = AsyncMock(return_value=None)
    connection.transaction = MagicMock(return_value=transaction)
    for name, value in overrides.items():
        setattr(connection, name, value)
    return connection


def _patch_connect(connection: MagicMock | None = None, **kwargs: Any) -> Any:
    """`asyncpg.connect` を、接続の代わりを返すものに差し替える。

    Parameters
    ----------
    connection : MagicMock | None
        返す接続の代わり。
    **kwargs : Any
        `AsyncMock` に渡す引数（`side_effect` など）。

    Returns
    -------
    Any
        `patch` のコンテキストマネージャ。
    """
    if kwargs:
        mock = AsyncMock(**kwargs)
    else:
        mock = AsyncMock(return_value=connection)
    return patch("app.core.pgvector_store.asyncpg.connect", mock)


class TestHelpers:
    """接続先の判定・表名・接続の引数・リテラルのテスト"""

    @pytest.mark.parametrize(
        ("endpoint", "expected"),
        [
            ("postgresql://u@h:5432/db", True),
            ("postgres://u@h/db", True),
            ("  POSTGRESQL://u@h/db", True),
            ("https://x.search.windows.net", False),
            ("", False),
        ],
    )
    def test_is_pgvector_endpoint_by_scheme(
        self, endpoint: str, expected: bool
    ) -> None:
        """接続先の先頭で、pgvector かどうかが決まること"""
        assert is_pgvector_endpoint(endpoint) is expected

    def test_table_name_is_safe_and_unique(self) -> None:
        """表名が、英小文字・数字・_ だけの 63 文字以内で、記号違いの ID は別になること"""
        names = [
            table_name_for_tenant(tenant)
            for tenant in ("test-tenant", "test_tenant", "TEST-TENANT", "x" * 200, "")
        ]

        assert all(re.fullmatch(r"docs_[a-z0-9_]+", name) for name in names)
        assert all(len(name) <= 63 for name in names)
        assert len(set(names)) == len(names)

    def test_hostile_tenant_id_cannot_break_table_name(self) -> None:
        """SQL を壊そうとするテナント ID でも、表名が安全な識別子になること"""
        name = table_name_for_tenant('"; DROP TABLE users; --')

        assert re.fullmatch(r"docs_[a-z0-9_]+", name)

    def test_connection_arguments_are_parsed(self) -> None:
        """ユーザー・ホスト・ポート・DB 名が分かれ、パスワードが渡ること"""
        arguments = _connection_arguments(ENDPOINT, PASSWORD)

        assert arguments["host"] == "vector-db"
        assert arguments["port"] == 5434
        assert arguments["user"] == "vector"
        assert arguments["password"] == PASSWORD
        assert arguments["database"] == "vector"

    def test_default_port_is_used_when_omitted(self) -> None:
        """ポートを省略すると、5432 になること"""
        assert _connection_arguments("postgresql://u@h/db", "p")["port"] == 5432

    @pytest.mark.parametrize("endpoint", ["postgresql://u@/db", "postgresql://u@h"])
    def test_endpoint_without_host_or_database_is_rejected(self, endpoint: str) -> None:
        """ホストや DB 名のない接続先が、拒否されること"""
        with pytest.raises(ValueError):
            _connection_arguments(endpoint, "p")

    def test_vector_literal_format_and_validation(self) -> None:
        """リテラルの形と、次元数・非有限の値の拒否"""
        assert vector_literal(VECTOR).startswith("[0.5,0.5")
        with pytest.raises(ValueError):
            vector_literal([0.1] * 10)
        with pytest.raises(ValueError):
            vector_literal([float("nan")] + [0.0] * (EMBEDDING_DIMENSIONS - 1))


class TestSimilaritySearch:
    """PgVectorStoreClient.similarity_search のテスト"""

    async def test_similarity_search_orders_by_distance_with_parameters(self) -> None:
        """近い順の SQL で、ベクトルと件数がパラメータで渡り、結果が変換されること"""
        connection = _connection(
            fetch=AsyncMock(return_value=[{"fileid": "f1", "content": "資料1"}])
        )

        with _patch_connect(connection) as connect:
            results = await PgVectorStoreClient.similarity_search(
                ENDPOINT, PASSWORD, "tenant-1", VECTOR, 3
            )

        assert [(r.content, r.file_unique_id) for r in results] == [("資料1", "f1")]
        sql, literal, limit = connection.fetch.await_args.args
        assert "ORDER BY embedding <=> $1::vector LIMIT $2" in sql
        assert sql.startswith('SELECT fileid, content FROM "docs_tenant_1_')
        assert literal.startswith("[0.5,")
        assert limit == 3
        assert connect.await_args.kwargs["password"] == PASSWORD
        connection.close.assert_awaited_once()

    async def test_missing_table_returns_empty(self) -> None:
        """表がないテナントは、0 件として扱われること"""
        connection = _connection(
            fetch=AsyncMock(side_effect=asyncpg.UndefinedTableError("no table"))
        )

        with _patch_connect(connection):
            results = await PgVectorStoreClient.similarity_search(
                ENDPOINT, PASSWORD, "tenant-1", VECTOR
            )

        assert results == []
        connection.close.assert_awaited_once()

    @pytest.mark.parametrize(
        "error", [OSError("refused"), asyncpg.PostgresError("boom")]
    )
    async def test_connection_failure_returns_400_without_password(
        self, error: Exception, caplog: pytest.LogCaptureFixture
    ) -> None:
        """接続の失敗が 400 になり、パスワードが応答・ログに出ないこと"""
        with _patch_connect(side_effect=error):
            with pytest.raises(HTTPException) as raised:
                await PgVectorStoreClient.similarity_search(
                    ENDPOINT, PASSWORD, "tenant-1", VECTOR
                )

        assert raised.value.status_code == 400
        assert raised.value.detail == "Failed to connect to vector database"
        assert PASSWORD not in caplog.text

    async def test_search_failure_returns_400_and_closes(self) -> None:
        """検索の SQL が失敗したとき、400 になり、接続が閉じられること"""
        connection = _connection(
            fetch=AsyncMock(side_effect=asyncpg.PostgresError("boom"))
        )

        with _patch_connect(connection):
            with pytest.raises(HTTPException) as raised:
                await PgVectorStoreClient.similarity_search(
                    ENDPOINT, PASSWORD, "tenant-1", VECTOR
                )

        assert raised.value.status_code == 400
        connection.close.assert_awaited_once()

    async def test_wrong_dimension_query_returns_400_without_connecting(self) -> None:
        """次元数が違うクエリは、接続せずに 400 になること"""
        with _patch_connect(_connection()) as connect:
            with pytest.raises(HTTPException) as raised:
                await PgVectorStoreClient.similarity_search(
                    ENDPOINT, PASSWORD, "tenant-1", [0.1] * 10
                )

        assert raised.value.status_code == 400
        connect.assert_not_awaited()


class TestWrite:
    """保存・表の作成・削除のテスト"""

    async def test_add_rows_creates_table_then_upserts(self) -> None:
        """拡張・表・索引を作ってから、ON CONFLICT で保存すること"""
        connection = _connection()
        row = VectorRow(uuid.uuid4(), "file-1", "ref/a.txt", "内容", VECTOR)

        with _patch_connect(connection):
            await PgVectorStoreClient.add_rows(ENDPOINT, PASSWORD, "tenant-1", [row])

        statements = [call.args[0] for call in connection.execute.await_args_list]
        assert statements[0] == "SELECT pg_advisory_xact_lock(hashtext($1))"
        assert statements[1] == "CREATE EXTENSION IF NOT EXISTS vector"
        assert "CREATE TABLE IF NOT EXISTS" in statements[2]
        assert f"vector({EMBEDDING_DIMENSIONS})" in statements[2]
        assert "USING hnsw (embedding vector_cosine_ops)" in statements[4]
        sql, records = connection.executemany.await_args.args
        assert "ON CONFLICT (id) DO UPDATE" in sql
        assert records[0][:4] == (row.id, "file-1", "ref/a.txt", "内容")
        assert records[0][4].startswith("[0.5,")
        connection.close.assert_awaited_once()

    async def test_add_rows_rejects_wrong_dimensions(self) -> None:
        """次元数が違う行があると、接続せず、何も保存しないこと"""
        bad = VectorRow(uuid.uuid4(), "f", None, "内容", [0.1] * 10)

        with _patch_connect(_connection()) as connect:
            with pytest.raises(ValueError):
                await PgVectorStoreClient.add_rows(ENDPOINT, PASSWORD, "t", [bad])

        connect.assert_not_awaited()

    async def test_ensure_table_runs_creation_statements(self) -> None:
        """ensure_table が、拡張・表・索引の作成を実行すること"""
        connection = _connection()

        with _patch_connect(connection):
            await PgVectorStoreClient.ensure_table(ENDPOINT, PASSWORD, "tenant-1")

        assert connection.execute.await_count == 5

    async def test_delete_by_file_id_returns_deleted_count(self) -> None:
        """ファイルの ID で削除し、削除した行数を返すこと"""
        connection = _connection(execute=AsyncMock(return_value="DELETE 3"))

        with _patch_connect(connection):
            deleted = await PgVectorStoreClient.delete_by_file_id(
                ENDPOINT, PASSWORD, "tenant-1", "file-1"
            )

        assert deleted == 3
        sql, file_id = connection.execute.await_args.args
        assert "WHERE fileid = $1" in sql
        assert file_id == "file-1"

    async def test_delete_without_table_returns_zero(self) -> None:
        """表がないテナントの削除は、0 件になること"""
        connection = _connection(
            execute=AsyncMock(side_effect=asyncpg.UndefinedTableError("no table"))
        )

        with _patch_connect(connection):
            deleted = await PgVectorStoreClient.delete_by_file_id(
                ENDPOINT, PASSWORD, "tenant-1", "file-1"
            )

        assert deleted == 0

    async def test_existing_table_skips_creation_statements(self) -> None:
        """表がすでにあるときは、作成の SQL を流さず、保存だけすること"""
        connection = _connection(fetchval=AsyncMock(return_value="docs_t"))
        row = VectorRow(uuid.uuid4(), "file-1", None, "内容", VECTOR)

        with _patch_connect(connection):
            await PgVectorStoreClient.add_rows(ENDPOINT, PASSWORD, "tenant-1", [row])

        connection.execute.assert_not_awaited()
        connection.executemany.assert_awaited_once()

    async def test_creation_runs_in_transaction_with_advisory_lock(self) -> None:
        """表の作成が、トランザクションの中で、アドバイザリロックを取ってから行われること"""
        connection = _connection()

        with _patch_connect(connection):
            await PgVectorStoreClient.ensure_table(ENDPOINT, PASSWORD, "tenant-1")

        connection.transaction.assert_called_once()
        first = connection.execute.await_args_list[0].args
        assert first[0] == "SELECT pg_advisory_xact_lock(hashtext($1))"
        assert first[1].startswith("docs_tenant_1_")

    async def test_index_names_fit_identifier_limit_for_long_tenant_ids(self) -> None:
        """長いテナント ID でも、表名・索引名が 63 文字以内であること"""
        connection = _connection()

        with _patch_connect(connection):
            await PgVectorStoreClient.ensure_table(ENDPOINT, PASSWORD, "x" * 200)

        names = [
            match
            for call in connection.execute.await_args_list[2:]
            for match in re.findall(r'"([^"]+)"', call.args[0])
        ]
        assert names and all(len(name) <= 63 for name in names)

    async def test_wrong_dimension_query_reports_dimension_mismatch(self) -> None:
        """次元数が違うクエリは、接続の失敗ではなく、次元数の不一致として報告されること"""
        with _patch_connect(_connection()):
            with pytest.raises(HTTPException) as raised:
                await PgVectorStoreClient.similarity_search(
                    ENDPOINT, PASSWORD, "tenant-1", [0.1] * 10
                )

        assert raised.value.detail == "Embedding dimension mismatch"

    def test_endpoint_with_password_is_rejected(self) -> None:
        """URL にパスワードを書いた接続先は、拒否されること"""
        with pytest.raises(ValueError):
            _connection_arguments("postgresql://u:pw@h/db", "p")

    def test_sslmode_is_passed_to_asyncpg(self) -> None:
        """sslmode が asyncpg の ssl に渡り、未対応の値は拒否されること"""
        assert (
            _connection_arguments("postgresql://u@h/db?sslmode=require", "p")["ssl"]
            == "require"
        )
        assert "ssl" not in _connection_arguments("postgresql://u@h/db", "p")
        with pytest.raises(ValueError):
            _connection_arguments("postgresql://u@h/db?sslmode=bogus", "p")
