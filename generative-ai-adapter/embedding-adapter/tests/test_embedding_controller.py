"""EmbeddingController のテスト。

移植元の EmbeddingControllerTest・JobSuccessTsvContractTest・
EmbeddingControllerGraphCandidateCredentialTest のうち、分割・TSV 出力・ベクトルDB への
追加と削除・Graph 書き込みの振る舞いを、偽の埋め込みモデル / ベクトルストアで確かめる。
実際の DB・API には接続しない。
"""

import re
from pathlib import Path

import pytest
from embedding_adapter.constants import (
    OUTPUT_TYPE_TEXT,
    OUTPUT_TYPE_VDB_ADD,
    OUTPUT_TYPE_VDB_NEW,
)
from embedding_adapter.controller.embedding_controller import (
    EmbeddingController,
    java_split_lines,
)
from embedding_adapter.domain import (
    Embedding,
    EmbeddingNetworkProperties,
    EmbeddingProviderProperties,
    GraphChunkWriteRequest,
    GraphWriteResult,
    GraphWriteStatus,
    VectorDBConfig,
)
from embedding_adapter.model import AbstractEmbeddingModel, AbstractVectorStoreService
from embedding_adapter.output import JobOutputRunContext
from generative_ai_core.media import CoreMediaPreprocessingMode


class FakeModel(AbstractEmbeddingModel):
    """固定のベクトルを返す偽の埋め込みモデル。"""

    def create_embedding(self, text: str | None) -> list[float]:
        """固定のベクトルを返す。

        Parameters
        ----------
        text : str | None
            入力（使わない）。

        Returns
        -------
        list[float]
            固定のベクトル。
        """
        return [0.1, 0.2]


class FakeStore(AbstractVectorStoreService):
    """追加・削除を記録する偽のベクトルストア（Graph 書き込みも受ける）。"""

    def __init__(self, graph_failure: str | None = None) -> None:
        """記録用のリストを作る。

        Parameters
        ----------
        graph_failure : str | None
            Graph 書き込みを失敗させるときのメッセージ。
        """
        self.added: list[Embedding] = []
        self.deleted: list[str] = []
        self.graph_requests: list[GraphChunkWriteRequest] = []
        self._graph_failure = graph_failure

    def add(self, embedding: Embedding) -> str:
        """追加を記録し、連番の行 ID を返す。

        Parameters
        ----------
        embedding : Embedding
            追加するチャンク。

        Returns
        -------
        str
            行 ID。
        """
        self.added.append(embedding)
        return f"row-{len(self.added)}"

    def delete(self, id: str) -> None:
        """削除を記録する。

        Parameters
        ----------
        id : str
            ファイル ID。
        """
        self.deleted.append(id)

    def update(self, embedding: Embedding) -> None:
        """何もしない。

        Parameters
        ----------
        embedding : Embedding
            更新するチャンク。
        """

    def search(self, query: str, top_k: int) -> list[Embedding]:
        """空の結果を返す。

        Parameters
        ----------
        query : str
            検索文字列。
        top_k : int
            件数。

        Returns
        -------
        list[Embedding]
            空のリスト。
        """
        return []

    def write_graph_chunk(self, request: GraphChunkWriteRequest) -> GraphWriteResult:
        """Graph 書き込みを記録する。

        Parameters
        ----------
        request : GraphChunkWriteRequest
            書き込み要求。

        Returns
        -------
        GraphWriteResult
            成功（`graph_failure` があれば失敗）。
        """
        self.graph_requests.append(request)
        if self._graph_failure:
            return GraphWriteResult.failure(
                GraphWriteStatus.FAILED_WRITE,
                request.file_id,
                [],
                self._graph_failure,
                None,
            )
        return GraphWriteResult.success(request.file_id, [request.vector_row_id or ""])

    def delete_graph_data_by_ids(self, ids: list[str]) -> GraphWriteResult:
        """何もしない。

        Parameters
        ----------
        ids : list[str]
            行 ID。

        Returns
        -------
        GraphWriteResult
            無効の結果。
        """
        return GraphWriteResult.disabled()


