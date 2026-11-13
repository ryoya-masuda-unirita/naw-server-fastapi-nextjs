"""生成AIアダプタ（generative-ai-adapter の App）を動かすワークフロー。

本物の Waha! のジョブと同じく、入力スロットのファイルをアダプタの列・プロパティに
割り当て、アダプタの出力ファイル（`OUTPUT_DIR/<ビュー名>`）を outputfile にする。

| 入力 | アダプタへの渡し方 |
|---|---|
| `question` | index 0（ユーザー・文字）。UTF-8 の文字列にして渡す |
| `attachmentfile` | index 0（ユーザー・FILE）。通常 chat だけ。ない場合は `null` |
| `history` | index 4（会話履歴Json・FILE）。ない場合は `null` |
| `textdata` | プロパティ 43（SecuAiGent textData JSON file path） |
| execute の `streamfilepath` | プロパティ 42（推論出力先ファイルパス） |
| 定義の `ragContextJson` | index 6（RAG Context JSONパス・FILE）。RAG だけ。検索アダプタを使わない固定の入力 |

定義に `retrieval` があるときは、RAG の前に検索アダプタ（retrieval-adapter）を動かす。

| 入力 | 検索アダプタへの渡し方 |
|---|---|
| `question` | index 0（検索文字列・文字） |
| `textdata` | プロパティ 52（SecuAiGent textData JSON file path。生成AIアダプタと同じファイル） |
| 定義の `retrieval.properties` | そのままのプロパティ |

検索アダプタは出力モード 1（`RAG_CONTEXT_JSON_V1`）でジョブのディレクトリに RAG Context JSON を
書き、そのパスを生成AIアダプタの index 6 に渡す（`RAG_CONTEXT_JSON_ALLOW_ROOT` もジョブの
ディレクトリにする）。

アダプタは同期処理（移植元と同じ）のため、別スレッドで動かす。
"""

import asyncio
import json
import logging
import tempfile
from collections.abc import Callable
from dataclasses import dataclass
from functools import cache
from pathlib import Path, PurePath

from generative_ai_adapter.app import App
from generative_ai_adapter.constants import PropertyIds
from generative_ai_adapter.core_mappers import ChatRuntimeFactory
from generative_ai_adapter.waha import (
    SKIPPED_FILE_PATH,
    ColumnData,
    ColumnInformation,
    ColumnType,
)
from generative_ai_core.retrieval.runtime import CoreRetrievalRuntime
from retrieval_adapter import waha as retrieval_waha
from retrieval_adapter.app import App as RetrievalApp
from retrieval_adapter.constants import (
    OUT_MODE_RAG_CONTEXT_JSON_V1,
    RetrievalPropertyIds,
)

from waha_emulator.jobs import STREAM_FILE_PARAM
from waha_emulator.sessions import (
    SLOT_ATTACHMENT,
    SLOT_HISTORY,
    SLOT_QUESTION,
    SLOT_TEXTDATA,
    SlotFile,
)
from waha_emulator.stream_file import StreamFileError, resolve_allowed
from waha_emulator.workflow_config import RAG_OUTPUT_TYPE, WorkflowDefinition
from waha_emulator.workflows.base import WorkflowError, WorkflowRequest

logger = logging.getLogger(__name__)

TEXT_DATA_STREAM_KEY = "streamfilepath"
OUTPUT_VIEW_NAME = "output.json"
RETRIEVAL_VIEW_NAME = "rag-context.json"
HISTORY_FILENAME = "histories.json"
ATTACHMENT_DIRNAME = "attachments"
TEXT_DATA_FILENAME = "textData.json"
ATTACHMENT_FALLBACK_FILENAME = "attachment"
JOB_DIR_PREFIX = "waha-job-"
INDEX_USER = 0
INDEX_HISTORY = 4
INDEX_RAG_JSON = 6
QUESTION_MISSING_MESSAGE = (
    "question がありません。チャット以外のサービス（学習データの削除など）は未対応です"
)
OUTPUT_MISSING_MESSAGE = "生成AIアダプタが出力ファイルを書きませんでした"
RETRIEVAL_OUTPUT_MISSING_MESSAGE = "検索アダプタが出力ファイルを書きませんでした"
ADAPTER_FAILED_PREFIX = "生成AIアダプタの実行に失敗しました"
RETRIEVAL_FAILED_PREFIX = "検索アダプタの実行に失敗しました"
RETRIEVAL_COLUMN_NAME = "検索文字列"


