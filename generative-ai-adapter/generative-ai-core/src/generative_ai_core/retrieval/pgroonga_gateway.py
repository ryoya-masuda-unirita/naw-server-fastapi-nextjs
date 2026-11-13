"""PGroonga の全文検索（移植元 JdbcPgroongaSearchGateway）。

PostgreSQL の `public.<テーブル>.content` を `&@~` で検索し、準備状況（拡張・インデックス・
実行計画でのインデックス使用）を確かめる。DB への問い合わせは `PgroongaJdbcOperations`
に分け、テストでは差し替えられる。
"""

import logging
import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

from generative_ai_core.failure import sanitize
from generative_ai_core.retrieval.hybrid.models import (
    HybridRetrievalRequest,
    RetrievalCandidate,
    RetrievalChannel,
)
from generative_ai_core.retrieval.hybrid.services import ReadinessSignals
from generative_ai_core.vector.target import (
    CoreVectorDbTarget,
    connect,
    pgroonga_content_index_name,
    safe_identifier,
)

logger = logging.getLogger(__name__)

SCHEMA = "public"
READINESS_QUERY = "readiness"
EXTENSION_SQL = "select exists (select 1 from pg_extension where extname = 'pgroonga')"
REQUIRED_INDEX_SQL = """
select exists (
  select 1
  from pg_index i
  join pg_class idx on idx.oid = i.indexrelid
  join pg_am am on am.oid = idx.relam
  join pg_class tbl on tbl.oid = i.indrelid
  join pg_namespace ns on ns.oid = tbl.relnamespace
  where ns.nspname = 'public'
    and tbl.relname = %s
    and am.amname = 'pgroonga'
    and idx.relname = %s
)
"""


def search_sql(table_name: str) -> str:
    """全文検索の SQL を作る（テーブル名は検証済みの識別子）。

    Parameters
    ----------
    table_name : str
        テーブル名。

    Returns
    -------
    str
        SQL。
    """
    return (
        "select id, content, pgroonga_score(tableoid, ctid) pgroonga_score from "
        f"{SCHEMA}.{table_name} where content &@~ %s "
        "order by pgroonga_score desc, id asc limit %s"
    )


def index_usage_sql(table_name: str) -> str:
    """インデックスの使用を確かめる実行計画の SQL を作る。

    Parameters
    ----------
    table_name : str
        テーブル名。

    Returns
    -------
    str
        SQL。
    """
    return (
        f"explain (format text, costs off) select id from {SCHEMA}.{table_name} "
        "where content &@~ %s order by pgroonga_score(tableoid, ctid) desc, id asc "
        "limit 1"
    )


def index_usage_verified(
    plan_lines: Sequence[str | None] | None, index_name: str
) -> bool:
    """実行計画に必要なインデックスの使用が出ているかを返す。

    Parameters
    ----------
    plan_lines : Sequence[str | None] | None
        実行計画の行。
    index_name : str
        必要なインデックス名。

    Returns
    -------
    bool
        index scan・index only scan・bitmap index scan のいずれかで使われていれば True。
    """
    if plan_lines is None or not index_name.strip():
        return False
    pattern = re.compile(
        r".*\b(index scan|index only scan|bitmap index scan)\b.*\b(using|on)\s+"
        + re.escape(index_name.lower())
        + r"\b.*"
    )
    for line in plan_lines:
        normalized = "" if line is None else line.replace('"', "").lower().strip()
        if pattern.fullmatch(normalized):
            return True
    return False


@dataclass(frozen=True)
class PgroongaRow:
    """全文検索の 1 行。

    Attributes
    ----------
    id : str
        チャンク ID。
    content : str
        本文。
    score : float
        PGroonga のスコア。
    """

    id: str
    content: str
    score: float

    def __post_init__(self) -> None:
        """ID と本文を整える。"""
        object.__setattr__(self, "id", "" if self.id is None else str(self.id).strip())
        object.__setattr__(
            self, "content", "" if self.content is None else self.content
        )


class PgroongaJdbcOperations(Protocol):
    """PGroonga への問い合わせ（DB に触る部分）。"""

    def readiness_signals(self, table_name: str) -> ReadinessSignals:
        """準備状況を調べる。

        Parameters
        ----------
        table_name : str
            テーブル名。

        Returns
        -------
        ReadinessSignals
            準備状況。
        """
        ...

    def search(
        self, table_name: str, query: str, max_results: int
    ) -> list[PgroongaRow]:
        """全文検索する。

        Parameters
        ----------
        table_name : str
            テーブル名。
        query : str
            検索文字列。
        max_results : int
            最大件数。

        Returns
        -------
        list[PgroongaRow]
            行。
        """
        ...