def make_controller(store: FakeStore | None = None) -> EmbeddingController:
    """偽のモデルとストアを差し込んだコントローラーを作る。

    Parameters
    ----------
    store : FakeStore | None
        ベクトルストア。

    Returns
    -------
    EmbeddingController
        コントローラー。
    """
    return EmbeddingController(
        "",
        EmbeddingNetworkProperties(),
        EmbeddingProviderProperties(),
        VectorDBConfig(),
        CoreMediaPreprocessingMode.DISABLED,
        embedding_model=FakeModel(),
        vector_db_model=store or FakeStore(),
    )


def read_tsv(path: Path) -> list[list[str]]:
    """出力 TSV を読み、各行を引用符を外したフィールドに分ける。

    Parameters
    ----------
    path : Path
        TSV のパス。

    Returns
    -------
    list[list[str]]
        行ごとのフィールド。
    """
    # 本文に改行が入るため、行ではなく 4 フィールドの並びで切り出す
    pattern = re.compile(r'"([^"\t]*)"\t"(.*?)"\t"([^"\t]*)"\t"([^"\t]*)"\n', re.DOTALL)
    rows = [list(m.groups()) for m in pattern.finditer(path.read_text("utf-8"))]
    return rows


def test_java_split_lines_matches_java_rules() -> None:
    """Java の split と同じく、区切りなしは元の文字列、末尾の空要素は捨てること"""
    assert java_split_lines("") == [""]
    assert java_split_lines("a") == ["a"]
    assert java_split_lines("a\nb\n\n") == ["a", "b"]


def test_text_output_writes_chunks_without_vector_db(tmp_path: Path) -> None:
    """出力モード 0 は分割して TSV に書くだけで、ベクトルDB に追加しないこと"""
    source = tmp_path / "in.txt"
    source.write_text("aaaa\nbbbb\ncccc\n", encoding="utf-8")
    out = tmp_path / "out.tsv"
    store = FakeStore()
    controller = make_controller(store)

    controller.execute_embedding(9, str(source), str(out), OUTPUT_TYPE_TEXT, "id-1")

    rows = read_tsv(out)
    assert [r[1] for r in rows] == ["aaaa\nbbbb\n", "cccc\n"]
    assert store.added == []
    # 出力のファイルパス列と、行 ID 列は空、ファイル ID 列は全行で同じ
    assert all(r[0] == str(source) and r[2] == "" for r in rows)
    assert len({r[3] for r in rows}) == 1


def test_vdb_add_calls_store_and_writes_row_and_file_ids(tmp_path: Path) -> None:
    """出力モード 1 はチャンクをベクトルDB に追加し、行 ID とファイル ID を TSV に書くこと"""
    source = tmp_path / "in.txt"
    source.write_text("one\ntwo\n", encoding="utf-8")
    out = tmp_path / "out.tsv"
    store = FakeStore()
    controller = make_controller(store)

    controller.execute_embedding(100, str(source), str(out), OUTPUT_TYPE_VDB_ADD, None)

    assert len(store.added) == 1
    chunk = store.added[0]
    assert chunk.content == "one\ntwo\n"
    assert chunk.source_file_path == str(source)
    rows = read_tsv(out)
    assert rows[0][2] == "row-1"
    assert rows[0][3] == chunk.file_unique_id


def test_quotes_in_text_are_replaced_in_tsv(tmp_path: Path) -> None:
    """本文の二重引用符は TSV では一重引用符に置き換わること"""
    source = tmp_path / "in.txt"
    source.write_text('say "hi"\n', encoding="utf-8")
    out = tmp_path / "out.tsv"

    make_controller().execute_embedding(
        100, str(source), str(out), OUTPUT_TYPE_TEXT, None
    )

    assert "say 'hi'" in out.read_text(encoding="utf-8")


