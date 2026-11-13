"""実際の PostgreSQL（pgvector + PGroonga + Apache AGE）に接続する確認。

通常のテストでは動かさない（`NAW_RETRIEVAL_REAL_DB=host:port` を設定したときだけ）。接続先は
`onprem/vector-db` の Docker と同じ構成で、DB・ユーザー `onprem_vector`、パスワード
`onprem_vector_password`。結果は docs/issue-299/08_動作確認.md に貼る。
"""

import os

import pytest
from generative_ai_core.retrieval.age_graph import PsycopgApacheAgeGraphClient
from generative_ai_core.retrieval.hybrid.models import HybridRetrievalRequest
from generative_ai_core.retrieval.models import (
    CoreRetrievalRequest,
    CoreVectorSearchResult,
)
from generative_ai_core.retrieval.pgroonga_gateway import JdbcPgroongaSearchGateway
from generative_ai_core.retrieval.query_embedding import echo_vector
from generative_ai_core.retrieval.runtime import CoreRetrievalRuntime
from generative_ai_core.vector.target import (
    CoreVectorDbTarget,
    connect,
    ensure_age_session,
)

HOST = os.environ.get("NAW_RETRIEVAL_REAL_DB", "")
TABLE = "i299_real_vectors"
GRAPH = "i299_real_graph"
IDS = ["a0000000-0000-0000-0000-000000000001", "a0000000-0000-0000-0000-000000000002"]
DOCS = [
    (
        IDS[0],
        "keihi.md",
        "/docs/keihi.md",
        "出張旅費の精算は、出張終了後5営業日以内に申請してください。",
    ),
    (
        IDS[1],
        "kisoku.md",
        "/docs/kisoku.md",
        "就業規則では、始業時刻は午前9時と定める。",
    ),
]

pytestmark = pytest.mark.skipif(
    not HOST, reason="NAW_RETRIEVAL_REAL_DB を設定したときだけ実行する"
)


@pytest.fixture
def target() -> CoreVectorDbTarget:
    """テーブル・インデックス・graph を作った接続先を返す。

    Returns
    -------
    CoreVectorDbTarget
        接続先。
    """
    base = CoreVectorDbTarget.pg_vector(
        HOST, "onprem_vector", "onprem_vector_password", "onprem_vector", TABLE, False
    )
    with connect(base) as conn:
        conn.execute(f"DROP TABLE IF EXISTS public.{TABLE}")
        conn.execute(
            f"CREATE TABLE public.{TABLE} (id uuid PRIMARY KEY, fileid text NOT NULL, "
            "filepath text, content text NOT NULL, embedding vector(1536) NOT NULL)"
        )
        conn.execute(
            f"CREATE INDEX {TABLE}_pgroonga_content_idx ON public.{TABLE} USING pgroonga (content)"
        )
        for chunk_id, file_id, path, content in DOCS:
            vector = "[" + ",".join(repr(v) for v in echo_vector(content)) + "]"
            conn.execute(
                f"INSERT INTO public.{TABLE} VALUES (%s, %s, %s, %s, %s::vector)",
                (chunk_id, file_id, path, content, vector),
            )
        ensure_age_session(conn)
        found = conn.execute(
            "SELECT COUNT(*) FROM ag_catalog.ag_graph WHERE name = %s", (GRAPH,)
        ).fetchone()
        if found and found[0]:
            conn.execute(f"SELECT drop_graph('{GRAPH}', true)")
        conn.execute(f"SELECT create_graph('{GRAPH}')")
        conn.execute(
            f"SELECT * FROM cypher('{GRAPH}', $$ CREATE (f:File {{path: '/docs/keihi.md'}}), "
            f"(c1:Chunk {{id: '{IDS[0]}', fileId: 'keihi.md', sequence: 1}}), "
            f"(c2:Chunk {{id: '{IDS[1]}', fileId: 'keihi.md', sequence: 2}}), "
            f"(v1:VectorRow {{id: '{IDS[0]}'}}), (v2:VectorRow {{id: '{IDS[1]}'}}), "
            "(f)-[:HAS_CHUNK]->(c1), (f)-[:HAS_CHUNK]->(c2), (c1)-[:HAS_VECTOR]->(v1), "
            "(c2)-[:HAS_VECTOR]->(v2), (c1)-[:NEXT_CHUNK]->(c2) $$) AS (r agtype)"
        )
        conn.commit()
    return base


def test_vector_search_on_real_postgres(target: CoreVectorDbTarget) -> None:
    """実 DB で、質問に近い順にチャンクが返り、本文・出典が証拠に入ること"""
    request = (
        CoreRetrievalRequest.builder("PostgreSQL")
        .query("出張旅費の精算の期限")
        .max_results(2)
        .vector_db_target(target)
        .query_vector(echo_vector("出張旅費の精算の期限"))
        .build()
    )

    result = CoreRetrievalRuntime().retrieve(request)

    assert result.failure is None
    assert result.ordered_ids[0] == IDS[0]
    assert result.evidence[f"sourceFilePath.{IDS[0]}"] == "/docs/keihi.md"


def test_pgroonga_on_real_postgres(target: CoreVectorDbTarget) -> None:
    """実 DB で、PGroonga の準備確認（拡張・インデックス・実行計画）と全文検索が通ること"""
    gateway = JdbcPgroongaSearchGateway(target)

    signals = gateway.readiness_signals()
    hits = gateway.search(HybridRetrievalRequest(query_text_ephemeral="出張旅費"), [])

    assert (signals.extension_available, signals.required_index_available) == (
        True,
        True,
    )
    assert signals.index_usage_verified
    assert [h.chunk_id for h in hits] == [IDS[0]]


def test_age_graph_on_real_postgres(target: CoreVectorDbTarget) -> None:
    """実 DB で、AGE の graph から前後のチャンクの候補を引けること（graph がなければ失敗）"""
    client = PsycopgApacheAgeGraphClient()

    client.ensure_graph_readable(target, GRAPH)
    kinds = {
        c.relation_kind
        for c in client.query_candidates(
            target, GRAPH, CoreVectorSearchResult(IDS[0], "", 1)
        )
    }

    assert kinds == {"SEED", "GRAPH_NEIGHBOR", "NEXT_CHUNK"}
    with pytest.raises(RuntimeError, match="does not exist"):
        client.ensure_graph_readable(target, "no_such_graph")