@dataclass(frozen=True)
class RetrievalJob:
    """検索アダプタに渡す 1 回分の列とプロパティ。

    Attributes
    ----------
    columns : list[retrieval_waha.ColumnInformation]
        列の定義。
    record : list[retrieval_waha.ColumnData]
        列の値。
    properties : dict[int, str]
        プロパティ（検索アダプタの ID → 値）。
    view_name : str
        出力ファイル名（ジョブのディレクトリの中）。
    """

    columns: list[retrieval_waha.ColumnInformation]
    record: list[retrieval_waha.ColumnData]
    properties: dict[int, str]
    view_name: str = RETRIEVAL_VIEW_NAME


@dataclass(frozen=True)
class AdapterJob:
    """アダプタに渡す 1 回分の列とプロパティ。

    Attributes
    ----------
    columns : list[ColumnInformation]
        生成AIアダプタの列の定義。
    record : list[ColumnData]
        生成AIアダプタの列の値。
    properties : dict[int, str]
        生成AIアダプタのプロパティ（ID → 値）。
    retrieval : RetrievalJob | None
        先に動かす検索アダプタの入力。なければ検索しない。
    """

    columns: list[ColumnInformation]
    record: list[ColumnData]
    properties: dict[int, str]
    retrieval: RetrievalJob | None = None


def _decode(slot: SlotFile, name: str) -> str:
    """スロットの中身を UTF-8 で読む。

    Parameters
    ----------
    slot : SlotFile
        スロットのファイル。
    name : str
        エラーメッセージに出すスロット名。

    Returns
    -------
    str
        中身。

    Raises
    ------
    WorkflowError
        UTF-8 でないとき。
    """
    try:
        return slot.data.decode("utf-8")
    except UnicodeDecodeError as e:
        raise WorkflowError(f"{name} が UTF-8 ではありません") from e


def _safe_filename(filename: str) -> str:
    """アップロードされたファイル名から、ジョブのディレクトリに置く名前を作る。

    Parameters
    ----------
    filename : str
        アップロード時のファイル名。

    Returns
    -------
    str
        ディレクトリの区切りを含まない名前。
    """
    name = PurePath(filename.replace("\\", "/")).name
    return name if name not in ("", ".", "..") else ATTACHMENT_FALLBACK_FILENAME