def test_empty_path_and_missing_file_fail(tmp_path: Path) -> None:
    """ファイルパスが空・ファイルがないときは RuntimeError になること"""
    controller = make_controller()
    with pytest.raises(RuntimeError, match="ファイルパスが取得できませんでした"):
        controller.execute_embedding(1, "", str(tmp_path / "o"), 0, None)
    with pytest.raises(RuntimeError, match="ファイルが存在しません"):
        controller.execute_embedding(
            1, str(tmp_path / "none.txt"), str(tmp_path / "o"), 0, None
        )


def test_graph_chunks_are_chained_with_previous_row_id(tmp_path: Path) -> None:
    """Graph 書き込みは連番と直前の行 ID を付けてチャンクごとに呼ばれること"""
    source = tmp_path / "in.txt"
    source.write_text("aaaa\nbbbb\ncccc\n", encoding="utf-8")
    store = FakeStore()
    make_controller(store).execute_embedding(
        5, str(source), str(tmp_path / "o"), OUTPUT_TYPE_VDB_NEW, "id"
    )

    sequences = [r.chunk_sequence for r in store.graph_requests]
    assert sequences == list(range(len(sequences))) and len(sequences) >= 2
    assert store.graph_requests[0].previous_vector_row_id is None
    assert store.graph_requests[1].previous_vector_row_id == "row-1"


def test_graph_write_failure_fails_the_run(tmp_path: Path) -> None:
    """Graph 書き込みが失敗したら実行が RuntimeError で止まること"""
    source = tmp_path / "in.txt"
    source.write_text("text\n", encoding="utf-8")
    controller = make_controller(FakeStore(graph_failure="graph down"))
    with pytest.raises(RuntimeError, match="graph down"):
        controller.execute_embedding(
            100, str(source), str(tmp_path / "o"), OUTPUT_TYPE_VDB_ADD, "id"
        )


def test_rejected_source_success_tsv_is_not_written(tmp_path: Path) -> None:
    """Graph Candidate で拒否されたファイルは、バッファした成功 TSV を書かないこと"""
    source = tmp_path / "in.txt"
    source.write_text("text\n", encoding="utf-8")
    out = tmp_path / "out.tsv"
    controller = make_controller()
    context = JobOutputRunContext.enabled()
    context.mark_learnable_reject(str(source))
    controller.wire_job_output_context(context)

    controller.execute_embedding(100, str(source), str(out), OUTPUT_TYPE_VDB_ADD, "id")

    assert out.read_text(encoding="utf-8") == ""


def test_delete_embedding_strips_id_and_rejects_blank() -> None:
    """削除は前後の空白を除いたファイル ID で行い、空の ID は拒否すること"""
    store = FakeStore()
    controller = make_controller(store)
    controller.delete_embedding("  file-1 ")
    assert store.deleted == ["file-1"]
    with pytest.raises(RuntimeError, match="fileUniqueId must not be blank"):
        controller.delete_embedding("  ")
    with pytest.raises(RuntimeError, match="fileUniqueId must not be blank"):
        controller.delete_embedding(None)


def test_first_line_longer_than_split_length_does_not_create_empty_chunk(
    tmp_path: Path,
) -> None:
    """先頭の行が分割文字数より長くても、空のチャンクは登録も出力もしないこと"""
    source = tmp_path / "in.txt"
    source.write_text("a very long first line\nshort\n", encoding="utf-8")
    out = tmp_path / "out.tsv"
    store = FakeStore()

    make_controller(store).execute_embedding(
        5, str(source), str(out), OUTPUT_TYPE_VDB_ADD, None
    )

    assert [e.content for e in store.added] == ["a very long first line\n", "short\n"]
    assert [r[1] for r in read_tsv(out)] == ["a very long first line\n", "short\n"]
