"""server-local からエミュレーターを呼ぶ結合テスト。

server-local のコードは変更せず、リポジトリの `server-local/` を読み込んで使う
（`tests/conftest.py` で sys.path に足している）。server-local のパッケージ名は
`app` のため、エミュレーター（`waha_emulator`）と同じプロセスに読み込める。
server-local の Waha! クライアント・ストリーム処理が変わって食い違いが出たら、
このテストで分かる。
"""

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import app.models  # noqa: F401 — server-local のテーブル定義をメタデータに登録する
import httpx
import pytest
from app.clients.waha_client import WahaClient
from app.core.config import Settings as ServerLocalSettings
from app.core.database import create_engine, create_session_factory
from app.core.errors import ExternalServiceError
from app.main import create_app as create_server_local_app
from app.services.stream.tail_reader import StreamFileTailReader, TerminalType
from generative_ai_core.chat.models import Role
from sqlmodel import SQLModel

from tests.conftest import AUTH_KEY, ScriptedProvider, make_settings
from waha_emulator.main import create_app as create_emulator_app
from waha_emulator.workflows.registry import WorkflowRegistry

SERVER_AUTH_HEADERS = {"X-SERVER-AUTH-KEY": "server-key"}
WAHA_BASE_URL = "http://waha.test/"
# echo は 8 文字ずつ返すため、途中経過が複数回に分かれる長さにする
QUESTION = "エミュレーター経由で server-local から届いた質問です。"
SLOW_PROVIDER_SECONDS = 0.5
FAST_RESULT_RETRY_SECONDS = 0.01
FEW_RESULT_RETRIES = 3


class FakeNawApiClient:
    """ライブラリ生成を使わないテストのため、呼ばれたら失敗させる。"""

    async def create_library_stub(self, *args: Any) -> str:
        """ライブラリの作成（呼ばれない想定）。

        Parameters
        ----------
        *args : Any
            引数。

        Returns
        -------
        str
            返さない。

        Raises
        ------
        AssertionError
            常に。
        """
        raise AssertionError("NAW は呼ばれない想定")

    async def update_library_title(self, *args: Any) -> None:
        """ライブラリのタイトルの更新（呼ばれない想定）。

        Parameters
        ----------
        *args : Any
            引数。

        Raises
        ------
        AssertionError
            常に。
        """
        raise AssertionError("NAW は呼ばれない想定")


@dataclass
class Environment:
    """起動したエミュレーターと server-local。

    Attributes
    ----------
    waha : Any
        エミュレーターにつないだ server-local の WahaClient。
    server_local : httpx.AsyncClient
        server-local につないだクライアント。
    stream_dir : Path
        server-local がストリームファイルを作るディレクトリ。
    """

    waha: Any  # server-local の WahaClient
    server_local: httpx.AsyncClient
    stream_dir: Path


@asynccontextmanager
async def connected(
    tmp_path: Path,
    *,
    wait_for_completion: bool = True,
    provider: ScriptedProvider | None = None,
    result_max_retries: int = 50,
    registry: WorkflowRegistry | None = None,
) -> AsyncIterator[Environment]:
    """エミュレーターと server-local を起動し、server-local の WahaClient をつなぐ。

    Parameters
    ----------
    tmp_path : Path
        SQLite・ストリームファイルを置くディレクトリ。
    wait_for_completion : bool
        エミュレーターの EXECUTE_WAIT_FOR_COMPLETION。
    provider : ScriptedProvider | None
        生成AIアダプタが使うプロバイダの代わり。None なら echo。
    result_max_retries : int
        WahaClient が result を待つ回数の上限。
    registry : WorkflowRegistry | None
        サービス ID → ワークフロー。None なら設定（既定は echo の生成AI）から作る。

    Yields
    ------
    Environment
        起動したエミュレーターと server-local。
    """
    emulator = create_emulator_app(
        make_settings(EXECUTE_WAIT_FOR_COMPLETION=wait_for_completion),
        registry=registry,
        chat_runtime_factory=(
            None if provider is None else provider.chat_runtime_factory
        ),
    )
    stream_dir = tmp_path / "stream-output"
    settings = ServerLocalSettings(
        _env_file=None,
        SECURITY_SERVER_AUTH_KEY=SERVER_AUTH_HEADERS["X-SERVER-AUTH-KEY"],
        DATABASE_URL=f"sqlite+aiosqlite:///{tmp_path / 'server-local.sqlite3'}",
        STREAM_OUTPUT_DIR=str(stream_dir),
        STREAM_TAIL_POLL_INTERVAL_MS=10,
        STREAM_RESULT_POLL_INTERVAL_MS=30,
        STREAM_EMITTER_TIMEOUT_MS=10_000,
        WAHA_URL=WAHA_BASE_URL,
        WAHA_AUTHKEY=AUTH_KEY,
    )
    engine = create_engine(settings.database_url)
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    try:
        async with (
            emulator.router.lifespan_context(emulator),
            httpx.AsyncClient(
                transport=httpx.ASGITransport(app=emulator), timeout=None
            ) as waha_http,
        ):
            waha = WahaClient(
                base_url=WAHA_BASE_URL,
                auth_key=AUTH_KEY,
                http_client=waha_http,
                result_retry_interval_seconds=FAST_RESULT_RETRY_SECONDS,
                result_max_retries=result_max_retries,
            )
            server_local = create_server_local_app(
                settings,
                session_factory=create_session_factory(engine),
                waha_client=waha,
                naw_client=FakeNawApiClient(),
                enable_cleanup=False,
            )
            async with (
                server_local.router.lifespan_context(server_local),
                httpx.AsyncClient(
                    transport=httpx.ASGITransport(app=server_local),
                    base_url="http://server-local.test",
                    headers=SERVER_AUTH_HEADERS,
                    timeout=None,
                ) as client,
            ):
                yield Environment(waha, client, stream_dir)
    finally:
        # ワーカースレッドをゲートで止めたままにしない
        if provider is not None:
            provider.release()
        await engine.dispose()


