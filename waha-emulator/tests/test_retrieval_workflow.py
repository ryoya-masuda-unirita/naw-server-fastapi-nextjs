"""RAG の前に検索アダプタを動かすワークフロー（検索 → 生成AI）のテスト。

DB・埋め込み API には接続しない。core の検索のうち、DB への問い合わせ（ベクトル検索）と
クエリの埋め込みだけを偽物に差し替え、検索アダプタ → RAG Context JSON → 生成AIアダプタ
（echo）の流れを通しで確かめる。
"""

import json
import logging
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import pytest
from generative_ai_core.retrieval.models import (
    CoreRetrievalRequest,
    CoreVectorSearchResult,
)
from generative_ai_core.retrieval.postgresql_provider import (
    CorePostgreSqlRetrievalProvider,
)
from generative_ai_core.retrieval.runtime import (
    CoreRetrievalRuntime,
    default_provider_runtime,
)
from generative_ai_core.vector.target import CoreVectorDbTarget
from retrieval_adapter.constants import RetrievalPropertyIds

from waha_emulator.sessions import SLOT_QUESTION, SLOT_TEXTDATA, SlotFile
from waha_emulator.workflow_config import (
    RAG_OUTPUT_TYPE,
    WorkflowConfigError,
    parse_workflow_config,
)
from waha_emulator.workflows.base import WorkflowError, WorkflowRequest
from waha_emulator.workflows.generative_ai import (
    RETRIEVAL_FAILED_PREFIX,
    GenerativeAiWorkflow,
    build_adapter_job,
)

QUESTION = "出張旅費の精算期限は？"
ECHO = {
    "VENDOR": "Echo",
    "URL": "http://echo.invalid",
    "API_KEY": "echo",
    "MODEL_NAME": "echo",
}
RETRIEVAL_PROPERTIES = {
    "VENDOR": "Echo",
    "URL": "http://echo.invalid",
    "API_KEY": "echo",
    "MODEL_NAME": "echo",
    "VDB_VENDOR": "PostgreSQL(PGVector)",
    "VDB_URL": "db.invalid:5432",
    "VDB_USER_NAME": "user",
    "VDB_PASSWORD": "password",
    "VDB_DATABASE_NAME": "appdb",
    "VDB_TABLE_NAME": "vectors",
    "SEARCH_COUNT": "2",
}
SOURCE_PATH = "/docs/keihi.md"


def _config(**retrieval: Any) -> dict[str, Any]:
    """検索付きの RAG の定義を持つ設定を作る。

    Parameters
    ----------
    **retrieval : Any
        `retrieval.properties` を上書きする値。

    Returns
    -------
    dict[str, Any]
        設定（JSON を読み込んだ形）。
    """
    return {
        "default": {"properties": dict(ECHO)},
        "services": {
            "rag": {
                "outputType": 1,
                "properties": dict(ECHO),
                "retrieval": {"properties": {**RETRIEVAL_PROPERTIES, **retrieval}},
            }
        },
    }


class FakeSearchClient:
    """DB の代わりに、決めたチャンクを返し、受け取った問い合わせを記録する。"""

    def __init__(self) -> None:
        """記録用のリストを用意する。"""
        self.calls: list[tuple[CoreVectorDbTarget, tuple[float, ...], int]] = []

    def search(
        self,
        target: CoreVectorDbTarget,
        query_vector: Sequence[float],
        max_results: int,
        current_only: bool = False,
        tenant_id: str = "",
    ) -> list[CoreVectorSearchResult]:
        """記録して 2 件のチャンクを返す。

        Parameters
        ----------
        target : CoreVectorDbTarget
            接続先。
        query_vector : Sequence[float]
            クエリのベクトル。
        max_results : int
            最大件数。
        current_only : bool
            使わない。
        tenant_id : str
            使わない。

        Returns
        -------
        list[CoreVectorSearchResult]
            チャンク。
        """
        self.calls.append((target, tuple(query_vector), max_results))
        return [
            CoreVectorSearchResult(
                "chunk-1",
                "出張旅費の精算は、出張終了後5営業日以内に申請する。",
                1,
                {
                    "sourceRef.chunk-1": "keihi.md",
                    "sourceFilePath.chunk-1": SOURCE_PATH,
                },
            ),
            CoreVectorSearchResult("chunk-2", "就業規則の抜粋。", 2),
        ]


