"""移植元 MessageContentStreamService（SSE でのメッセージ生成）の移植。

移植元はスレッドプール + ScheduledExecutorService で
「Waha! ジョブ起動」「ストリームファイルの追従読み取り」「Waha! 結果ポーリング」を
並行させていた。ここでは同じ 3 つを asyncio のタスクで並行させ、クライアントへは
キュー経由で SSE を送る。クライアントが切断しても処理は最後まで続け、DB に結果を残す。
"""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.clients.naw_api_client import NawApiClient
from app.clients.waha_client import (
    SLOT_OUTPUT,
    SLOT_TEXTDATA,
    ResultStatus,
    WahaClient,
)
from app.core.config import MS_PER_SECOND, Settings
from app.core.errors import EntityNotFoundError
from app.core.ids import create_unique_id
from app.core.jsonutil import to_compact_json
from app.models import MessageContent, MessageContentStatus
from app.repositories import message_content_repository
from app.schemas.message import (
    CreateMessageContentCommand,
    RetrievalAnswer,
    create_message_content_response,
)
from app.schemas.sse import (
    error_event,
    format_sse_data,
    library_id_event,
    message_content_event,
    message_stop_event,
    text_delta_event,
    to_sse,
)
from app.services import library_content_service
from app.services.message_content_service import save_attachment_files, validate_target
from app.services.stream.tail_reader import (
    StreamFileTailReader,
    TerminalType,
    extract_data_payload,
)
from app.services.waha_inputs import upload_question_history_and_attachment

logger = logging.getLogger(__name__)

TEXT_DATA_FILENAME = "textData.json"
STREAM_FILE_SUFFIX = ".txt"
LOG_PREVIEW_MAX_LENGTH = 500
MASKED_VALUE = "***"

# NAW 互換モードでクライアントへ中継するストリームファイルのイベント
FORWARD_EVENT_TYPES = frozenset(
    {"reasoning_delta", "library_title_delta", "library_content_delta"}
)
# 完了・回答は Waha! の outputfile から確定するため、ストリーム側のものは無視する
IGNORED_EVENT_TYPES = frozenset(
    {"text_delta", "message_stop", "message_content", "completed", "error"}
)
STREAM_ERROR_TERMINAL_MESSAGE = "ストリームが error イベントで終了しました。"
JOB_FAILURE_MESSAGE = "ジョブの実行に失敗しました。"


class StreamMode(StrEnum):
    """クライアントへ SSE を送る形式。

    `NAW_COMPATIBLE` は `content` API 用で、ストリームファイルのうち推論・
    ライブラリの途中経過だけを中継し、回答・完了は Waha! の出力ファイルから
    確定して NAW 形式のイベントで送る。`LEGACY_PASSTHROUGH` は非推奨の
    `content/stream` API 用で、ストリームファイルの `data:` をそのまま中継する。
    """

    NAW_COMPATIBLE = "NAW_COMPATIBLE"
    LEGACY_PASSTHROUGH = "LEGACY_PASSTHROUGH"


@dataclass(frozen=True)
class StreamSession:
    """SSE でのメッセージ生成の準備結果。

    リクエスト処理中に作ったメッセージ内容のレコードとストリームファイルを、
    バックグラウンドの生成処理へ引き渡すために使う。

    Attributes
    ----------
    message_content_id : str
        生成結果を保存するメッセージ内容 ID。
    message_id : str
        メッセージ ID。
    stream_file_path : Path
        Waha! が途中経過を書き込むストリームファイルのパス（このサーバーから見たもの）。
    """

    message_content_id: str
    message_id: str
    stream_file_path: Path


@dataclass
class StreamRuntime:
    """1 回の SSE でのメッセージ生成の実行状態。

    Waha! ジョブの起動・ストリームファイルの追従・結果のポーリングの 3 つの
    タスクで共有し、どのタスクが確定させたか、クライアントがまだ接続しているか
    などを持つ。クライアントへ送る SSE は `queue` に積み、`None` を番兵として
    レスポンスを閉じる。

    Attributes
    ----------
    command : CreateMessageContentCommand
        メッセージ内容の生成要求。
    session : StreamSession
        準備したメッセージ内容とストリームファイル。
    mode : StreamMode
        クライアントへ SSE を送る形式。
    queue : asyncio.Queue[str | None]
        クライアントへ送る SSE の文字列。`None` で終わりを表す。
    tail_reader : StreamFileTailReader
        ストリームファイルの読み取り位置を持つリーダー。
    tail_read_lock : asyncio.Lock
        ストリームファイルの読み取りを 1 つずつにするためのロック。
    client_connected : bool
        クライアントが接続中か。切断後は SSE を積まない。
    file_terminal_reached : bool
        ストリームファイルの終端イベントを読んだか。
    finalized : bool
        成功・失敗のどちらかで確定したか。
    finalize_started : bool
        成功時の確定処理に入ったか。
    empty_stream_file_logged : bool
        ストリームファイルが空のままである警告を出したか（重複して出さないため）。
    waha_session_id : str | None
        Waha! のセッション ID。開始前は None。
    result_status : ResultStatus
        Waha! のジョブの最新の状態。
    library_id : str | None
        ライブラリを作る場合に NAW に作成したライブラリの ID。
    library_title : list[str]
        ストリームから受け取ったライブラリのタイトルの断片。
    library_content : list[str]
        ストリームから受け取ったライブラリの本文の断片。
    poll_tasks : list[asyncio.Task[None]]
        ストリームファイルの追従と結果のポーリングのタスク。
    """

    command: CreateMessageContentCommand
    session: StreamSession
    mode: StreamMode
    queue: asyncio.Queue[str | None] = field(default_factory=asyncio.Queue)
    tail_reader: StreamFileTailReader = field(default_factory=StreamFileTailReader)
    # tail の読み取りはスレッドで行う。ストリームの監視と確定前の読み残し処理が
    # 同時に読むと読み取り位置が競合するため、1 つずつにする
    tail_read_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    client_connected: bool = True
    file_terminal_reached: bool = False
    finalized: bool = False
    # 確定処理に入ったか。ストリームの監視と結果のポーリングの両方から入れるため
    finalize_started: bool = False
    empty_stream_file_logged: bool = False
    waha_session_id: str | None = None
    result_status: ResultStatus = ResultStatus.RUNNING
    library_id: str | None = None
    library_title: list[str] = field(default_factory=list)
    library_content: list[str] = field(default_factory=list)
    poll_tasks: list[asyncio.Task[None]] = field(default_factory=list)


