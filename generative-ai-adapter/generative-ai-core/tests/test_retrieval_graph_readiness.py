"""Graph RAG の実行環境の確認（VERIFY_ONLY）のテスト。

移植元 `GraphRagRuntimeBootstrapService` の検証経路に当たる。偽の接続で、足りないものごとの
失敗の分類と、全部そろったときの成功を確かめる。
"""

from typing import Any

from generative_ai_core.retrieval import graph_readiness as gr


class Cursor:
    """1 行を返す偽のカーソル。"""

    def __init__(self, row: tuple[Any, ...] | None) -> None:
        """返す行を決める。

        Parameters
        ----------
        row : tuple[Any, ...] | None
            行。なければ None。
        """
        self.row = row

    def fetchone(self) -> tuple[Any, ...] | None:
        """行を返す。

        Returns
        -------
        tuple[Any, ...] | None
            行。
        """
        return self.row


class Connection:
    """足りないリソースを指定できる偽の接続。"""

    def __init__(self, missing: str = "", embedding_type: str = "vector(1536)") -> None:
        """足りないリソースの印と、埋め込み列の型を決める。

        Parameters
        ----------
        missing : str
            SQL かパラメータにこの文字列を含む問い合わせは「なし」を返す。
        embedding_type : str
            `chunk_embeddings.embedding` の型。
        """
        self.missing = missing
        self.embedding_type = embedding_type

    def execute(self, sql: str, params: tuple[Any, ...]) -> Cursor:
        """問い合わせに答える。

        Parameters
        ----------
        sql : str
            SQL。
        params : tuple[Any, ...]
            パラメータ。

        Returns
        -------
        Cursor
            結果。
        """
        if self.missing and (self.missing in sql or self.missing in params):
            return Cursor(None)
        if "format_type" in sql:
            return Cursor((self.embedding_type,))
        if "relrowsecurity" in sql:
            return Cursor(("t:t",))
        return Cursor((1,))


def _verify(connection: Connection) -> gr.GraphRagRuntimeReadinessResult:
    """確認を実行する。

    Parameters
    ----------
    connection : Connection
        偽の接続。

    Returns
    -------
    gr.GraphRagRuntimeReadinessResult
        結果。
    """
    return gr.verify_with_connection(connection, gr.GraphRagRuntimeBootstrapRequest())


def test_all_resources_present_is_ready() -> None:
    """そろっていれば ready で、確かめたリソースの一覧を返すこと"""
    result = _verify(Connection())

    assert result.ready
    assert result.failure_code is None
    assert "age-graph:secuaigent_core_graph" in result.resources_checked


def test_missing_resource_failure_codes() -> None:
    """足りないものに応じて、失敗の分類が変わること"""
    cases = {
        "age": "missing_extension",
        "tenants": "incompatible_schema",
        "chunks_s08_pgroonga_content_idx": "incompatible_schema",
        "set_request_context": "incompatible_schema",
        "graphrag_s01_app": "incompatible_schema",
        "secuaigent_core_graph": "age_graph_unavailable",
    }
    for missing, code in cases.items():
        result = _verify(Connection(missing))

        assert not result.ready, missing
        assert result.failure_code == code, missing
        assert result.status == "failed"


def test_embedding_column_must_be_vector_1536() -> None:
    """埋め込み列が vector(1536) でなければ incompatible_schema になること"""
    result = _verify(Connection(embedding_type="vector(768)"))

    assert result.failure_code == "incompatible_schema"
    assert "incompatible" in result.sanitized_evidence


def test_evidence_hides_sql_and_catalog() -> None:
    """証拠の文字列から SQL とカタログ名を伏せること"""
    result = gr.GraphRagRuntimeReadinessResult.failed(
        gr.GraphRagRuntimeTargetDescriptor(),
        "x",
        [],
        "select * from ag_catalog.ag_graph; ok",
    )

    assert "select" not in result.sanitized_evidence.lower()
    assert "ag_catalog" not in result.sanitized_evidence


def test_graph_name_validation() -> None:
    """graph 名は安全な識別子だけで、空なら既定の名前になること"""
    assert gr.normalize_graph_name(" ") == "secuaigent_core_graph"
    try:
        gr.normalize_graph_name("bad name")
    except ValueError as e:
        assert "safe PostgreSQL identifier" in str(e)
    else:
        raise AssertionError("ValueError expected")
