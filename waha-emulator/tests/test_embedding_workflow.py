"""埋め込みアダプタのワークフロー（学習・削除・同期）のテスト。

アダプタが書くベクトルDB は、メモリ上の偽物（行のリスト）に差し替える。実際の
PostgreSQL・埋め込み API には接続しない（実 DB での確認は docs/issue-300/08）。
server-local の WahaClient と、server-local が TSV を読む関数を通した結合テストも含む。
"""

import json
import uuid
from pathlib import Path
from typing import Any

import pytest
from app.clients.waha_client import SLOT_FILE as WAHA_SLOT_FILE
from app.clients.waha_client import SLOT_OUTPUT
from app.core.jsonutil import java_split
from app.schemas.message import UploadedFile
from app.services import file_service
from embedding_adapter.app import App
from embedding_adapter.controller.embedding_controller import EmbeddingController
from embedding_adapter.domain import Embedding, VectorDBConfig
from embedding_adapter.model import AbstractEmbeddingModel, AbstractVectorStoreService

from tests.conftest import make_settings
from tests.test_server_local_roundtrip import connected
from waha_emulator.sessions import SlotFile
from waha_emulator.workflow_config import (
    WorkflowConfigError,
    WorkflowDefinition,
    parse_workflow_config,
)
from waha_emulator.workflows.base import WorkflowError, WorkflowRequest
from waha_emulator.workflows.embedding import (
    EmbeddingWorkflow,
    learn_output,
    parse_adapter_tsv,
)
from waha_emulator.workflows.registry import WorkflowRegistry

ECHO_PROPERTIES = {
    "VENDOR": "Echo",
    "URL": "http://echo.invalid",
    "API_KEY": "echo",
    "MODEL_NAME": "echo",
    "TENANT_ID": "tenant-a",
    "VDB_VENDOR": "PostgreSQL(PGVector)",
    "VDB_TABLE_NAME": "docs",
}


class FakeVectorDb:
    """メモリ上のベクトルDB（行の一覧）。"""

    def __init__(self) -> None:
        """空のテーブルを作る。"""
        self.rows: list[dict[str, str]] = []


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
            ベクトル。
        """
        return [0.1]


class FakeStore(AbstractVectorStoreService):
    """偽のベクトルDB に行を書くストア。"""

    def __init__(self, db: FakeVectorDb) -> None:
        """書き込み先を受け取る。

        Parameters
        ----------
        db : FakeVectorDb
            書き込み先。
        """
        self._db = db

    def add(self, embedding: Embedding) -> str:
        """行を追加して行 ID を返す。

        Parameters
        ----------
        embedding : Embedding
            追加するチャンク。

        Returns
        -------
        str
            行 ID。
        """
        row_id = str(uuid.uuid4())
        self._db.rows.append(
            {
                "id": row_id,
                "fileid": embedding.file_unique_id or "",
                "filepath": embedding.source_file_path or "",
                "content": embedding.content or "",
            }
        )
        return row_id

    def delete(self, id: str) -> None:
        """ファイル ID の行をすべて消す。

        Parameters
        ----------
        id : str
            ファイル ID。
        """
        self._db.rows = [r for r in self._db.rows if r["fileid"] != id]

    def update(self, embedding: Embedding) -> None:
        """何もしない。

        Parameters
        ----------
        embedding : Embedding
            チャンク。
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


class FakeCursor:
    """`fetchall` だけを持つ偽のカーソル。"""

    def __init__(self, rows: list[tuple[str, ...]]) -> None:
        """結果の行を受け取る。

        Parameters
        ----------
        rows : list[tuple[str, ...]]
            結果の行。
        """
        self._rows = rows

    def fetchall(self) -> list[tuple[str, ...]]:
        """結果の行を返す。

        Returns
        -------
        list[tuple[str, ...]]
            結果の行。
        """
        return self._rows


