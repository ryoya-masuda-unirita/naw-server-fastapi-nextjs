"""App（埋め込みアダプタ本体）のテスト。

移植元の AppTest・ValidatePropertyNullInputTest・AppSecuAiGentValidationTest・
EmbeddingAppSplitLengthTimeoutValidationTest のうち、保存時チェック・プロパティの
受け取り・実行時チェック・write の振り分けを移した。DB・API には接続しない。
"""

from pathlib import Path

import pytest
from embedding_adapter.app import App
from embedding_adapter.constants import PropertyIds
from embedding_adapter.waha import ColumnData, ColumnType


def test_validate_property_url_requires_http() -> None:
    """エンベディング URL は http(s) で始まらなければ保存できないこと"""
    app = App()
    assert app.validate_property(PropertyIds.URL, "https://example.com")
    with pytest.raises(RuntimeError, match="エンベディング URL"):
        app.validate_property(PropertyIds.URL, "ftp://x")
    with pytest.raises(RuntimeError, match="エンベディング URL"):
        app.validate_property(PropertyIds.URL, None)


def test_validate_property_api_key_rejects_blank_and_spaces() -> None:
    """API Key は空・空白入りを拒否すること"""
    app = App()
    with pytest.raises(RuntimeError, match="API Key"):
        app.validate_property(PropertyIds.API_KEY, "")
    with pytest.raises(RuntimeError, match="API Key"):
        app.validate_property(PropertyIds.API_KEY, "a b")
    assert app.validate_property(PropertyIds.API_KEY, "abc")


@pytest.mark.parametrize("value", ["59", "86401"])
def test_validate_property_timeout_range(value: str) -> None:
    """タイムアウトは 60〜86400 秒の範囲外を拒否すること"""
    with pytest.raises(RuntimeError, match="60〜86400"):
        App().validate_property(PropertyIds.TIMEOUT_SECONDS, value)


def test_validate_property_proxy_port_messages() -> None:
    """Proxy ポートは数値でない・範囲外で別々のメッセージになること"""
    app = App()
    assert app.validate_property(PropertyIds.PROXY_PORT, "")
    assert app.validate_property(PropertyIds.PROXY_PORT, "8080")
    with pytest.raises(RuntimeError, match="数値を整数"):
        app.validate_property(PropertyIds.PROXY_PORT, "x")
    with pytest.raises(RuntimeError, match="0~65535"):
        app.validate_property(PropertyIds.PROXY_PORT, "70000")


def test_validate_property_embedding_dimensions_and_graph_name() -> None:
    """次元数は正の整数、AGE graph 名は導出規則に合うものだけ受け付けること"""
    app = App()
    assert app.validate_property(PropertyIds.EMBEDDING_DIMENSIONS, "")
    assert app.validate_property(PropertyIds.EMBEDDING_DIMENSIONS, "1536")
    for bad in ("0", "-1", "abc"):
        with pytest.raises(RuntimeError, match="Embedding dimensions"):
            app.validate_property(PropertyIds.EMBEDDING_DIMENSIONS, bad)
    assert app.validate_property(PropertyIds.AGE_GRAPH_NAME, "my_graph")
    with pytest.raises(ValueError, match="unsafe-derived-name"):
        app.validate_property(PropertyIds.AGE_GRAPH_NAME, "Bad-Graph")


def test_set_property_maps_vendors_and_rejects_unknown() -> None:
    """ベンダー ID は名前に変換され、未知の ID は ValueError になること"""
    app = App()
    app.set_property(PropertyIds.VENDOR, "1")
    app.set_property(PropertyIds.VDB_VENDOR, "1")
    assert app.access_credential.vendor_name == "AzureOpenAI"
    assert app.vector_db_config.vendor_name == "PostgreSQL(PGVector)"
    with pytest.raises(ValueError, match="Unsupported vendor ID"):
        app.set_property(PropertyIds.VENDOR, "9")
    with pytest.raises(ValueError, match="Unsupported vendor ID"):
        app.set_property(PropertyIds.VDB_VENDOR, "9")


def test_set_property_tenant_and_timeout_are_shared_with_graph_llm() -> None:
    """テナント ID とタイムアウトは Graph candidate LLM の設定にも入ること"""
    app = App()
    app.set_property(PropertyIds.TENANT_ID, "t1")
    app.set_property(PropertyIds.TIMEOUT_SECONDS, "120")
    assert app.graph_candidate_llm_config.tenant_id == "t1"
    assert app.graph_candidate_llm_config.timeout_seconds == 120
    assert app.access_credential.timeout_seconds == 120


def test_set_property_embedding_dimensions_blank_is_none() -> None:
    """次元数が空なら未指定（None）になること"""
    app = App()
    app.set_property(PropertyIds.EMBEDDING_DIMENSIONS, "  ")
    assert app.access_credential.embedding_dimensions is None
    app.set_property(PropertyIds.EMBEDDING_DIMENSIONS, "256")
    assert app.access_credential.embedding_dimensions == 256