def _check_text_data_stream_path(slot: SlotFile, allowed_dir: Path | None) -> None:
    """textData の streamfilepath も、書き込んでよいディレクトリの中かを確かめる。

    SecuAiGent では textData の streamfilepath がプロパティ 42 より優先されるため、
    execute の streamfilepath と同じ制限をかける。JSON として読めない場合は
    アダプタの検証（固定の失敗）に任せる。

    Parameters
    ----------
    slot : SlotFile
        textdata スロットのファイル。
    allowed_dir : Path | None
        書き込んでよいディレクトリ。

    Raises
    ------
    WorkflowError
        許可されたディレクトリの外のとき。
    """
    if allowed_dir is None:
        return
    try:
        text_data = json.loads(slot.data.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return
    path = text_data.get(TEXT_DATA_STREAM_KEY) if isinstance(text_data, dict) else None
    if isinstance(path, str) and path.strip():
        try:
            resolve_allowed(path, allowed_dir)
        except StreamFileError as e:
            raise WorkflowError(str(e)) from e


def build_adapter_job(
    definition: WorkflowDefinition, request: WorkflowRequest, job_dir: Path
) -> AdapterJob:
    """入力スロットをジョブのディレクトリに置き、アダプタの列・プロパティにする。

    Parameters
    ----------
    definition : WorkflowDefinition
        サービスの定義。
    request : WorkflowRequest
        ワークフローへの入力。
    job_dir : Path
        ジョブのディレクトリ（アダプタの出力先も兼ねる）。

    Returns
    -------
    AdapterJob
        列とプロパティ。

    Raises
    ------
    WorkflowError
        question がない・UTF-8 でない、textData の streamfilepath が許可の外のとき。
    """
    inputs = request.inputs
    question_slot = inputs.get(SLOT_QUESTION)
    if question_slot is None:
        raise WorkflowError(QUESTION_MISSING_MESSAGE)
    question = _decode(question_slot, SLOT_QUESTION)

    properties = dict(definition.properties)
    properties[PropertyIds.OUTPUT_DIR] = str(job_dir)
    stream_path = request.params.get(STREAM_FILE_PARAM)
    if stream_path:
        # 確かめた後にシンボリックリンクへ差し替えられても辿らないよう、解決後のパスを渡す
        properties[PropertyIds.REASONING_OUTPUT_PATH] = str(
            resolve_allowed(stream_path, request.stream_allowed_dir)
        )
    text_data = inputs.get(SLOT_TEXTDATA)
    text_data_path: Path | None = None
    if text_data is not None:
        _check_text_data_stream_path(text_data, request.stream_allowed_dir)
        text_data_path = job_dir / TEXT_DATA_FILENAME
        text_data_path.write_bytes(text_data.data)
        properties[PropertyIds.TEXT_DATA_JSON_FILE_PATH] = str(text_data_path)

    columns = [ColumnInformation("ユーザー", ColumnType.CHAR, INDEX_USER)]
    record = [ColumnData.char(question)]
    attachment = inputs.get(SLOT_ATTACHMENT)
    if definition.output_type != RAG_OUTPUT_TYPE:
        attachment_path = SKIPPED_FILE_PATH
        if attachment is not None:
            # 固定名のファイル（textData.json・histories.json・output.json）と同じ名前の
            # 添付で上書きされないよう、専用のサブディレクトリに置く
            attachment_dir = job_dir / ATTACHMENT_DIRNAME
            attachment_dir.mkdir()
            path = attachment_dir / _safe_filename(attachment.filename)
            path.write_bytes(attachment.data)
            attachment_path = str(path)
        columns.append(ColumnInformation("添付", ColumnType.FILE, INDEX_USER))
        record.append(ColumnData.file(attachment_path))
    history = inputs.get(SLOT_HISTORY)
    history_path = SKIPPED_FILE_PATH
    if history is not None:
        path = job_dir / HISTORY_FILENAME
        path.write_bytes(history.data)
        history_path = str(path)
    columns.append(ColumnInformation("会話履歴Json", ColumnType.FILE, INDEX_HISTORY))
    record.append(ColumnData.file(history_path))
    retrieval_job = None
    if definition.output_type == RAG_OUTPUT_TYPE:
        rag_json_path = definition.rag_context_json or SKIPPED_FILE_PATH
        if definition.retrieval is not None:
            retrieval_job = _build_retrieval_job(
                definition, question, job_dir, text_data_path
            )
            # 検索アダプタが書く RAG Context JSON だけを読ませる
            rag_json_path = str(job_dir / retrieval_job.view_name)
            properties[PropertyIds.RAG_CONTEXT_JSON_ALLOW_ROOT] = str(job_dir)
        columns.append(
            ColumnInformation("RAG Context JSONパス", ColumnType.FILE, INDEX_RAG_JSON)
        )
        record.append(ColumnData.file(rag_json_path))
    return AdapterJob(columns, record, properties, retrieval_job)


def _build_retrieval_job(
    definition: WorkflowDefinition,
    question: str,
    job_dir: Path,
    text_data_path: Path | None,
) -> RetrievalJob:
    """検索アダプタの列・プロパティを作る。

    Parameters
    ----------
    definition : WorkflowDefinition
        サービスの定義（`retrieval` があるもの）。
    question : str
        質問（検索文字列）。
    job_dir : Path
        ジョブのディレクトリ（検索アダプタの出力先も兼ねる）。
    text_data_path : Path | None
        ジョブのディレクトリに置いた textData。あれば検索アダプタにも渡す。

    Returns
    -------
    RetrievalJob
        検索アダプタの入力。
    """
    assert definition.retrieval is not None
    properties = dict(definition.retrieval.properties)
    properties[RetrievalPropertyIds.OUTPUT_DIR] = str(job_dir)
    if text_data_path is not None:
        properties[RetrievalPropertyIds.TEXT_DATA_JSON_FILE_PATH] = str(text_data_path)
    columns = [
        retrieval_waha.ColumnInformation(
            RETRIEVAL_COLUMN_NAME, retrieval_waha.ColumnType.CHAR, INDEX_USER
        )
    ]
    record = [retrieval_waha.ColumnData.char(question)]
    return RetrievalJob(columns, record, properties)


@cache
def _names_by_id() -> dict[int, str]:
    """プロパティ ID → 名前の対応（ログ用。一度だけ作る）。

    Returns
    -------
    dict[int, str]
        ID → 名前。
    """
    return {value: name for name, value in PropertyIds.by_name().items()}


@cache
def _retrieval_names_by_id() -> dict[int, str]:
    """検索アダプタのプロパティ ID → 名前の対応（ログ用。一度だけ作る）。

    Returns
    -------
    dict[int, str]
        ID → 名前。
    """
    return {value: name for name, value in RetrievalPropertyIds.by_name().items()}


def _retrieval_property_names(properties: dict[int, str]) -> list[str]:
    """ログに出す検索アダプタのプロパティの名前の一覧（値は出さない）。

    Parameters
    ----------
    properties : dict[int, str]
        プロパティ。

    Returns
    -------
    list[str]
        名前の一覧。
    """
    names = _retrieval_names_by_id()
    return sorted(names.get(prop_id, str(prop_id)) for prop_id in properties)


def _property_names(properties: dict[int, str]) -> list[str]:
    """ログに出すプロパティの名前の一覧（値は出さない）。

    Parameters
    ----------
    properties : dict[int, str]
        プロパティ。

    Returns
    -------
    list[str]
        名前の一覧。
    """
    names = _names_by_id()
    return sorted(names.get(prop_id, str(prop_id)) for prop_id in properties)


class GenerativeAiWorkflow:
    """（検索アダプタ →）生成AIアダプタを 1 回動かすワークフロー。"""

    def __init__(
        self,
        definition: WorkflowDefinition,
        chat_runtime_factory: ChatRuntimeFactory | None = None,
        retrieval_runtime_factory: Callable[[], CoreRetrievalRuntime] | None = None,
    ) -> None:
        """定義を受け取る。

        Parameters
        ----------
        definition : WorkflowDefinition
            サービスの定義。
        chat_runtime_factory : ChatRuntimeFactory | None
            core の chat を作る処理（テストでプロバイダを差し替える）。
        retrieval_runtime_factory : Callable[[], CoreRetrievalRuntime] | None
            core の検索を作る処理（テストで DB・プロバイダを差し替える）。
        """
        self.definition = definition
        self._chat_runtime_factory = chat_runtime_factory
        self._retrieval_runtime_factory = retrieval_runtime_factory

    async def run(self, request: WorkflowRequest) -> str:
        """アダプタを別スレッドで動かし、出力ファイルの中身を返す。

        Parameters
        ----------
        request : WorkflowRequest
            入力。

        Returns
        -------
        str
            outputfile の中身。
        """
        return await asyncio.to_thread(self._run_sync, request)

    def _run_sync(self, request: WorkflowRequest) -> str:
        """ジョブのディレクトリを作ってアダプタを動かす。

        Parameters
        ----------
        request : WorkflowRequest
            入力。

        Returns
        -------
        str
            outputfile の中身。

        Raises
        ------
        WorkflowError
            入力が不正・アダプタが失敗した・出力がないとき。
        """
        with tempfile.TemporaryDirectory(prefix=JOB_DIR_PREFIX) as directory:
            job_dir = Path(directory)
            job = build_adapter_job(self.definition, request, job_dir)
            logger.info(
                "workflow generative-ai: serviceId=%s, %s, columns=%s, properties=%s",
                request.service_id,
                self.definition.describe(),
                [(c.index, c.col_type.name) for c in job.columns],
                _property_names(job.properties),
            )
            if job.retrieval is not None:
                self._run_retrieval_step(request, job.retrieval, job_dir)
            try:
                self._run_adapter(job)
            except Exception as e:
                logger.warning(
                    "generative-ai adapter failed: serviceId=%s, error=%s",
                    request.service_id,
                    type(e).__name__,
                )
                raise WorkflowError(f"{ADAPTER_FAILED_PREFIX}: {e}") from e
            output = job_dir / OUTPUT_VIEW_NAME
            if not output.exists():
                raise WorkflowError(OUTPUT_MISSING_MESSAGE)
            return output.read_text(encoding="utf-8")

    def _run_retrieval_step(
        self, request: WorkflowRequest, retrieval: RetrievalJob, job_dir: Path
    ) -> None:
        """検索アダプタを動かし、RAG Context JSON をジョブのディレクトリに書かせる。

        Parameters
        ----------
        request : WorkflowRequest
            入力。
        retrieval : RetrievalJob
            検索アダプタの入力。
        job_dir : Path
            ジョブのディレクトリ。

        Raises
        ------
        WorkflowError
            検索アダプタが失敗した・出力がないとき。
        """
        logger.info(
            "workflow step 1/2 retrieval: serviceId=%s, columns=%s, properties=%s",
            request.service_id,
            [(c.index, c.col_type.name) for c in retrieval.columns],
            _retrieval_property_names(retrieval.properties),
        )
        try:
            self._run_retrieval(retrieval)
        except Exception as e:
            logger.warning(
                "retrieval adapter failed: serviceId=%s, error=%s",
                request.service_id,
                type(e).__name__,
            )
            raise WorkflowError(f"{RETRIEVAL_FAILED_PREFIX}: {e}") from e
        output = job_dir / retrieval.view_name
        if not output.exists():
            raise WorkflowError(RETRIEVAL_OUTPUT_MISSING_MESSAGE)
        logger.info(
            "workflow step 1/2 retrieval finished: contexts=%d",
            len(json.loads(output.read_text(encoding="utf-8"))["contexts"]),
        )
        logger.info("workflow step 2/2 generative-ai: serviceId=%s", request.service_id)

    def _run_retrieval(self, job: RetrievalJob) -> None:
        """Waha! と同じ順序で検索アダプタを呼ぶ。

        set_property → connect（出力モード 1）→ set_column_information → set_view_name →
        before_execute → write。

        Parameters
        ----------
        job : RetrievalJob
            列とプロパティ。
        """
        factory = self._retrieval_runtime_factory
        app = RetrievalApp(factory)
        for prop_id, value in job.properties.items():
            app.set_property(prop_id, value)
        app.connect(OUT_MODE_RAG_CONTEXT_JSON_V1)
        for column in job.columns:
            app.validate_column_information(column)
        app.set_column_information(job.columns)
        app.set_view_name(job.view_name)
        app.before_execute()
        app.write(job.record)

    def _run_adapter(self, job: AdapterJob) -> None:
        """Waha! と同じ順序でアダプタを呼ぶ。

        set_property → connect → set_column_information → set_view_name →
        before_execute → write。

        Parameters
        ----------
        job : AdapterJob
            列とプロパティ。
        """
        app = App(self._chat_runtime_factory)
        for prop_id, value in job.properties.items():
            app.set_property(prop_id, value)
        app.connect(self.definition.output_type)
        for column in job.columns:
            app.validate_column_information(column)
        app.set_column_information(job.columns)
        app.set_view_name(OUTPUT_VIEW_NAME)
        app.before_execute()
        app.write(job.record)