class FakeConnection:
    """ワークフローが投げる 2 種類の SELECT に答える偽の接続。"""

    def __init__(self, db: FakeVectorDb) -> None:
        """偽のベクトルDB を受け取る。

        Parameters
        ----------
        db : FakeVectorDb
            偽のベクトルDB。
        """
        self._db = db

    def execute(self, sql: str, params: tuple[Any, ...]) -> FakeCursor:
        """行 ID からファイル ID を引く SELECT と、同期の SELECT に答える。

        Parameters
        ----------
        sql : str
            SQL。
        params : tuple[Any, ...]
            パラメータ。

        Returns
        -------
        FakeCursor
            結果。
        """
        if sql.startswith("UPDATE"):
            logical_path, file_ids = params
            for row in self._db.rows:
                if row["fileid"] in file_ids:
                    row["filepath"] = logical_path
            return FakeCursor([])
        if "ANY(%s)" in sql:
            wanted = set(params[0])
            return FakeCursor(
                [
                    (r["id"], r["fileid"])
                    for r in self._db.rows
                    if r["id"] in wanted or r["fileid"] in wanted
                ]
            )
        offset, limit = params
        ordered = sorted(self._db.rows, key=lambda r: (r["fileid"], r["id"]))
        page = ordered[offset : offset + limit]
        return FakeCursor([(r["filepath"], r["id"], r["fileid"]) for r in page])

    def close(self) -> None:
        """何もしない。"""


class StubbedEmbeddingWorkflow(EmbeddingWorkflow):
    """DB・埋め込み API の代わりに偽物を差し込む埋め込みワークフロー。"""

    def __init__(
        self,
        definition: WorkflowDefinition,
        db: FakeVectorDb,
        source_allowed_dir: Path | None = None,
    ) -> None:
        """偽の DB を受け取る。

        Parameters
        ----------
        definition : WorkflowDefinition
            サービスの定義。
        db : FakeVectorDb
            偽のベクトルDB。
        source_allowed_dir : Path | None
            `filepath` を読んでよいディレクトリ。
        """
        super().__init__(
            definition, source_allowed_dir, lambda config: FakeConnection(db)
        )
        self.db = db
        self.schema_calls = 0

    def _new_app(self, job_dir: Path, output_type: int) -> App:
        """偽のコントローラーを差し込んだ App を作る。

        Parameters
        ----------
        job_dir : Path
            ジョブのディレクトリ。
        output_type : int
            出力モード。

        Returns
        -------
        App
            アダプタ。
        """
        app = super()._new_app(job_dir, output_type)
        app.embedding_controller = EmbeddingController(
            "",
            app.proxy_setting,
            app.access_credential,
            app.vector_db_config,
            app.image_explanation_mode,
            embedding_model=FakeModel(),
            vector_db_model=FakeStore(self.db),
        )
        return app

    def _ensure_graphrag_schema(self, config: VectorDBConfig) -> None:
        """スキーマの用意を呼んだ回数だけ数える。

        Parameters
        ----------
        config : VectorDBConfig
            ベクトルDB の設定。
        """
        self.schema_calls += 1


def definition(operation: str, **extra: Any) -> WorkflowDefinition:
    """埋め込みアダプタの定義を作る。

    Parameters
    ----------
    operation : str
        learn・delete・sync。
    **extra : Any
        定義に足す項目（outputType など）。

    Returns
    -------
    WorkflowDefinition
        定義。
    """
    config = parse_workflow_config(
        {
            "default": {"properties": {}},
            "services": {
                "svc": {
                    "adapter": "embedding",
                    "operation": operation,
                    "properties": ECHO_PROPERTIES,
                    **extra,
                }
            },
        },
        {},
    )
    return config.services["svc"]


def request(
    params: dict[str, str] | None = None,
    upload: tuple[str, bytes] | None = None,
) -> WorkflowRequest:
    """ワークフローへの入力を作る。

    Parameters
    ----------
    params : dict[str, str] | None
        execute のクエリパラメータ。
    upload : tuple[str, bytes] | None
        file スロットのファイル名と中身。

    Returns
    -------
    WorkflowRequest
        入力。
    """
    inputs = {}
    if upload is not None:
        inputs["file"] = SlotFile(upload[0], "text/plain", upload[1])
    return WorkflowRequest(
        service_id="svc", params=params or {}, inputs=inputs, stream=None
    )