def _message_files(text_data: dict[str, Any]) -> dict[str, tuple[str, bytes, str]]:
    """ブラウザと同じく textData を application/json の Blob として送る。

    Parameters
    ----------
    text_data : dict[str, Any]
        textData。

    Returns
    -------
    dict[str, tuple[str, bytes, str]]
        multipart で送るファイル。
    """
    return {"textData": ("blob", json.dumps(text_data).encode(), "application/json")}


def _text_data(message_id: str = "message-1") -> dict[str, Any]:
    """履歴付きのメッセージ生成の textData を作る。

    Parameters
    ----------
    message_id : str
        メッセージ ID。

    Returns
    -------
    dict[str, Any]
        textData。
    """
    return {
        "assistantId": "gpt-4o",
        "messageId": message_id,
        "userInput": QUESTION,
        "historyMessages": [
            {"type": "USER", "content": "前の質問"},
            {"type": "ASSISTANT", "content": "前の回答"},
        ],
    }


def _parse_sse(body: str) -> list[dict[str, Any]]:
    """SSE の本文をイベントの一覧にする。

    Parameters
    ----------
    body : str
        SSE の本文。

    Returns
    -------
    list[dict[str, Any]]
        イベント。
    """
    events = []
    for block in body.split("\n\n"):
        if block:
            assert block.startswith("data:"), block
            events.append(json.loads(block[len("data:") :]))
    return events


def _reasoning_text(events: list[dict[str, Any]]) -> list[str]:
    """イベントのうち reasoning_delta の差分を順に取り出す。

    Parameters
    ----------
    events : list[dict[str, Any]]
        イベント。

    Returns
    -------
    list[str]
        差分。
    """
    return [e["text"] for e in events if e["type"] == "reasoning_delta"]


async def test_waha_client_chat_roundtrip(tmp_path: Path) -> None:
    """WahaClient で startsession → upload → execute → result → download → endsession が通ること"""
    stream_file = tmp_path / "stream.txt"
    stream_file.touch()
    async with connected(tmp_path) as env:
        session_id = await env.waha.start_session()
        await env.waha.upload_file(
            filename="question.txt",
            content=QUESTION.encode(),
            slot="question",
            session_id=session_id,
        )
        await env.waha.execute_with_stream_file(session_id, "gpt-4o", str(stream_file))
        await env.waha.get_results(session_id)
        output = await env.waha.download_file(session_id, "outputfile")
        await env.waha.end_session(session_id)

        with pytest.raises(ExternalServiceError, match="404"):
            await env.waha.poll_result_once(session_id)

    assert json.loads(output) == {
        "answer": QUESTION,
        "filepaths": [],
        "references": [],
        "imageExplanations": [],
    }
    # server-local のストリームファイルの読み取り処理で、途中経過と終端が読めること
    read = StreamFileTailReader().read_new(stream_file)
    payloads = [json.loads(chunk.removeprefix("data:")) for chunk in read.chunks]
    deltas = _reasoning_text(payloads)
    assert len(deltas) > 1
    assert "".join(deltas) == QUESTION
    assert read.terminal_type == TerminalType.COMPLETED


async def test_waha_client_execute_with_empty_service_id(tmp_path: Path) -> None:
    """アシスタント ID 未指定（空のサービス ID）でも WahaClient の execute が通ること"""
    async with connected(tmp_path) as env:
        session_id = await env.waha.start_session()
        await env.waha.upload_file(
            filename="question.txt",
            content=QUESTION.encode(),
            slot="question",
            session_id=session_id,
        )
        await env.waha.execute(session_id, "")
        await env.waha.get_results(session_id)
        output = await env.waha.download_file(session_id, "outputfile")
        await env.waha.end_session(session_id)

    assert json.loads(output)["answer"] == QUESTION


