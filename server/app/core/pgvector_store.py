"""pgvector（PostgreSQL）のベクトルストアのクライアント（Python 版だけの独自の拡張）。

**移植元に対応する実装がない。** 移植元は、ベクトルの保存・検索が Azure AI Search 専用。
`pgvector-ext` の目印がある行（`message_service.py`）と、このファイルを消せば、元の状態に戻る。

接続先は、種別 `VDB` のテナントのエンドポイントで表す（DB に列を足さない）。

- ``endpoint``: ``postgresql://ユーザー@ホスト:ポート/DB名``
- ``api_key``: パスワード

表は、テナントごとに 1 つ。列は、オンプレ側のアダプタ（``embedding-adapter``）が作る表と
同じ ``(id uuid, fileid, filepath, content, embedding vector(1536))``。近い順の検索は
``embedding <=> クエリのベクトル``（コサイン距離）。
"""

import hashlib
import logging
import re
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from math import isfinite
from urllib.parse import parse_qs, unquote, urlparse

# asyncpg は型情報（スタブ・py.typed）を持たない。ほかに asyncpg を直接使う箇所はない
import asyncpg  # type: ignore[import-untyped]
from fastapi import HTTPException, status

from app.core.vector_store import (
    DEFAULT_TOP_K,
    EMBEDDING_DIMENSIONS,
    VectorSearchResult,
)

logger = logging.getLogger(__name__)

PGVECTOR_SCHEMES = ("postgresql://", "postgres://")
CONNECT_TIMEOUT_SECONDS = 10.0
DEFAULT_POSTGRES_PORT = 5432
TABLE_PREFIX = "docs_"
# 表名は 63 文字までなので、テナント ID の部分を短く切り、ハッシュで一意にする
MAX_SLUG_LENGTH = 40
DIGEST_LENGTH = 8
CONNECTION_FAILED_DETAIL = "Failed to connect to vector database"
DIMENSION_MISMATCH_DETAIL = "Embedding dimension mismatch"
# asyncpg の ssl に、そのまま渡せる sslmode の値
SSL_MODES = frozenset(
    {"disable", "allow", "prefer", "require", "verify-ca", "verify-full"}
)
# 索引名の組み立て（表名に接尾辞を付けると 63 文字を超えるため、表名のハッシュから作る）
INDEX_PREFIX = "idx_"
INDEX_DIGEST_LENGTH = 12


@dataclass(frozen=True)
class VectorRow:
    """保存する 1 行（文書の 1 チャンク）。"""

    id: uuid.UUID
    file_id: str
    file_path: str | None
    content: str
    embedding: Sequence[float]


def is_pgvector_endpoint(endpoint: str) -> bool:
    """ベクトル DB の接続先が、pgvector（PostgreSQL）かを返す。

    Parameters
    ----------
    endpoint : str
        種別 `VDB` のテナントのエンドポイント。

    Returns
    -------
    bool
        ``postgresql://`` または ``postgres://`` で始まるとき True。
    """
    return endpoint.strip().lower().startswith(PGVECTOR_SCHEMES)


def table_name_for_tenant(tenant_id: str) -> str:
    """テナント ID から、衝突しない安全な表名を作る。

    英小文字・数字・``_`` だけで、63 文字以内。記号だけが違う ID（``a-b`` と ``a_b``）が
    同じ表にならないよう、元の ID のハッシュを付ける。

    Parameters
    ----------
    tenant_id : str
        テナント ID。

    Returns
    -------
    str
        表名。
    """
    slug = re.sub(r"[^a-z0-9_]", "_", tenant_id.lower())[:MAX_SLUG_LENGTH] or "tenant"
    digest = hashlib.sha1(tenant_id.encode()).hexdigest()[:DIGEST_LENGTH]  # noqa: S324
    return f"{TABLE_PREFIX}{slug}_{digest}"


def vector_literal(vector: Sequence[float]) -> str:
    """pgvector のリテラル（``[0.1,0.2]``）にする。

    Parameters
    ----------
    vector : Sequence[float]
        ベクトル。

    Returns
    -------
    str
        リテラル。

    Raises
    ------
    ValueError
        次元数が 1536 でない、または有限でない値を含むとき。
    """
    if len(vector) != EMBEDDING_DIMENSIONS:
        raise ValueError(f"embedding must have {EMBEDDING_DIMENSIONS} dimensions")
    if not all(isfinite(value) for value in vector):
        raise ValueError("embedding contains non-finite value")
    return "[" + ",".join(repr(float(value)) for value in vector) + "]"