async def learn(workflow: EmbeddingWorkflow, text: str, split: str = "30") -> str:
    """ファイルをアップロードして学習する。

    Parameters
    ----------
    workflow : EmbeddingWorkflow
        学習のワークフロー。
    text : str
        ファイルの中身。
    split : str
        splitLength。

    Returns
    -------
    str
        学習結果の TSV。
    """
    return await workflow.run(
        request({"splitLength": split}, ("規程.txt", text.encode("utf-8")))
    )


TEXT = (
    "第1条 目的\n本規程は経費精算の手順を定める。\n第2条 申請\n申請は月末までに行う。\n"
)


async def test_learn_returns_file_id_and_part_ids_per_chunk() -> None:
    """学習はチャンクごとに「ファイル ID・パート ID」の TSV を返し、DB に行が入ること"""
    db = FakeVectorDb()
    output = await learn(StubbedEmbeddingWorkflow(definition("learn"), db), TEXT)

    lines = [line.split("\t") for line in output.splitlines()]
    assert len(lines) == len(db.rows) >= 2
    assert {line[0] for line in lines} == {f'"{db.rows[0]["fileid"]}"'}
    assert [line[1].strip('"') for line in lines] == [r["id"] for r in db.rows]
    assert {r["filepath"] for r in db.rows} == {"規程.txt"}


async def test_learn_uses_default_split_length_when_param_is_blank() -> None:
    """splitLength が空なら、定義の defaultSplitLength で分割すること"""
    db = FakeVectorDb()
    workflow = StubbedEmbeddingWorkflow(definition("learn", defaultSplitLength=5), db)
    await workflow.run(
        request({"splitLength": ""}, ("a.txt", b"aaaaa\nbbbbb\nccccc\n"))
    )
    assert len(db.rows) == 3


@pytest.mark.parametrize("split", ["abc", "0", "-3"])
async def test_learn_rejects_invalid_split_length(split: str) -> None:
    """splitLength が数値でない・0 以下なら失敗すること"""
    workflow = StubbedEmbeddingWorkflow(definition("learn"), FakeVectorDb())
    with pytest.raises(WorkflowError, match="splitLength"):
        await learn(workflow, TEXT, split)


async def test_learn_reads_filepath_under_allowed_dir(tmp_path: Path) -> None:
    """file がなければ、許可されたディレクトリの中の filepath を読んで学習すること"""
    source = tmp_path / "server" / "手順.txt"
    source.parent.mkdir()
    source.write_text(TEXT, encoding="utf-8")
    db = FakeVectorDb()
    workflow = StubbedEmbeddingWorkflow(
        definition("learn"), db, source_allowed_dir=tmp_path
    )

    await workflow.run(request({"splitLength": "30", "filepath": str(source)}))

    assert db.rows and db.rows[0]["filepath"] == str(source.resolve())


async def test_learn_filepath_is_rejected_outside_allowed_dir(tmp_path: Path) -> None:
    """許可されたディレクトリの外の filepath は読まないこと"""
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    outside = tmp_path / "secret.txt"
    outside.write_text("secret", encoding="utf-8")
    workflow = StubbedEmbeddingWorkflow(
        definition("learn"), FakeVectorDb(), source_allowed_dir=allowed
    )
    with pytest.raises(WorkflowError, match="許可されたディレクトリの外"):
        await workflow.run(request({"filepath": str(outside)}))


async def test_learn_filepath_requires_allowed_dir_setting(tmp_path: Path) -> None:
    """SOURCE_ALLOWED_DIR がなければ、filepath による学習は失敗すること"""
    source = tmp_path / "a.txt"
    source.write_text("x", encoding="utf-8")
    workflow = StubbedEmbeddingWorkflow(definition("learn"), FakeVectorDb())
    with pytest.raises(WorkflowError, match="SOURCE_ALLOWED_DIR"):
        await workflow.run(request({"filepath": str(source)}))