class FixedEmbedding:
    """決まったベクトルを返す偽の埋め込み。"""

    def embed(self, request: CoreRetrievalRequest) -> list[float]:
        """固定のベクトルを返す。

        Parameters
        ----------
        request : CoreRetrievalRequest
            使わない。

        Returns
        -------
        list[float]
            ベクトル。
        """
        return [0.5, 0.25]


def _runtime_factory(client: FakeSearchClient) -> Any:
    """偽の DB・埋め込みで動く core の検索を作る関数を返す。

    Parameters
    ----------
    client : FakeSearchClient
        偽の問い合わせ。

    Returns
    -------
    Any
        引数なしで `CoreRetrievalRuntime` を返す関数。
    """

    def factory() -> CoreRetrievalRuntime:
        provider = CorePostgreSqlRetrievalProvider(client, FixedEmbedding())
        return CoreRetrievalRuntime(default_provider_runtime(provider))

    return factory


def _request(inputs: dict[str, SlotFile]) -> WorkflowRequest:
    """ワークフローへの入力を作る。

    Parameters
    ----------
    inputs : dict[str, SlotFile]
        入力スロット。

    Returns
    -------
    WorkflowRequest
        入力。
    """
    return WorkflowRequest(service_id="rag", params={}, inputs=inputs, stream=None)


def _question() -> dict[str, SlotFile]:
    """質問だけの入力スロットを作る。

    Returns
    -------
    dict[str, SlotFile]
        入力スロット。
    """
    return {SLOT_QUESTION: SlotFile("q.txt", "text/plain", QUESTION.encode())}


def test_config_accepts_retrieval_with_names_and_ids() -> None:
    """検索の設定は名前でも ID でも書け、ID に直して持つこと"""
    config = parse_workflow_config(_config(VENDOR="1", VDB_VENDOR="1"))
    definition = config.services["rag"]

    assert definition.retrieval is not None
    properties = definition.retrieval.properties
    assert properties[RetrievalPropertyIds.VENDOR] == "1"
    assert properties[RetrievalPropertyIds.VDB_VENDOR] == "1"
    assert properties[RetrievalPropertyIds.VDB_TABLE_NAME] == "vectors"
    assert "retrieval=PostgreSQL(PGVector)" in definition.describe()
    named = parse_workflow_config(_config())
    assert named.services["rag"].retrieval is not None
    assert (
        named.services["rag"].retrieval.properties[RetrievalPropertyIds.VENDOR] == "99"
    )


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda c: c["services"]["rag"].update(outputType=0), "outputType が 1"),
        (
            lambda c: c["services"]["rag"].update(ragContextJson="x.json"),
            "同時に書けません",
        ),
        (
            lambda c: c["services"]["rag"]["properties"].update(
                RAG_CONTEXT_JSON_ALLOW_ROOT="/x"
            ),
            "RAG_CONTEXT_JSON_ALLOW_ROOT",
        ),
        (
            lambda c: c["services"]["rag"]["retrieval"]["properties"].update(
                OUTPUT_DIR="C:\\x"
            ),
            "OUTPUT_DIR",
        ),
        (
            lambda c: c["services"]["rag"]["retrieval"]["properties"].update(NOPE="1"),
            "未知のプロパティ",
        ),
        (
            lambda c: c["services"]["rag"]["retrieval"]["properties"].update(
                VDB_VENDOR="Oracle"
            ),
            "VDB_VENDOR",
        ),
        (
            lambda c: c["services"]["rag"]["retrieval"]["properties"].update(
                SEARCH_COUNT="x"
            ),
            "検索クエリ数",
        ),
        (lambda c: c["services"]["rag"]["retrieval"].update(extra=1), "未知の項目"),
        (lambda c: c["services"]["rag"].update(retrieval="x"), "オブジェクト"),
    ],
)
def test_config_rejects_invalid_retrieval(mutate: Any, message: str) -> None:
    """検索の設定が不正なら、起動時（設定の読み込み）に理由付きで失敗すること"""
    config = _config()
    mutate(config)

    with pytest.raises(WorkflowConfigError, match=message):
        parse_workflow_config(config)