def _connection_arguments(endpoint: str, password: str) -> dict[str, object]:
    """接続先の URL から、`asyncpg.connect` の引数を作る。

    Parameters
    ----------
    endpoint : str
        ``postgresql://ユーザー@ホスト:ポート/DB名``。
    password : str
        パスワード。

    Returns
    -------
    dict[str, object]
        `asyncpg.connect` に渡すキーワード引数。``?sslmode=require`` などを指定すると、
        ``ssl`` に渡す（指定がなければ asyncpg の既定の ``prefer``）。

    Raises
    ------
    ValueError
        ホストまたは DB 名がない、URL にパスワードがある、`sslmode` が未対応のとき。
    """
    parsed = urlparse(endpoint.strip())
    database = unquote(parsed.path.lstrip("/"))
    if not parsed.hostname or not database:
        raise ValueError("endpoint must include host and database")
    if parsed.password:
        # パスワードは api_key 欄だけに書く（URL に書くと、画面や記録に残りやすい）
        raise ValueError("endpoint must not include a password")
    arguments: dict[str, object] = {
        "host": parsed.hostname,
        "port": parsed.port or DEFAULT_POSTGRES_PORT,
        "user": unquote(parsed.username) if parsed.username else None,
        "password": password,
        "database": database,
        "timeout": CONNECT_TIMEOUT_SECONDS,
    }
    ssl_mode = parse_qs(parsed.query).get("sslmode", [""])[0]
    if ssl_mode:
        if ssl_mode not in SSL_MODES:
            raise ValueError("unsupported sslmode")
        arguments["ssl"] = ssl_mode
    return arguments


def _quoted(table: str) -> str:
    """検証済みの表名を、SQL の識別子として引用する。

    Parameters
    ----------
    table : str
        `table_name_for_tenant` が作った表名。

    Returns
    -------
    str
        引用した識別子。
    """
    return f'"{table}"'


async def _connect(endpoint: str, password: str) -> asyncpg.Connection:
    """pgvector の DB に接続する。失敗は、パスワードを含めずに 400 にする。

    Parameters
    ----------
    endpoint : str
        接続先の URL。
    password : str
        パスワード。

    Returns
    -------
    asyncpg.Connection
        接続。

    Raises
    ------
    HTTPException
        接続先の形が不正、または接続に失敗したとき（400）。
    """
    try:
        return await asyncpg.connect(**_connection_arguments(endpoint, password))
    except (OSError, ValueError, asyncpg.PostgresError, TimeoutError) as error:
        logger.error("ベクトルDBへの接続に失敗しました: %s", type(error).__name__)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=CONNECTION_FAILED_DETAIL
        ) from None