async def test_learn_without_file_fails() -> None:
    """file も filepath もなければ失敗すること"""
    workflow = StubbedEmbeddingWorkflow(definition("learn"), FakeVectorDb())
    with pytest.raises(WorkflowError, match="学習するファイルがありません"):
        await workflow.run(request({"splitLength": "10"}))


async def test_learn_fails_when_nothing_was_registered() -> None:
    """アダプタが 1 行も登録しなかったら（空のファイルなど）失敗すること"""
    workflow = StubbedEmbeddingWorkflow(
        definition("learn", outputType=1), FakeVectorDb()
    )
    with pytest.raises(WorkflowError):
        await workflow.run(request({"splitLength": "10"}, ("empty.txt", b"")))


async def test_adapter_failure_is_reported_with_prefix() -> None:
    """アダプタが失敗したら「埋め込みアダプタの実行に失敗しました」の理由になること"""
    workflow = StubbedEmbeddingWorkflow(definition("learn"), FakeVectorDb())
    with pytest.raises(WorkflowError, match="埋め込みアダプタの実行に失敗しました"):
        await workflow.run(request({"splitLength": "10"}, ("a.docx", b"not a zip")))


async def test_delete_resolves_part_ids_to_file_ids_and_deletes_the_file() -> None:
    """削除はパート ID からファイル ID を引き、そのファイルの行をすべて消すこと"""
    db = FakeVectorDb()
    learn_workflow = StubbedEmbeddingWorkflow(definition("learn"), db)
    await learn(learn_workflow, TEXT)
    other = await learn(learn_workflow, "別のファイル\n")
    kept_file_id = other.splitlines()[0].split("\t")[0].strip('"')
    first_part = db.rows[0]["id"]
    delete_workflow = StubbedEmbeddingWorkflow(definition("delete"), db)

    output = await delete_workflow.run(
        request(upload=("ids.txt", f"{first_part}\n".encode()))
    )

    assert output == ""
    assert {r["fileid"] for r in db.rows} == {kept_file_id}
    assert delete_workflow.schema_calls == 1


async def test_delete_without_ids_fails() -> None:
    """削除する ID がなければ失敗すること"""
    workflow = StubbedEmbeddingWorkflow(definition("delete"), FakeVectorDb())
    with pytest.raises(WorkflowError, match="削除するパート ID"):
        await workflow.run(request())
    with pytest.raises(WorkflowError, match="削除するパート ID"):
        await workflow.run(request(upload=("ids.txt", b"\n \n")))


async def test_sync_lists_registered_rows_with_paging() -> None:
    """同期は登録済みの行を「パス・パート ID・ファイル ID」で返し、start/end で区切ること"""
    db = FakeVectorDb()
    await learn(StubbedEmbeddingWorkflow(definition("learn"), db), TEXT, "10")
    sync = StubbedEmbeddingWorkflow(definition("sync"), db)

    full = await sync.run(request({"start": "0", "end": "100"}))
    page = await sync.run(request({"start": "1", "end": "2"}))

    lines = [line.split("\t") for line in full.splitlines()]
    assert len(lines) == len(db.rows)
    assert all(len(line) == 3 for line in lines)
    assert page.splitlines() == full.splitlines()[1:2]


async def test_sync_and_delete_require_postgresql() -> None:
    """削除・同期は PostgreSQL(PGVector) 以外では失敗すること"""
    config = parse_workflow_config(
        {
            "default": {"properties": {}},
            "services": {
                "svc": {
                    "adapter": "embedding",
                    "operation": "sync",
                    "properties": {**ECHO_PROPERTIES, "VDB_VENDOR": "Azure AI Search"},
                }
            },
        },
        {},
    )
    workflow = StubbedEmbeddingWorkflow(config.services["svc"], FakeVectorDb())
    with pytest.raises(WorkflowError, match="PostgreSQL"):
        await workflow.run(request({"start": "0", "end": "10"}))


def test_parse_adapter_tsv_handles_multiline_text_and_skips_empty_part_ids() -> None:
    """アダプタの TSV は本文の改行を含めて読み、パート ID が空の行は除くこと"""
    text = '"/a.txt"\t"行1\n行2\n"\t"p1"\t"f1"\n"/a.txt"\t"本文"\t""\t"f1"\n'
    chunks = parse_adapter_tsv(text)
    assert [(c.path, c.part_id, c.file_id) for c in chunks] == [("/a.txt", "p1", "f1")]
    assert learn_output(chunks) == '"f1"\t"p1"\r\n'