def _mask_access_token(text_data: dict[str, Any]) -> dict[str, Any]:
    """ログに NAW のアクセストークンを残さないよう伏せ字にする。

    移植元は textData.json を本文ごとログに出していたが、トークンが漏れると
    NAW API を利用者として呼べてしまうため、ログでは値を出さない。

    Parameters
    ----------
    text_data : dict[str, Any]
        Waha! に送る textData.json の内容。

    Returns
    -------
    dict[str, Any]
        `accessToken` を `***` にした複製。キーがなければ元の辞書をそのまま返す。
    """
    if "accessToken" not in text_data:
        return text_data
    return {**text_data, "accessToken": MASKED_VALUE}


def _preview(value: str | None) -> str | None:
    """ログに出す文字列を先頭 500 文字までに切り詰める。

    Waha! の出力ファイルは長くなることがあり、全文をログに出すとログが
    肥大化するため。

    Parameters
    ----------
    value : str | None
        ログに出す文字列。

    Returns
    -------
    str | None
        500 文字以内ならそのまま、超える場合は切り詰めて `...(truncated)` を
        付けた文字列。None なら None。
    """
    if value is None or len(value) <= LOG_PREVIEW_MAX_LENGTH:
        return value
    return value[:LOG_PREVIEW_MAX_LENGTH] + "...(truncated)"