def test_build_adapter_job_points_rag_input_to_retrieval_output(tmp_path: Path) -> None:
    """検索アダプタの出力先を生成AIアダプタの index 6 と許可ルートにし、質問と textData を渡すこと"""
    definition = parse_workflow_config(_config()).services["rag"]
    inputs = {
        **_question(),
        SLOT_TEXTDATA: SlotFile("t.json", "application/json", b"{}"),
    }

    job = build_adapter_job(definition, _request(inputs), tmp_path)

    assert job.retrieval is not None
    assert [(c.index, c.col_type.name) for c in job.retrieval.columns] == [(0, "CHAR")]
    assert job.retrieval.record[0].s == QUESTION
    assert job.retrieval.properties[RetrievalPropertyIds.OUTPUT_DIR] == str(tmp_path)
    assert job.retrieval.properties[
        RetrievalPropertyIds.TEXT_DATA_JSON_FILE_PATH
    ] == str(tmp_path / "textData.json")
    assert job.record[-1].b_ary == str(tmp_path / job.retrieval.view_name).encode()
    assert definition.output_type == RAG_OUTPUT_TYPE


async def test_run_retrieval_then_generative_ai(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """質問で検索 → RAG Context JSON → 生成AI の順に動き、検索したチャンクが引用資料になること"""
    client = FakeSearchClient()
    definition = parse_workflow_config(_config()).services["rag"]
    workflow = GenerativeAiWorkflow(
        definition, retrieval_runtime_factory=_runtime_factory(client)
    )

    with caplog.at_level(logging.INFO):
        output = await workflow.run(_request(_question()))

    body = json.loads(output)
    assert body["answer"].endswith(QUESTION)
    # 元ファイルのパスがないチャンクは、生成AIアダプタが sourceRef（ここではチャンク ID）で補う
    assert body["filepaths"] == [SOURCE_PATH, "chunk-2"]
    contents = [r["content"] for r in body["references"]]
    assert len(contents) == 2
    assert "RAG_CONTEXT_BEGIN id=chunk-1" in contents[0]
    assert "5営業日以内" in contents[0]
    [(target, vector, max_results)] = client.calls
    assert (target.endpoint, target.table_name, max_results) == (
        "db.invalid:5432",
        "vectors",
        2,
    )
    assert vector == (0.5, 0.25)
    messages = [r.getMessage() for r in caplog.records]
    step1 = next(i for i, m in enumerate(messages) if "step 1/2 retrieval:" in m)
    done = next(
        i
        for i, m in enumerate(messages)
        if "step 1/2 retrieval finished: contexts=2" in m
    )
    step2 = next(i for i, m in enumerate(messages) if "step 2/2 generative-ai" in m)
    assert step1 < done < step2
    assert any("core retrieval finished: ids=2" in m for m in messages)
    assert "password" not in " ".join(messages)


async def test_run_retrieval_failure_is_workflow_error() -> None:
    """検索アダプタが失敗したら「検索アダプタの実行に失敗しました」の WorkflowError になり、生成AIは動かないこと"""
    properties = {**RETRIEVAL_PROPERTIES}
    del properties["VDB_PASSWORD"]
    config = _config()
    config["services"]["rag"]["retrieval"]["properties"] = properties
    definition = parse_workflow_config(config).services["rag"]
    workflow = GenerativeAiWorkflow(
        definition, retrieval_runtime_factory=_runtime_factory(FakeSearchClient())
    )

    with pytest.raises(WorkflowError, match=RETRIEVAL_FAILED_PREFIX) as info:
        await workflow.run(_request(_question()))

    assert "property 42 PostgreSQL password" in str(info.value)
