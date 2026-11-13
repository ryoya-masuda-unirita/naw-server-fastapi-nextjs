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
| 定義の `ragContextJson` | index 6（RAG Context JSONパス・FILE）。RAG だけ |

アダプタは同期処理（移植元と同じ）のため、別スレッドで動かす。
"""

import asyncio
import json
import logging
import tempfile
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
ADAPTER_FAILED_PREFIX = "生成AIアダプタの実行に失敗しました"


@dataclass(frozen=True)
class AdapterJob:
    """アダプタに渡す 1 回分の列とプロパティ。

    Attributes
    ----------
    columns : list[ColumnInformation]
        列の定義。
    record : list[ColumnData]
        列の値。
    properties : dict[int, str]
        プロパティ（ID → 値）。
    """

    columns: list[ColumnInformation]
    record: list[ColumnData]
    properties: dict[int, str]


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
    if definition.output_type == RAG_OUTPUT_TYPE:
        columns.append(
            ColumnInformation("RAG Context JSONパス", ColumnType.FILE, INDEX_RAG_JSON)
        )
        record.append(ColumnData.file(definition.rag_context_json or SKIPPED_FILE_PATH))
    return AdapterJob(columns, record, properties)


@cache
def _names_by_id() -> dict[int, str]:
    """プロパティ ID → 名前の対応（ログ用。一度だけ作る）。

    Returns
    -------
    dict[int, str]
        ID → 名前。
    """
    return {value: name for name, value in PropertyIds.by_name().items()}


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
    """生成AIアダプタを 1 回動かすワークフロー。"""

    def __init__(
        self,
        definition: WorkflowDefinition,
        chat_runtime_factory: ChatRuntimeFactory | None = None,
    ) -> None:
        """定義を受け取る。

        Parameters
        ----------
        definition : WorkflowDefinition
            サービスの定義。
        chat_runtime_factory : ChatRuntimeFactory | None
            core の chat を作る処理（テストでプロバイダを差し替える）。
        """
        self.definition = definition
        self._chat_runtime_factory = chat_runtime_factory

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