def test_embedding_definition_validation() -> None:
    """埋め込みの定義は operation・outputType・プロパティ名を検証すること"""
    base = {"adapter": "embedding", "properties": ECHO_PROPERTIES}

    def parse(**extra: Any) -> WorkflowDefinition:
        """定義を 1 つ読む。

        Parameters
        ----------
        **extra : Any
            定義に足す項目。

        Returns
        -------
        WorkflowDefinition
            読んだ定義。
        """
        return parse_workflow_config(
            {"default": {"properties": {}}, "services": {"s": {**base, **extra}}}, {}
        ).services["s"]

    assert parse(operation="learn").output_type == 3
    assert parse(operation="learn", outputType=1).output_type == 1
    assert parse(operation="delete").output_type == 2
    for bad in (
        {},
        {"operation": "unknown"},
        {"operation": "learn", "outputType": 2},
        {"operation": "delete", "outputType": 1},
        {"operation": "learn", "defaultSplitLength": 0},
        {"operation": "learn", "ragContextJson": "x.json"},
        {"operation": "learn", "properties": {"NOPE": "1"}},
        {"operation": "learn", "properties": {"OUTPUT_DIR": "C:\\x"}},
        {"operation": "learn", "properties": {"VENDOR": "Unknown"}},
        {"operation": "learn", "properties": {"URL": "ftp://x"}},
    ):
        with pytest.raises(WorkflowConfigError):
            parse(**bad)
    with pytest.raises(WorkflowConfigError, match="generative-ai"):
        parse_workflow_config(
            {"default": {"adapter": "embedding", "operation": "learn"}}, {}
        )
    with pytest.raises(WorkflowConfigError, match="embedding"):
        parse_workflow_config({"default": {"properties": {}, "operation": "learn"}}, {})


async def test_server_local_learn_sync_delete_roundtrip(tmp_path: Path) -> None:
    """server-local の WahaClient で学習→同期→削除でき、server-local の TSV 読み取りに合うこと"""
    db = FakeVectorDb()
    registry = WorkflowRegistry(
        default=StubbedEmbeddingWorkflow(definition("learn"), db),
        by_service_id={
            "learn-svc": StubbedEmbeddingWorkflow(definition("learn"), db),
            "sync-svc": StubbedEmbeddingWorkflow(definition("sync"), db),
            "delete-svc": StubbedEmbeddingWorkflow(definition("delete"), db),
        },
    )
    async with connected(tmp_path, registry=registry) as env:
        file_id, part_ids = await file_service._run_waha_create_job(
            env.waha,
            service_name="learn-svc",
            upload=UploadedFile("規程.txt", "text/plain", TEXT.encode("utf-8")),
            split_length="30",
            reference="/mnt/file-server",
        )
        assert part_ids == [r["id"] for r in db.rows] and len(part_ids) >= 2
        assert {r["fileid"] for r in db.rows} == {file_id}

        session_id = await env.waha.start_session()
        await env.waha.execute_sync(session_id, "sync-svc", 0, 100)
        await env.waha.get_results(session_id)
        tsv = await env.waha.download_file(session_id, SLOT_OUTPUT)
        await env.waha.end_session(session_id)
        fields = [
            file_service._split_fields(line)
            for line in java_split(
                file_service._strip_bom(tsv), file_service.LINE_SEPARATOR
            )
        ]
        assert sorted((f[1], f[2]) for f in fields) == sorted(
            (p, file_id) for p in part_ids
        )
        assert {f[0] for f in fields} == {"/mnt/file-server/規程.txt"}

        await file_service._run_waha_delete_job(
            env.waha, service_name="delete-svc", part_ids=part_ids
        )
        assert db.rows == []
    assert WAHA_SLOT_FILE == "file"