class MessageContentStreamService:
    """SSE でメッセージ内容を生成するサービス（移植元 MessageContentStreamService）。

    リクエスト処理中にメッセージ内容のレコードとストリームファイルを準備し、
    Waha! ジョブの起動・ストリームファイルの追従・結果のポーリングを asyncio の
    バックグラウンドタスクで並行させる。クライアントが切断しても処理は最後まで
    続け、結果を DB に残す。
    """

    def __init__(
        self,
        *,
        settings: Settings,
        session_factory: async_sessionmaker[AsyncSession],
        waha: WahaClient,
        naw: NawApiClient,
    ) -> None:
        """依存するクライアントと設定を受け取ってサービスを作る。

        Parameters
        ----------
        settings : Settings
            アプリの設定（ストリームファイルの出力先・ポーリング間隔など）。
        session_factory : async_sessionmaker[AsyncSession]
            バックグラウンドで DB を更新するときに使うセッションの生成元。
            リクエストのセッションはレスポンス後に閉じられるため、別に作る。
        waha : WahaClient
            Waha! の API クライアント。
        naw : NawApiClient
            ライブラリの作成・タイトル更新に使う NAW API のクライアント。
        """
        self._settings = settings
        self._session_factory = session_factory
        self._waha = waha
        self._naw = naw
        # バックグラウンドタスクは参照を持たないと GC で消えるため保持する
        self._tasks: set[asyncio.Task[None]] = set()

    # ------------------------------------------------------------------
    # 準備（リクエスト処理中に同期的に行い、エラーは HTTP エラーで返す）
    # ------------------------------------------------------------------
    async def prepare_stream(
        self, session: AsyncSession, command: CreateMessageContentCommand
    ) -> StreamSession:
        """生成結果を保存するメッセージ内容のレコードとストリームファイルを準備する。

        メッセージ内容 ID の指定があれば既存のレコードの回答を空に戻し（回答の
        再生成）、なければ新しく登録して添付ファイルも保存する。リクエスト処理中に
        同期的に行い、エラーは HTTP エラーとして返す。ストリームファイルの作成に
        失敗したときに仮のレコードが残らないよう（message_id は一意のため、残ると
        同じ messageId で再試行できない）、ファイルを作ってからコミットする。

        Parameters
        ----------
        session : AsyncSession
            リクエストの DB セッション。
        command : CreateMessageContentCommand
            メッセージ内容の生成要求。

        Returns
        -------
        StreamSession
            準備したメッセージ内容 ID とストリームファイルのパス。

        Raises
        ------
        BadRequestError
            生成の対象が指定されていない場合。
        EntityNotFoundError
            指定したメッセージ内容 ID のレコードがない場合。
        """
        validate_target(command)
        message_id = command.message_id
        if command.message_content_id is not None:
            content = await message_content_repository.find_by_id(
                session, command.message_content_id
            )
            if content is None:
                raise EntityNotFoundError("対象データが見つかりません")
            message_id = content.message_id
            content.answer = ""
            content.context = None
            content.set_reference_file_paths([])
            content.status = MessageContentStatus.OK.value
            content.touch()
        else:
            content_id = await create_unique_id(
                lambda c: message_content_repository.exists_by_id(session, c)
            )
            content = MessageContent(
                id=content_id,
                message_id=message_id or "",
                status=MessageContentStatus.OK.value,
                question=command.user_input or "",
                answer="",
            )
            session.add(content)
            await session.flush()
            await save_attachment_files(session, content.id, command.attachment_files)
        # ストリームファイルの作成に失敗したら仮レコードも残さないよう、コミット前に作る
        # （message_id は一意のため、残ると同じ messageId で再試行できなくなる）
        stream_file_path = self._prepare_stream_file(content.id)
        await session.commit()

        logger.info(
            "Stream session prepared: messageContentId=%s, messageId=%s, "
            "streamfilepath=%s",
            content.id,
            message_id,
            self._waha_path(stream_file_path),
        )
        return StreamSession(
            message_content_id=content.id,
            message_id=message_id or "",
            stream_file_path=stream_file_path,
        )

    def _prepare_stream_file(self, message_content_id: str) -> Path:
        """Waha! が途中経過を書き込む空のストリームファイルを作る。

        同じメッセージ内容 ID で再生成するときに前回の内容を読まないよう、
        既存のファイルは消してから作り直す。

        Parameters
        ----------
        message_content_id : str
            メッセージ内容 ID（ファイル名に使う）。

        Returns
        -------
        Path
            作成したストリームファイルの絶対パス。
        """
        output_dir = Path(self._settings.stream_output_dir).resolve()
        output_dir.mkdir(parents=True, exist_ok=True)
        stream_file = output_dir / f"{message_content_id}{STREAM_FILE_SUFFIX}"
        stream_file.unlink(missing_ok=True)
        stream_file.touch()
        return stream_file

    def _waha_path(self, stream_file: Path) -> str:
        """Waha! から見たストリームファイルのパス。

        Waha! が別のコンテナ・ホストで動く場合、共有ディレクトリのマウント先が
        異なるため、設定があればディレクトリ部分を置き換える。

        Parameters
        ----------
        stream_file : Path
            このサーバーから見たストリームファイルのパス。

        Returns
        -------
        str
            Waha! に渡すパス。設定がなければ元のパスのまま。
        """
        waha_dir = self._settings.stream_waha_output_dir
        if not waha_dir:
            return str(stream_file)
        return f"{waha_dir.rstrip('/')}/{stream_file.name}"

    # ------------------------------------------------------------------
    # ストリーミング開始
    # ------------------------------------------------------------------
    def start_streaming(
        self,
        command: CreateMessageContentCommand,
        session: StreamSession,
        mode: StreamMode,
    ) -> StreamRuntime:
        """実行状態を作り、Waha! ジョブの起動をバックグラウンドで始める。

        レスポンスを待たせないよう、ジョブの起動は待たずに戻る。

        Parameters
        ----------
        command : CreateMessageContentCommand
            メッセージ内容の生成要求。
        session : StreamSession
            `prepare_stream` で準備したメッセージ内容とストリームファイル。
        mode : StreamMode
            クライアントへ SSE を送る形式。

        Returns
        -------
        StreamRuntime
            SSE の送信に使う実行状態。
        """
        runtime = StreamRuntime(command=command, session=session, mode=mode)
        logger.info(
            "Streaming started: messageContentId=%s, mode=%s, streamFilePath=%s, "
            "tailPollMs=%d, resultPollMs=%d",
            session.message_content_id,
            mode,
            session.stream_file_path,
            self._settings.stream_tail_poll_interval_ms,
            self._settings.stream_result_poll_interval_ms,
        )
        self._spawn(self._start_waha_job(runtime))
        return runtime

    async def sse_events(self, runtime: StreamRuntime) -> AsyncIterator[str]:
        """キューに積まれた SSE をクライアントへ流す（SseEmitter 相当）。

        番兵（None）を受け取るか、移植元 SseEmitter と同じタイムアウトを過ぎたら
        終わる。タイムアウトは例外にせず警告ログを出して閉じる。切断・タイムアウトの
        後は SSE を積まないようにするが、生成処理自体はバックグラウンドで続く。

        Parameters
        ----------
        runtime : StreamRuntime
            対象のストリーミングの実行状態。

        Yields
        ------
        str
            SSE 形式の文字列。

        Raises
        ------
        asyncio.CancelledError
            クライアントの切断などでレスポンスの送信が取り消された場合（そのまま伝える）。
        """
        loop = asyncio.get_running_loop()
        deadline = (
            loop.time() + self._settings.stream_emitter_timeout_ms / MS_PER_SECOND
        )
        try:
            while True:
                remaining = deadline - loop.time()
                if remaining <= 0:
                    raise TimeoutError
                item = await asyncio.wait_for(runtime.queue.get(), remaining)
                if item is None:
                    return
                yield item
        except TimeoutError:
            logger.warning(
                "SSE emitter timeout: messageContentId=%s, streamFilePath=%s, "
                "fileTerminal=%s, wahaStatus=%s",
                runtime.session.message_content_id,
                runtime.session.stream_file_path,
                runtime.file_terminal_reached,
                runtime.result_status,
            )
        finally:
            # 切断・タイムアウト後は送信しない（処理自体はバックグラウンドで続く）
            runtime.client_connected = False

    async def shutdown(self) -> None:
        """実行中のバックグラウンドタスクをすべて取り消し、終わるまで待つ。

        アプリの終了時に、生成処理が途中のまま残らないようにするために呼ぶ。
        タスクの例外は終了処理を止めないよう無視する。
        """
        tasks = list(self._tasks)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    def _spawn(self, coro: Any) -> asyncio.Task[None]:
        """コルーチンをバックグラウンドタスクとして起動し、終わるまで参照を持つ。

        asyncio はタスクを弱参照でしか持たず、参照がないと途中で GC されることが
        あるため、終わるまで集合に入れておく。

        Parameters
        ----------
        coro : Any
            起動するコルーチン。

        Returns
        -------
        asyncio.Task[None]
            起動したタスク。
        """
        task: asyncio.Task[None] = asyncio.create_task(coro)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return task

    # ------------------------------------------------------------------
    # Waha! ジョブ
    # ------------------------------------------------------------------
    async def _start_waha_job(self, runtime: StreamRuntime) -> None:
        """Waha! のジョブを起動し、終わるまで待つ。

        ライブラリを作る場合は先に NAW にライブラリを作って ID をクライアントへ送る。
        入力ファイルをアップロードしたらポーリングを始めてからジョブを実行する
        （実行 API はジョブが終わるまで戻らないため）。途中で失敗したら、例外を
        外に出さずにメッセージ内容をエラーで確定させる。

        Parameters
        ----------
        runtime : StreamRuntime
            対象のストリーミングの実行状態。
        """
        stream_file_path = self._waha_path(runtime.session.stream_file_path)
        try:
            logger.info(
                "Starting Waha job: messageContentId=%s, assistantId=%s, "
                "streamfilepath=%s",
                runtime.session.message_content_id,
                runtime.command.assistant_id,
                stream_file_path,
            )
            if runtime.command.create_library:
                runtime.library_id = await self._naw.create_library_stub(
                    runtime.command.message_id,
                    runtime.command.access_token,
                    runtime.command.tenant_id,
                )
                logger.info(
                    "Created NAW library stub: messageContentId=%s, libraryId=%s",
                    runtime.session.message_content_id,
                    runtime.library_id,
                )
                self._send_event(runtime, library_id_event(runtime.library_id))

            runtime.waha_session_id = await self._waha.start_session()
            await self._upload_inputs(runtime, stream_file_path)
            self._start_polling(runtime)
            await self._waha.execute_with_stream_file(
                runtime.waha_session_id,
                runtime.command.assistant_id or "",
                stream_file_path,
            )
            logger.info(
                "Waha execute finished: messageContentId=%s, wahaSessionId=%s",
                runtime.session.message_content_id,
                runtime.waha_session_id,
            )
        except Exception as e:
            logger.exception(
                "Failed to start Waha streaming job: messageContentId=%s, "
                "wahaSessionId=%s",
                runtime.session.message_content_id,
                runtime.waha_session_id,
            )
            runtime.result_status = ResultStatus.FAILURE
            await self._finalize_with_error(runtime, str(e))

    async def _upload_inputs(
        self, runtime: StreamRuntime, stream_file_path: str
    ) -> None:
        """Waha! のセッションに、生成に使う入力ファイルをアップロードする。

        ストリームファイルのパスなどを入れた textData.json と、質問・会話履歴・
        添付ファイルを送る。ログに出す textData.json はアクセストークンを伏せる。

        Parameters
        ----------
        runtime : StreamRuntime
            対象のストリーミングの実行状態。
        stream_file_path : str
            Waha! から見たストリームファイルのパス。

        Raises
        ------
        RuntimeError
            Waha! のセッションを開始していない場合。
        """
        if runtime.waha_session_id is None:
            raise RuntimeError("Waha session is not started")
        text_data = self._build_text_data(runtime, stream_file_path)
        logger.info(
            "Preparing textData.json: messageContentId=%s, wahaSessionId=%s, "
            "content=%s",
            runtime.session.message_content_id,
            runtime.waha_session_id,
            to_compact_json(_mask_access_token(text_data)),
        )
        await self._waha.upload_file(
            filename=TEXT_DATA_FILENAME,
            content=to_compact_json(text_data).encode("utf-8"),
            slot=SLOT_TEXTDATA,
            session_id=runtime.waha_session_id,
        )
        await upload_question_history_and_attachment(
            self._waha, runtime.command, runtime.waha_session_id
        )

    @staticmethod
    def _build_text_data(
        runtime: StreamRuntime, stream_file_path: str
    ) -> dict[str, Any]:
        """移植元 WahaTextDataDTO（@JsonInclude(NON_NULL)、空の tools は省略）。

        Waha! に渡す textData.json の内容を作る。値がない項目は移植元と同じく
        キーごと省く。

        Parameters
        ----------
        runtime : StreamRuntime
            対象のストリーミングの実行状態。
        stream_file_path : str
            Waha! から見たストリームファイルのパス。

        Returns
        -------
        dict[str, Any]
            textData.json の内容。
        """
        text_data: dict[str, Any] = {
            "streamfilepath": stream_file_path,
            "createLibrary": runtime.command.create_library,
        }
        if runtime.command.tools:
            text_data["tools"] = [{"name": t.name} for t in runtime.command.tools]
        if runtime.command.access_token is not None:
            text_data["accessToken"] = runtime.command.access_token
        if runtime.session.message_id:
            text_data["messageId"] = runtime.session.message_id
        return text_data

    # ------------------------------------------------------------------
    # ポーリング
    # ------------------------------------------------------------------
    def _start_polling(self, runtime: StreamRuntime) -> None:
        """ストリームファイルの追従と Waha! の結果のポーリングを始める。

        二重に起動しないよう、既に始めていれば何もしない。

        Parameters
        ----------
        runtime : StreamRuntime
            対象のストリーミングの実行状態。
        """
        if runtime.poll_tasks:
            return
        runtime.poll_tasks = [
            self._spawn(self._tail_loop(runtime)),
            self._spawn(self._result_loop(runtime)),
        ]

    async def _tail_loop(self, runtime: StreamRuntime) -> None:
        """確定するまで、一定間隔でストリームファイルを読み進める。

        読み取りに失敗したら、メッセージ内容をエラーで確定させて終わる。

        Parameters
        ----------
        runtime : StreamRuntime
            対象のストリーミングの実行状態。
        """
        interval = self._settings.stream_tail_poll_interval_ms / MS_PER_SECOND
        while not runtime.finalized:
            try:
                await self._process_stream_file_read(runtime, attempt_finalize=True)
            except Exception as e:
                logger.exception(
                    "Failed to poll stream file: messageContentId=%s, path=%s",
                    runtime.session.message_content_id,
                    runtime.session.stream_file_path,
                )
                runtime.result_status = ResultStatus.FAILURE
                await self._finalize_with_error(runtime, str(e))
                return
            await asyncio.sleep(interval)

    async def _result_loop(self, runtime: StreamRuntime) -> None:
        """確定するまで、一定間隔で Waha! のジョブの状態を問い合わせる。

        ジョブ起動直後の未確定な応答を FAILURE と誤判定しないよう、初回も間隔を
        空けてから問い合わせる。SUCCESS なら確定処理へ進み、FAILURE や問い合わせの
        失敗ならエラーで確定させる。

        Parameters
        ----------
        runtime : StreamRuntime
            対象のストリーミングの実行状態。
        """
        # ジョブ起動直後の未確定応答を FAILURE と誤判定しないよう、初回も間隔を空ける
        interval = self._settings.stream_result_poll_interval_ms / MS_PER_SECOND
        while True:
            await asyncio.sleep(interval)
            if runtime.finalized or runtime.waha_session_id is None:
                return
            try:
                status = await self._waha.poll_result_once(runtime.waha_session_id)
            except Exception as e:
                logger.exception(
                    "Failed to poll Waha result: messageContentId=%s",
                    runtime.session.message_content_id,
                )
                runtime.result_status = ResultStatus.FAILURE
                await self._finalize_with_error(runtime, str(e))
                return
            if status != runtime.result_status:
                logger.info(
                    "Waha result status changed: messageContentId=%s, %s -> %s, "
                    "fileTerminal=%s",
                    runtime.session.message_content_id,
                    runtime.result_status,
                    status,
                    runtime.file_terminal_reached,
                )
            runtime.result_status = status
            if status == ResultStatus.FAILURE:
                await self._finalize_with_error(runtime, JOB_FAILURE_MESSAGE)
                return
            if status == ResultStatus.SUCCESS:
                await self._try_finalize(runtime)
                return

    async def _process_stream_file_read(
        self, runtime: StreamRuntime, *, attempt_finalize: bool
    ) -> int:
        """ストリームファイルの追記分を読み、イベントをクライアントへ中継する。

        ファイルの読み取りでイベントループを止めないようスレッドで読み、読み取り
        位置が競合しないようロックで 1 つずつにする。error の終端イベントを読んだら
        エラーで確定させる。Waha! が SUCCESS なのにファイルが空のままなら、
        調査用に 1 回だけ警告ログを出す。

        Parameters
        ----------
        runtime : StreamRuntime
            対象のストリーミングの実行状態。
        attempt_finalize : bool
            読み終えた後に確定処理を試みるか。確定処理の中から読み残しを読む
            ときは False にする。

        Returns
        -------
        int
            今回読み取ったイベントの数。
        """
        path = runtime.session.stream_file_path
        if (
            runtime.result_status == ResultStatus.SUCCESS
            and not runtime.file_terminal_reached
            and not runtime.empty_stream_file_logged
            and (not path.exists() or path.stat().st_size == 0)
        ):
            logger.warning(
                "Waha SUCCESS but stream file is still empty: messageContentId=%s, "
                "path=%s",
                runtime.session.message_content_id,
                path,
            )
            runtime.empty_stream_file_logged = True

        # ファイルの読み取りでイベントループを止めないよう、スレッドで読む
        async with runtime.tail_read_lock:
            result = await asyncio.to_thread(runtime.tail_reader.read_new, path)
        for chunk in result.chunks:
            self._handle_stream_chunk(runtime, chunk)
        if result.terminal_reached:
            runtime.file_terminal_reached = True
            logger.info(
                "Stream file terminal reached: messageContentId=%s, terminalType=%s",
                runtime.session.message_content_id,
                result.terminal_type,
            )
            if result.terminal_type == TerminalType.ERROR:
                runtime.result_status = ResultStatus.FAILURE
                await self._finalize_with_error(runtime, STREAM_ERROR_TERMINAL_MESSAGE)
                return len(result.chunks)
        if attempt_finalize:
            await self._try_finalize(runtime)
        return len(result.chunks)

    def _handle_stream_chunk(self, runtime: StreamRuntime, event_block: str) -> None:
        """ストリームファイルの 1 イベントを、送信形式に合わせてクライアントへ中継する。

        `LEGACY_PASSTHROUGH` なら `data:` をそのまま送る。`NAW_COMPATIBLE` なら
        推論・ライブラリの途中経過だけを送り、回答・完了のイベントは Waha! の
        出力ファイルで確定するため無視する。ライブラリのタイトル・本文の断片は
        確定時に保存するため貯めておく。

        Parameters
        ----------
        runtime : StreamRuntime
            対象のストリーミングの実行状態。
        event_block : str
            1 イベント分のテキスト。

        Raises
        ------
        json.JSONDecodeError
            `NAW_COMPATIBLE` で `data:` が JSON でない場合（呼び出し元でエラーとして
            確定させる）。
        """
        payload = extract_data_payload(event_block)
        if payload is None:
            return
        if runtime.mode == StreamMode.LEGACY_PASSTHROUGH:
            self._send_raw(runtime, payload)
            return
        if not payload:
            # 移植元（Jackson の readTree）は空の data を MissingNode として読み、
            # type が空になるため転送も終端判定もせずに無視する
            return

        node = json.loads(payload)
        event_type = node.get("type") if isinstance(node, dict) else None
        if event_type in IGNORED_EVENT_TYPES:
            logger.debug(
                "Ignoring stream event (completion comes from outputfile): "
                "messageContentId=%s, type=%s",
                runtime.session.message_content_id,
                event_type,
            )
            return
        if event_type in FORWARD_EVENT_TYPES:
            self._send_raw(runtime, payload)
            text = node.get("text")
            text = text if isinstance(text, str) else ""
            if event_type == "library_title_delta":
                runtime.library_title.append(text)
            elif event_type == "library_content_delta":
                runtime.library_content.append(text)

    # ------------------------------------------------------------------
    # 終了処理
    # ------------------------------------------------------------------
    async def _try_finalize(self, runtime: StreamRuntime) -> None:
        """Waha! の結果が SUCCESS なら、ストリームの終端を待たずに確定する。

        ストリームファイルは途中経過の中継用で、完了の必須条件ではない。確定前に
        ストリームファイルの読み残しを送り、Waha! の出力ファイルから回答を保存して
        クライアントへ回答・完了のイベントを送る。確定処理に失敗したらメッセージ
        内容をエラーにする。ストリームの監視と結果のポーリングの両方から呼ばれる
        ため、最初に入った方だけが確定させる。

        Parameters
        ----------
        runtime : StreamRuntime
            対象のストリーミングの実行状態。
        """
        if runtime.finalized or runtime.result_status != ResultStatus.SUCCESS:
            return
        if runtime.finalize_started:
            # tail の読み取り（スレッド）を待つ間に、もう一方のタスクも確定処理に
            # 入ってくることがあるため、最初に入った方だけが確定させる
            return
        runtime.finalize_started = True
        if not runtime.file_terminal_reached:
            logger.warning(
                "Finalizing without stream terminal event; using Waha outputfile. "
                "messageContentId=%s, path=%s",
                runtime.session.message_content_id,
                runtime.session.stream_file_path,
            )
        await self._drain_pending_stream_events(runtime)
        if runtime.finalized:
            return
        runtime.finalized = True
        self._cancel_other_poll_tasks(runtime)

        logger.info(
            "Finalizing stream: messageContentId=%s, wahaSessionId=%s",
            runtime.session.message_content_id,
            runtime.waha_session_id,
        )
        try:
            response = await self._waha.download_file(
                runtime.waha_session_id or "", SLOT_OUTPUT
            )
            logger.info(
                "Waha outputfile downloaded: messageContentId=%s, rawResponse=%s",
                runtime.session.message_content_id,
                _preview(response),
            )
            answer = RetrievalAnswer.model_validate_json(response)
            response_dto = await self._update_message_content_success(
                runtime.session.message_content_id, answer
            )
            await self._persist_generated_library(runtime)
            if runtime.mode == StreamMode.NAW_COMPATIBLE:
                self._send_event(runtime, text_delta_event(answer.answer or ""))
                self._send_event(runtime, message_stop_event(0, 0))
                self._send_event(runtime, message_content_event(response_dto))
            logger.info(
                "Stream completed successfully: messageContentId=%s",
                runtime.session.message_content_id,
            )
        except Exception as e:
            logger.exception("Failed to finalize streaming message content")
            await self._mark_message_content_error(
                runtime.session.message_content_id, str(e)
            )
            self._send_event(runtime, error_event(str(e)))
        finally:
            self._close(runtime)
            await self._cleanup(runtime)

    async def _drain_pending_stream_events(self, runtime: StreamRuntime) -> None:
        """確定の直前に、ストリームファイルの読み残しを読んでクライアントへ送る。

        読み残しの失敗で回答の確定まで失敗にしないよう、例外は警告ログに出して
        握りつぶす。

        Parameters
        ----------
        runtime : StreamRuntime
            対象のストリーミングの実行状態。
        """
        try:
            total = await self._process_stream_file_read(
                runtime, attempt_finalize=False
            )
            if total > 0:
                logger.info(
                    "Stream file drained before finalize: messageContentId=%s, "
                    "totalChunks=%d",
                    runtime.session.message_content_id,
                    total,
                )
        except Exception:
            logger.warning(
                "Failed to drain stream file before finalize: messageContentId=%s",
                runtime.session.message_content_id,
                exc_info=True,
            )

    async def _finalize_with_error(self, runtime: StreamRuntime, message: str) -> None:
        """メッセージ内容をエラーで確定させ、クライアントへエラーを送って閉じる。

        既に確定していれば何もしない。`NAW_COMPATIBLE` ではエラー後のメッセージ
        内容も送る。DB の更新に失敗してもレスポンスを閉じて Waha! のセッションを
        終える。

        Parameters
        ----------
        runtime : StreamRuntime
            対象のストリーミングの実行状態。
        message : str
            回答として保存し、クライアントへ送るエラーメッセージ。
        """
        if runtime.finalized:
            return
        runtime.finalized = True
        self._cancel_other_poll_tasks(runtime)
        logger.warning(
            "Finalizing stream with error: messageContentId=%s, wahaSessionId=%s, "
            "reason=%s, fileTerminal=%s, wahaStatus=%s",
            runtime.session.message_content_id,
            runtime.waha_session_id,
            message,
            runtime.file_terminal_reached,
            runtime.result_status,
        )
        try:
            response_dto = await self._mark_message_content_error(
                runtime.session.message_content_id, message
            )
            self._send_event(runtime, error_event(message))
            if runtime.mode == StreamMode.NAW_COMPATIBLE and response_dto is not None:
                self._send_event(runtime, message_content_event(response_dto))
        finally:
            self._close(runtime)
            await self._cleanup(runtime)

    def _cancel_other_poll_tasks(self, runtime: StreamRuntime) -> None:
        """確定後に不要になったポーリングのタスクを止める。

        自分自身を取り消すと以降の await で中断されて確定処理が終わらないため、
        呼び出し元のタスク以外だけを止める。

        Parameters
        ----------
        runtime : StreamRuntime
            対象のストリーミングの実行状態。
        """
        # 自分自身をキャンセルすると以降の await で中断されるため、他のタスクのみ止める
        current = asyncio.current_task()
        for task in runtime.poll_tasks:
            if task is not current:
                task.cancel()

    async def _cleanup(self, runtime: StreamRuntime) -> None:
        """Waha! のセッションを終える。

        ストリームファイルは調査用に残す（移植元どおり。定期削除で掃除する）。
        セッションの終了に失敗しても確定済みの結果には影響しないため、警告ログに
        出して続ける。

        Parameters
        ----------
        runtime : StreamRuntime
            対象のストリーミングの実行状態。
        """
        # ストリームファイルは調査用に残す（移植元どおり。定期削除で掃除する）
        if runtime.waha_session_id is None:
            return
        try:
            await self._waha.end_session(runtime.waha_session_id)
        except Exception:
            logger.warning(
                "Failed to end Waha session %s", runtime.waha_session_id, exc_info=True
            )

    # ------------------------------------------------------------------
    # DB 更新
    # ------------------------------------------------------------------
    async def _update_message_content_success(
        self, message_content_id: str, answer: RetrievalAnswer
    ) -> dict[str, Any]:
        """Waha! の回答でメッセージ内容を更新し、成功として保存する。

        参照元がなければ文脈と参照元ファイルパスを空にする。バックグラウンドで
        動くため、リクエストとは別のセッションで更新する。

        Parameters
        ----------
        message_content_id : str
            メッセージ内容 ID。
        answer : RetrievalAnswer
            Waha! の出力ファイルから読んだ回答。

        Returns
        -------
        dict[str, Any]
            更新後のメッセージ内容のレスポンス（添付ファイルを含む）。

        Raises
        ------
        EntityNotFoundError
            メッセージ内容が見つからない場合（生成中に削除された場合など）。
        """
        async with self._session_factory() as session:
            content = await message_content_repository.find_by_id(
                session, message_content_id
            )
            if content is None:
                raise EntityNotFoundError("対象データが見つかりません")
            content.status = MessageContentStatus.OK.value
            content.answer = answer.answer or ""
            if answer.references:
                content.context = answer.context_text()
                content.set_reference_file_paths(answer.filepaths)
            else:
                content.context = None
                content.set_reference_file_paths([])
            content.touch()
            await session.commit()
            return await self._to_response(session, content)

    async def _mark_message_content_error(
        self, message_content_id: str, message: str
    ) -> dict[str, Any] | None:
        """メッセージ内容をエラー状態にし、エラーメッセージを回答として保存する。

        DB の更新に失敗しても、クライアントへのエラー通知と後始末を続けるため、
        例外はログに出して握りつぶす。

        Parameters
        ----------
        message_content_id : str
            メッセージ内容 ID。
        message : str
            回答として保存するエラーメッセージ。

        Returns
        -------
        dict[str, Any] | None
            更新後のメッセージ内容のレスポンス。レコードがない・更新に失敗した
            場合は None。
        """
        try:
            async with self._session_factory() as session:
                content = await message_content_repository.find_by_id(
                    session, message_content_id
                )
                if content is None:
                    return None
                content.status = MessageContentStatus.ERROR.value
                content.answer = message
                content.touch()
                await session.commit()
                return await self._to_response(session, content)
        except Exception:
            # DB 更新に失敗してもクライアントへのエラー通知と後始末は行う
            logger.exception(
                "Failed to mark message content as error: messageContentId=%s",
                message_content_id,
            )
            return None

    @staticmethod
    async def _to_response(
        session: AsyncSession, content: MessageContent
    ) -> dict[str, Any]:
        """メッセージ内容を添付ファイル付きのレスポンス形式に変換する。

        Parameters
        ----------
        session : AsyncSession
            添付ファイルの取得に使う DB セッション。
        content : MessageContent
            変換するメッセージ内容。

        Returns
        -------
        dict[str, Any]
            メッセージ内容のレスポンス。
        """
        files = await message_content_repository.find_files_by_content_ids(
            session, [content.id]
        )
        return create_message_content_response(content, files[content.id])

    async def _persist_generated_library(self, runtime: StreamRuntime) -> None:
        """ストリームで受け取ったライブラリの本文を保存し、NAW のタイトルを更新する。

        ライブラリを作っていなければ何もしない。タイトルが空なら NAW は更新しない。
        ライブラリの保存失敗で回答全体を失敗にはしない（移植元どおり）ため、
        例外はログに出して握りつぶす。

        Parameters
        ----------
        runtime : StreamRuntime
            対象のストリーミングの実行状態。
        """
        if not runtime.library_id or not runtime.library_id.strip():
            return
        try:
            async with self._session_factory() as session:
                await library_content_service.save_content(
                    session, runtime.library_id, "".join(runtime.library_content)
                )
            title = "".join(runtime.library_title).strip()
            if title:
                await self._naw.update_library_title(
                    runtime.library_id,
                    title,
                    runtime.command.access_token,
                    runtime.command.tenant_id,
                )
        except Exception:
            # ライブラリの保存失敗で回答全体を失敗にはしない（移植元どおり）
            logger.exception(
                "Failed to persist generated library: messageContentId=%s, "
                "libraryId=%s",
                runtime.session.message_content_id,
                runtime.library_id,
            )

    # ------------------------------------------------------------------
    # SSE 送信
    # ------------------------------------------------------------------
    @staticmethod
    def _send_event(runtime: StreamRuntime, event: dict[str, Any]) -> None:
        """イベントを SSE 形式にしてクライアントへの送信キューに積む。

        クライアントが切断していれば積まない。

        Parameters
        ----------
        runtime : StreamRuntime
            対象のストリーミングの実行状態。
        event : dict[str, Any]
            送るイベント（JSON にする）。
        """
        if runtime.client_connected:
            runtime.queue.put_nowait(to_sse(event))

    @staticmethod
    def _send_raw(runtime: StreamRuntime, json_payload: str) -> None:
        """ストリームファイルの JSON をそのまま SSE の data にしてキューに積む。

        Waha! が書いたイベントを加工せずに中継するために使う。クライアントが
        切断していれば積まない。

        Parameters
        ----------
        runtime : StreamRuntime
            対象のストリーミングの実行状態。
        json_payload : str
            `data:` に入れる JSON 文字列。
        """
        if runtime.client_connected:
            runtime.queue.put_nowait(format_sse_data(json_payload))

    @staticmethod
    def _close(runtime: StreamRuntime) -> None:
        """積んだイベントを流し切った後にレスポンスを閉じるため、番兵を入れる。

        キューは上限なしのため put_nowait は失敗しない。切断後でも、待っている
        `sse_events` を終わらせるために必ず入れる。

        Parameters
        ----------
        runtime : StreamRuntime
            対象のストリーミングの実行状態。
        """
        # 積んだイベントを流し切った後にレスポンスを閉じるため、番兵を入れる
        # （キューは上限なしのため put_nowait は失敗しない）
        runtime.queue.put_nowait(None)