class PsycopgPgroongaOperations:
    """psycopg で PGroonga へ問い合わせる（呼び出しごとに接続する）。"""

    def __init__(self, target: CoreVectorDbTarget) -> None:
        """接続先を受け取る。

        Parameters
        ----------
        target : CoreVectorDbTarget
            接続先。
        """
        self._target = target

    def readiness_signals(self, table_name: str) -> ReadinessSignals:
        """拡張・インデックス・インデックスの使用を順に確かめる。

        Parameters
        ----------
        table_name : str
            テーブル名。

        Returns
        -------
        ReadinessSignals
            準備状況。前の段階が満たされなければ、後の段階は偽。
        """
        index_name = pgroonga_content_index_name(table_name)
        with connect(self._target) as connection:
            extension = connection.execute(EXTENSION_SQL).fetchone()
            if not (extension and extension[0]):
                return ReadinessSignals(False, False, False)
            index = connection.execute(
                REQUIRED_INDEX_SQL, (table_name, index_name)
            ).fetchone()
            if not (index and index[0]):
                return ReadinessSignals(True, False, False)
            plan = connection.execute(
                index_usage_sql(table_name), (READINESS_QUERY,)
            ).fetchall()
            lines = [None if row[0] is None else str(row[0]) for row in plan]
            return ReadinessSignals(True, True, index_usage_verified(lines, index_name))

    def search(
        self, table_name: str, query: str, max_results: int
    ) -> list[PgroongaRow]:
        """全文検索する。

        Parameters
        ----------
        table_name : str
            テーブル名。
        query : str
            検索文字列（PGroonga のクエリ構文）。
        max_results : int
            最大件数。

        Returns
        -------
        list[PgroongaRow]
            スコアの大きい順の行。
        """
        with connect(self._target) as connection:
            rows = connection.execute(
                search_sql(table_name), (query, max_results)
            ).fetchall()
        return [PgroongaRow(str(r[0]), r[1], float(r[2])) for r in rows]


class JdbcPgroongaSearchGateway:
    """PGroonga の全文検索の入口（`PgroongaSearchGateway`）。"""

    def __init__(
        self,
        target: CoreVectorDbTarget,
        operations: PgroongaJdbcOperations | None = None,
    ) -> None:
        """接続先と問い合わせの実装を受け取る。

        Parameters
        ----------
        target : CoreVectorDbTarget
            接続先。
        operations : PgroongaJdbcOperations | None
            問い合わせの実装。省略すると psycopg。
        """
        self._target = target
        self._operations = operations or PsycopgPgroongaOperations(target)

    def search(
        self,
        request: HybridRetrievalRequest,
        candidate_source: Sequence[RetrievalCandidate],
    ) -> list[RetrievalCandidate]:
        """全文検索して候補にする。

        Parameters
        ----------
        request : HybridRetrievalRequest
            リクエスト。
        candidate_source : Sequence[RetrievalCandidate]
            使わない（移植元と同じシグネチャ）。

        Returns
        -------
        list[RetrievalCandidate]
            全文検索チャネルの候補。
        """
        table_name = safe_identifier(self._target.required_table_name())
        rows = self._operations.search(
            table_name,
            request.query_text_ephemeral,
            request.limit_for(RetrievalChannel.JAPANESE_FULL_TEXT),
        )
        return [self._candidate(row, request) for row in rows]

    def readiness_signals(self) -> ReadinessSignals:
        """準備状況を返す。調べられなければすべて偽（フェイルクローズ）。

        Returns
        -------
        ReadinessSignals
            準備状況。
        """
        try:
            table_name = safe_identifier(self._target.required_table_name())
            return self._operations.readiness_signals(table_name)
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            logger.warning("pgroonga readiness check failed: %s", type(e).__name__)
            return ReadinessSignals(False, False, False)

    @staticmethod
    def _candidate(
        row: PgroongaRow, request: HybridRetrievalRequest
    ) -> RetrievalCandidate:
        """全文検索の 1 行を候補にする。

        Parameters
        ----------
        row : PgroongaRow
            行。
        request : HybridRetrievalRequest
            リクエスト。

        Returns
        -------
        RetrievalCandidate
            候補。
        """
        return RetrievalCandidate(
            row.id,
            row.id,
            "current",
            "postgresql-pgroonga",
            row.id,
            sanitize(row.content),
            RetrievalChannel.JAPANESE_FULL_TEXT,
            1,
            row.score,
            request.serving_profile_id,
            True,
            request.tenant_id,
            1,
            "tenant_wide",
            (),
            {
                "pgroongaChannel": "jdbc",
                "pgroongaIndexUsage": "verified",
                "rawQueryPersisted": "false",
            },
        )