def test_columns_are_id_file_and_split_length() -> None:
    """列は ID・入力ファイル・分割文字数の 3 つであること"""
    columns = App().get_column_information("view")
    assert [(c.name, c.col_type) for c in columns] == [
        ("ID", ColumnType.CHAR),
        ("入力ファイル", ColumnType.FILE),
        ("分割文字数", ColumnType.DECIMAL_NUMBER),
    ]


def test_secuaigent_runtime_requires_tenant_url_key_model() -> None:
    """SecuAiGent では Tenant ID・URL・API Key・モデルが実行時に必須であること"""
    app = App()
    app.set_property(PropertyIds.VENDOR, "5")
    with pytest.raises(RuntimeError, match="Tenant ID"):
        app.init_embedding_controller()
    app.set_property(PropertyIds.TENANT_ID, "t")
    with pytest.raises(RuntimeError, match="エンベディング URL"):
        app.init_embedding_controller()


def test_graph_write_requires_postgresql() -> None:
    """Graph 書き込みは PostgreSQL(PGVector) 以外では実行時に拒否されること"""
    app = App()
    app.set_property(PropertyIds.VDB_VENDOR, "0")
    app.set_property(PropertyIds.GRAPH_WRITE_ENABLED, "1")
    with pytest.raises(RuntimeError, match="only for PostgreSQL"):
        app.init_embedding_controller()


class RecordingController:
    """write の呼び出しを記録する偽のコントローラー。"""

    def __init__(self) -> None:
        """記録用のリストを作る。"""
        self.calls: list[tuple[object, ...]] = []

    def execute_embedding(self, *args: object) -> None:
        """実行を記録する。

        Parameters
        ----------
        *args : object
            引数。
        """
        self.calls.append(("execute", *args))

    def wire_reject_audit_session(self, session: object) -> None:
        """監査セッションの受け取り（何もしない）。

        Parameters
        ----------
        session : object
            監査セッション。
        """

    def wire_job_output_context(self, context: object) -> None:
        """ジョブ出力コンテキストの受け取り（何もしない）。

        Parameters
        ----------
        context : object
            コンテキスト。
        """

    def delete_embedding(self, id: str | None) -> None:
        """削除を記録する。

        Parameters
        ----------
        id : str | None
            ファイル ID。
        """
        self.calls.append(("delete", id))


def prepared_app(output_type: int, out_dir: Path) -> tuple[App, RecordingController]:
    """偽のコントローラーを差した、書き込み前の App を作る。

    Parameters
    ----------
    output_type : int
        出力モード。
    out_dir : Path
        出力ディレクトリ。

    Returns
    -------
    tuple[App, RecordingController]
        App と記録用コントローラー。
    """
    app = App()
    controller = RecordingController()
    app.embedding_controller = controller  # type: ignore[assignment]
    app.set_property(PropertyIds.OUTPUT_DIR, str(out_dir))
    app.connect(output_type)
    app.set_column_information(app.get_column_information("v"))
    app.set_view_name("out.tsv")
    return app, controller


def test_write_dispatches_text_output_with_columns(tmp_path: Path) -> None:
    """write は列から ID・ファイルパス・分割文字数を取り出して実行すること"""
    app, controller = prepared_app(1, tmp_path)
    app.write(
        [ColumnData.char("id-1"), ColumnData.file("/in/a.txt"), ColumnData.char("500")]
    )
    assert controller.calls == [
        ("execute", 500, "/in/a.txt", f"{tmp_path}/out.tsv", 1, "id-1")
    ]


def test_write_dispatches_delete_for_output_mode_2(tmp_path: Path) -> None:
    """出力モード 2 の write はファイル ID で削除すること"""
    app, controller = prepared_app(2, tmp_path)
    app.write([ColumnData.char("fid"), ColumnData.file("null"), ColumnData.char("0")])
    assert controller.calls == [("delete", "fid")]


def test_before_execute_removes_existing_output_for_append_modes(
    tmp_path: Path,
) -> None:
    """追記される出力ファイルは before_execute で消され、削除モードでは消さないこと"""
    for mode, remains in ((0, False), (1, False), (3, False), (2, True)):
        out = tmp_path / f"m{mode}"
        out.mkdir()
        (out / "out.tsv").write_text("old")
        app, _ = prepared_app(mode, out)
        app.before_execute()
        assert (out / "out.tsv").exists() is remains


def test_after_execute_is_noop_without_graph_job_context(tmp_path: Path) -> None:
    """Graph Candidate のジョブ出力が無効なら after_execute は何も書かないこと"""
    app, _ = prepared_app(1, tmp_path)
    app.after_execute()
    assert list(tmp_path.iterdir()) == []