class PgVectorStoreClient:
    """pgvector への、ベクトルの保存・検索・削除を行うクライアント。"""

    @staticmethod
    async def similarity_search(
        endpoint: str,
        api_key: str,
        tenant_id: str,
        query_vector: list[float],
        top_k: int = DEFAULT_TOP_K,
    ) -> list[VectorSearchResult]:
        """クエリのベクトルに近い文書を、テナントの表から検索する。

        Parameters
        ----------
        endpoint : str
            ``postgresql://ユーザー@ホスト:ポート/DB名``。
        api_key : str
            パスワード。
        tenant_id : str
            検索するテナントの ID（表を決める）。
        query_vector : list[float]
            クエリの埋め込みベクトル。
        top_k : int
            取得する件数の上限。

        Returns
        -------
        list[VectorSearchResult]
            近い順の検索結果。表がなければ空。

        Raises
        ------
        HTTPException
            接続・検索に失敗したとき（400）。
        """
        table = _quoted(table_name_for_tenant(tenant_id))
        try:
            literal = vector_literal(query_vector)
        except ValueError as error:
            logger.error("検索のベクトルが不正です: %s", error)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=DIMENSION_MISMATCH_DETAIL,
            ) from None
        connection = await _connect(endpoint, api_key)
        try:
            rows = await connection.fetch(
                f"SELECT fileid, content FROM {table} "  # noqa: S608
                "ORDER BY embedding <=> $1::vector LIMIT $2",
                literal,
                top_k,
            )
        except asyncpg.UndefinedTableError:
            # 学習データ未登録のテナントは、表がない。探す物が無いだけなので、0 件にする
            logger.info("表が無いため、学習データの検索を 0 件として扱います")
            return []
        except (OSError, asyncpg.PostgresError) as error:
            logger.error("ベクトルDBの検索に失敗しました: %s", type(error).__name__)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=CONNECTION_FAILED_DETAIL
            ) from None
        finally:
            await connection.close()
        return [
            VectorSearchResult(content=row["content"], file_unique_id=row["fileid"])
            for row in rows
        ]

    @staticmethod
    async def ensure_table(endpoint: str, api_key: str, tenant_id: str) -> None:
        """拡張・表・索引がなければ作る。

        Parameters
        ----------
        endpoint : str
            接続先の URL。
        api_key : str
            パスワード。
        tenant_id : str
            テナントの ID。

        Raises
        ------
        HTTPException
            接続・作成に失敗したとき（400）。
        """
        connection = await _connect(endpoint, api_key)
        try:
            await PgVectorStoreClient._create_table(connection, tenant_id)
        except (OSError, asyncpg.PostgresError) as error:
            logger.error("ベクトルDBの表の作成に失敗しました: %s", type(error).__name__)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=CONNECTION_FAILED_DETAIL
            ) from None
        finally:
            await connection.close()

    @staticmethod
    async def _create_table(connection: asyncpg.Connection, tenant_id: str) -> None:
        """拡張・表・索引を、なければ作る（接続を受け取る）。

        表がすでにあれば何もしない（保存のたびに作成の SQL を流さない）。同じ表を同時に
        初めて作る呼び出しが競合しないよう、トランザクションの中で、アドバイザリロックを
        取ってから作る。

        Parameters
        ----------
        connection : asyncpg.Connection
            接続。
        tenant_id : str
            テナントの ID。
        """
        name = table_name_for_tenant(tenant_id)
        table = _quoted(name)
        if await connection.fetchval("SELECT to_regclass($1)", table) is not None:
            return
        # 索引名は、表名に接尾辞を付けると 63 文字を超えるため、表名のハッシュから作る
        digest = hashlib.sha1(name.encode()).hexdigest()[:INDEX_DIGEST_LENGTH]  # noqa: S324
        index_base = f"{INDEX_PREFIX}{digest}"
        async with connection.transaction():
            await connection.execute("SELECT pg_advisory_xact_lock(hashtext($1))", name)
            await connection.execute("CREATE EXTENSION IF NOT EXISTS vector")
            await connection.execute(
                f"CREATE TABLE IF NOT EXISTS {table} ("  # noqa: S608
                "id uuid PRIMARY KEY, fileid text NOT NULL, filepath text, "
                f"content text NOT NULL, embedding vector({EMBEDDING_DIMENSIONS}) NOT NULL)"
            )
            await connection.execute(
                f"CREATE INDEX IF NOT EXISTS {_quoted(index_base + '_fileid')} "
                f"ON {table} (fileid)"
            )
            await connection.execute(
                f"CREATE INDEX IF NOT EXISTS {_quoted(index_base + '_embedding')} "
                f"ON {table} USING hnsw (embedding vector_cosine_ops)"
            )

    @staticmethod
    async def add_rows(
        endpoint: str, api_key: str, tenant_id: str, rows: Sequence[VectorRow]
    ) -> None:
        """行を保存する（表がなければ作り、同じ id は更新する）。

        Parameters
        ----------
        endpoint : str
            接続先の URL。
        api_key : str
            パスワード。
        tenant_id : str
            テナントの ID。
        rows : Sequence[VectorRow]
            保存する行。

        Raises
        ------
        ValueError
            次元数が 1536 でない行があるとき（何も保存しない）。
        HTTPException
            接続・保存に失敗したとき（400）。
        """
        records = [
            (
                row.id,
                row.file_id,
                row.file_path,
                row.content,
                vector_literal(row.embedding),
            )
            for row in rows
        ]
        table = _quoted(table_name_for_tenant(tenant_id))
        connection = await _connect(endpoint, api_key)
        try:
            await PgVectorStoreClient._create_table(connection, tenant_id)
            await connection.executemany(
                f"INSERT INTO {table} (id, fileid, filepath, content, embedding) "  # noqa: S608
                "VALUES ($1, $2, $3, $4, $5::vector) "
                "ON CONFLICT (id) DO UPDATE SET fileid = EXCLUDED.fileid, "
                "filepath = EXCLUDED.filepath, content = EXCLUDED.content, "
                "embedding = EXCLUDED.embedding",
                records,
            )
        except (OSError, asyncpg.PostgresError) as error:
            logger.error("ベクトルDBへの保存に失敗しました: %s", type(error).__name__)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=CONNECTION_FAILED_DETAIL
            ) from None
        finally:
            await connection.close()

    @staticmethod
    async def delete_by_file_id(
        endpoint: str, api_key: str, tenant_id: str, file_id: str
    ) -> int:
        """ファイル 1 つ分の行を削除する。

        Parameters
        ----------
        endpoint : str
            接続先の URL。
        api_key : str
            パスワード。
        tenant_id : str
            テナントの ID。
        file_id : str
            削除するファイルの ID。

        Returns
        -------
        int
            削除した行数。表がなければ 0。

        Raises
        ------
        HTTPException
            接続・削除に失敗したとき（400）。
        """
        table = _quoted(table_name_for_tenant(tenant_id))
        connection = await _connect(endpoint, api_key)
        try:
            result = await connection.execute(
                f"DELETE FROM {table} WHERE fileid = $1",  # noqa: S608
                file_id,
            )
        except asyncpg.UndefinedTableError:
            return 0
        except (OSError, asyncpg.PostgresError) as error:
            logger.error("ベクトルDBの削除に失敗しました: %s", type(error).__name__)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=CONNECTION_FAILED_DETAIL
            ) from None
        finally:
            await connection.close()
        # asyncpg は "DELETE 3" の形の文字列を返す
        return int(result.rsplit(" ", 1)[-1])