async def test_waha_client_learning_fails(tmp_path: Path) -> None:
    """WahaClient で学習を実行すると、結果待ちで失敗（例外）になること"""
    async with connected(tmp_path) as env:
        session_id = await env.waha.start_session()
        await env.waha.upload_file(
            filename="doc.txt", content=b"doc", slot="file", session_id=session_id
        )
        await env.waha.execute_learning(session_id, "learning", "500", None)

        with pytest.raises(ExternalServiceError):
            await env.waha.get_results(session_id)
        await env.waha.end_session(session_id)


@pytest.mark.parametrize("wait_for_completion", [True, False])
async def test_server_local_sse_naw_compatible(
    tmp_path: Path, wait_for_completion: bool
) -> None:
    """NAW 互換 SSE で途中経過（reasoning_delta）と回答が返り、ストリームファイルに終端が残ること"""
    async with connected(tmp_path, wait_for_completion=wait_for_completion) as env:
        response = await env.server_local.post(
            "/api/messages/content", files=_message_files(_text_data())
        )
        stream_files = list(env.stream_dir.glob("*.txt"))

    events = _parse_sse(response.text)
    reasoning = _reasoning_text(events)
    assert response.status_code == 200
    assert len(reasoning) > 1
    assert "".join(reasoning) == QUESTION
    assert [e["type"] for e in events[len(reasoning) :]] == [
        "text_delta",
        "message_stop",
        "message_content",
    ]
    assert events[-3]["text"] == QUESTION
    assert events[-1]["data"]["status"] == "OK"
    assert events[-1]["data"]["answer"] == QUESTION
    assert len(stream_files) == 1
    lines = stream_files[0].read_text(encoding="utf-8").splitlines()
    assert len(lines) == len(reasoning) + 1
    assert lines[-1] == 'data:{"type":"completed"}'


async def test_server_local_sse_sends_history_to_provider(tmp_path: Path) -> None:
    """NAW 互換 SSE の会話履歴（USER・ASSISTANT）が、役割付きでプロバイダに渡ること"""
    provider = ScriptedProvider()
    async with connected(tmp_path, provider=provider) as env:
        await env.server_local.post(
            "/api/messages/content", files=_message_files(_text_data())
        )

    messages = provider.received[0].messages
    assert [(m.role, m.content) for m in messages] == [
        (Role.USER, "前の質問"),
        (Role.ASSISTANT, "前の回答"),
        (Role.USER, QUESTION),
    ]


async def test_server_local_sse_legacy_passthrough_streams_deltas(
    tmp_path: Path,
) -> None:
    """旧形式の SSE では、ストリームファイルの途中経過が複数回に分かれて中継されること"""
    async with connected(tmp_path) as env:
        response = await env.server_local.post(
            "/api/messages/content/stream", files=_message_files(_text_data())
        )

    events = _parse_sse(response.text)
    deltas = _reasoning_text(events)
    assert len(deltas) > 1
    assert "".join(deltas) == QUESTION
    assert events[-1] == {"type": "completed"}


@pytest.mark.parametrize("wait_for_completion", [True, False])
async def test_server_local_sync_api(tmp_path: Path, wait_for_completion: bool) -> None:
    """旧形式の同期 API でも回答が返ること"""
    async with connected(tmp_path, wait_for_completion=wait_for_completion) as env:
        response = await env.server_local.post(
            "/api/messages/content/sync", files=_message_files(_text_data())
        )

    body = response.json()
    assert body["status"] == "OK"
    assert body["answer"] == QUESTION


@pytest.mark.parametrize(
    ("wait_for_completion", "expected_status"), [(True, "OK"), (False, "ERROR")]
)
async def test_server_local_sync_api_with_slow_provider(
    tmp_path: Path, wait_for_completion: bool, expected_status: str
) -> None:
    """プロバイダが結果待ちの上限より遅いと、非同期の execute では同期 API が失敗すること"""
    provider = ScriptedProvider(
        reasoning=["遅い回答"], delay_seconds=SLOW_PROVIDER_SECONDS
    )
    async with connected(
        tmp_path,
        wait_for_completion=wait_for_completion,
        provider=provider,
        result_max_retries=FEW_RESULT_RETRIES,
    ) as env:
        response = await env.server_local.post(
            "/api/messages/content/sync", files=_message_files(_text_data())
        )

    assert response.json()["status"] == expected_status


async def test_server_local_sse_reports_provider_failure(tmp_path: Path) -> None:
    """プロバイダが失敗すると、NAW 互換 SSE がエラーで終わること"""
    provider = ScriptedProvider(
        reasoning=["途中"], error=RuntimeError("LLM が落ちました")
    )
    async with connected(tmp_path, provider=provider) as env:
        response = await env.server_local.post(
            "/api/messages/content", files=_message_files(_text_data())
        )

    events = _parse_sse(response.text)
    types = [e["type"] for e in events]
    assert "error" in types
    assert "text_delta" not in types
    assert events[-1]["type"] == "message_content"
    assert events[-1]["data"]["status"] == "ERROR"