def test_settings_blank_source_allowed_dir_is_unset() -> None:
    """SOURCE_ALLOWED_DIR が空文字列なら未設定として扱うこと"""
    assert make_settings(SOURCE_ALLOWED_DIR="").source_allowed_dir is None


def test_example_config_defines_learn_sync_and_delete_services() -> None:
    """同梱の設定例が読め、学習・同期・削除の埋め込みサービスを含むこと"""
    path = Path(__file__).resolve().parents[1] / "config" / "workflows.example.json"
    config = parse_workflow_config(json.loads(path.read_text(encoding="utf-8")), {})
    operations = {
        sid: d.operation
        for sid, d in config.services.items()
        if d.adapter == "embedding"
    }
    assert operations == {
        "kb-learn": "learn",
        "kb-sync": "sync",
        "kb-delete": "delete",
    }


async def test_delete_accepts_file_ids_and_skips_unknown_ids() -> None:
    """削除はファイル ID でも消せ、どちらにも当たらない ID は飛ばして成功にすること"""
    db = FakeVectorDb()
    workflow = StubbedEmbeddingWorkflow(definition("learn"), db)
    await learn(workflow, TEXT)
    file_id = db.rows[0]["fileid"]
    delete_workflow = StubbedEmbeddingWorkflow(definition("delete"), db)

    await delete_workflow.run(
        request(upload=("ids.txt", f"{file_id}\nalready-deleted-part\n".encode()))
    )

    assert db.rows == []


async def test_delete_with_only_unknown_ids_deletes_nothing() -> None:
    """どの行にも当たらない ID だけの削除は、何も消さず成功にすること"""
    db = FakeVectorDb()
    await learn(StubbedEmbeddingWorkflow(definition("learn"), db), TEXT)
    count = len(db.rows)
    delete_workflow = StubbedEmbeddingWorkflow(definition("delete"), db)

    await delete_workflow.run(request(upload=("ids.txt", b"no-such-id\n")))

    assert len(db.rows) == count
    assert delete_workflow.schema_calls == 0


async def test_learn_removes_partial_rows_when_adapter_fails_midway() -> None:
    """学習が途中で失敗したら、登録済みの行を消して再試行で重複しないようにすること"""
    db = FakeVectorDb()

    class FailingStore(FakeStore):
        """2 件目の追加で失敗するストア。"""

        def add(self, embedding: Embedding) -> str:
            """1 件目は追加し、2 件目は失敗する。

            Parameters
            ----------
            embedding : Embedding
                追加するチャンク。

            Returns
            -------
            str
                行 ID。

            Raises
            ------
            RuntimeError
                2 件目のとき。
            """
            if len(self._db.rows) >= 1:
                raise RuntimeError("embedding api down")
            return super().add(embedding)

    class FailingWorkflow(StubbedEmbeddingWorkflow):
        """FailingStore を差し込むワークフロー。"""

        def _new_app(self, job_dir: Path, output_type: int) -> App:
            """失敗するストアを差し込んだ App を作る。

            Parameters
            ----------
            job_dir : Path
                ジョブのディレクトリ。
            output_type : int
                出力モード。

            Returns
            -------
            App
                アダプタ。
            """
            app = EmbeddingWorkflow._new_app(self, job_dir, output_type)
            app.embedding_controller = EmbeddingController(
                "",
                app.proxy_setting,
                app.access_credential,
                app.vector_db_config,
                app.image_explanation_mode,
                embedding_model=FakeModel(),
                vector_db_model=FailingStore(self.db),
            )
            return app

    workflow = FailingWorkflow(definition("learn"), db)
    with pytest.raises(WorkflowError, match="embedding api down"):
        await learn(workflow, TEXT, "10")

    assert db.rows == []


def test_parse_adapter_tsv_reads_paths_with_quotes_when_source_is_known() -> None:
    """入力ファイルのパスが分かっていれば、`"` を含むパスの行も読めること"""
    path = '/in/a"b.txt'
    text = f'"{path}"\t"本文\n"\t"p1"\t"f1"\n'
    assert parse_adapter_tsv(text)[0].path != path
    assert [c.part_id for c in parse_adapter_tsv(text, path)] == ["p1"]
