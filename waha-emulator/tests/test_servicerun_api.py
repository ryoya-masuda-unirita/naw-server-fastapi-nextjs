import asyncio
import json
import threading
from pathlib import Path
from typing import Any

import httpx
import pytest

from tests.conftest import (
    API,
    AUTH_KEY,
    ScriptedProvider,
    make_settings,
    running_emulator,
    start_session,
    upload,
    wait_for_result,
    wait_until_received,
)
from waha_emulator.stream_file import StreamFile
from waha_emulator.workflows.generative_ai import ADAPTER_FAILED_PREFIX

EXPECTED_CHAT_OUTPUT = {
    "answer": "こんにちは、世界",
    "filepaths": [],
    "references": [],
    "imageExplanations": [],
}


async def test_start_session_returns_session_id(client: httpx.AsyncClient) -> None:
    """正しい authkey でセッション ID がテキストで返ること"""
    response = await client.get(f"{API}/startsession", params={"authkey": AUTH_KEY})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    assert len(response.text) == 32


async def test_start_session_rejects_wrong_authkey(client: httpx.AsyncClient) -> None:
    """authkey が違うと 401 になり、本文に受け取った authkey が出ないこと"""
    response = await client.get(
        f"{API}/startsession", params={"authkey": "wrong-secret"}
    )

    assert response.status_code == 401
    assert "wrong-secret" not in response.text


async def test_end_session_discards_session(client: httpx.AsyncClient) -> None:
    """endsession でセッションとスロットが破棄されること"""
    session_id = await start_session(client)
    await upload(client, session_id, "question", b"q")

    response = await client.get(f"{API}/endsession", params={"sessionid": session_id})

    assert response.status_code == 200
    assert response.text == "OK"
    after = await client.get(f"{API}/result", params={"sessionid": session_id})
    assert after.status_code == 404


async def test_end_session_cancels_running_job(tmp_path: Path) -> None:
    """実行中のジョブが endsession で止まり、execute は中断として応答し、ストリームに error が書かれること"""
    stream_file = tmp_path / "stream.txt"
    stream_file.touch()
    # 中断後もワーカースレッドは最後まで動くため、ゲートを開けた後に書かれる差分をなくす
    provider = ScriptedProvider(reasoning=[], gate=threading.Event())
    async with running_emulator(provider=provider) as (app, client):
        session_id = await start_session(client)
        await upload(client, session_id, "question", "質問".encode())
        session = app.state.session_store.get(session_id)
        execute = asyncio.create_task(
            client.get(
                f"{API}/execute/svc",
                params={"sessionid": session_id, "streamfilepath": str(stream_file)},
            )
        )
        await wait_until_received(provider)
        task = session.job.task

        await client.get(f"{API}/endsession", params={"sessionid": session_id})
        response = await execute
        provider.release()

        assert task.cancelled()
        assert response.status_code == 200
        assert response.text == "FAILURE: ジョブが中断されました"
        assert stream_file.read_text(encoding="utf-8") == (
            'data:{"type":"error","message":"ジョブが中断されました"}\n'
        )


async def test_execute_with_empty_service_id_uses_default_workflow(
    client: httpx.AsyncClient,
) -> None:
    """サービス ID が空（`/execute/`）でも、既定のワークフローで実行されること"""
    session_id = await start_session(client)
    await upload(client, session_id, "question", b"q")

    response = await client.get(f"{API}/execute/", params={"sessionid": session_id})

    assert response.text == "SUCCESS"


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/endsession"),
        ("POST", "/upload/question"),
        ("GET", "/execute/svc"),
        ("GET", "/result"),
        ("GET", "/download/outputfile"),
    ],
)
async def test_unknown_session_returns_404(
    client: httpx.AsyncClient, method: str, path: str
) -> None:
    """存在しないセッション ID は 404 になること"""
    kwargs: dict[str, object] = {"params": {"sessionid": "unknown"}}
    if method == "POST":
        kwargs["files"] = {"file": ("q.txt", b"q", "text/plain")}
    response = await client.request(method, f"{API}{path}", **kwargs)  # type: ignore[arg-type]

    assert response.status_code == 404


async def test_upload_overwrites_slot(
    client: httpx.AsyncClient, provider: ScriptedProvider
) -> None:
    """同じスロットへのアップロードは上書きされ、後の内容がプロバイダに渡ること"""
    session_id = await start_session(client)

    first = await upload(client, session_id, "question", "最初".encode())
    await upload(client, session_id, "question", "上書き".encode())
    await client.get(f"{API}/execute/svc", params={"sessionid": session_id})

    assert first.text == "OK"
    assert provider.received[0].last_user_text() == "上書き"


@pytest.mark.parametrize("slot", ["outputfile", "unknown"])
async def test_upload_rejects_non_input_slot(
    client: httpx.AsyncClient, slot: str
) -> None:
    """入力スロット以外へのアップロードは 400 になること"""
    session_id = await start_session(client)

    response = await upload(client, session_id, slot, b"x")

    assert response.status_code == 400


async def test_result_before_execute_is_running(client: httpx.AsyncClient) -> None:
    """execute 前の result は失敗ではなく RUNNING を返すこと"""
    session_id = await start_session(client)

    response = await client.get(f"{API}/result", params={"sessionid": session_id})

    assert response.text == "RUNNING"


async def test_execute_chat_waits_for_completion(client: httpx.AsyncClient) -> None:
    """同期の execute はジョブの完了まで待ち、outputfile に回答の JSON が入ること"""
    session_id = await start_session(client)
    await upload(client, session_id, "question", "質問です".encode())

    response = await client.get(
        f"{API}/execute/gpt-4o", params={"sessionid": session_id}
    )
    result = await client.get(f"{API}/result", params={"sessionid": session_id})
    output = await client.get(
        f"{API}/download/outputfile", params={"sessionid": session_id}
    )

    assert response.text == "SUCCESS"
    assert result.text == "SUCCESS"
    assert json.loads(output.text) == EXPECTED_CHAT_OUTPUT


async def test_execute_with_default_echo_provider_answers_question() -> None:
    """プロバイダを差し替えなければ echo で動き、質問がそのまま回答になること"""
    async with running_emulator() as (_, client):
        session_id = await start_session(client)
        await upload(client, session_id, "question", "エコーの質問".encode())

        response = await client.get(
            f"{API}/execute/svc", params={"sessionid": session_id}
        )
        output = await client.get(
            f"{API}/download/outputfile", params={"sessionid": session_id}
        )

    assert response.text == "SUCCESS"
    assert json.loads(output.text)["answer"] == "エコーの質問"


async def test_result_is_running_while_job_runs() -> None:
    """ジョブの実行中は RUNNING を返すこと"""
    provider = ScriptedProvider(gate=threading.Event())
    async with running_emulator(provider=provider) as (_, client):
        session_id = await start_session(client)
        await upload(client, session_id, "question", b"q")
        execute = asyncio.create_task(
            client.get(f"{API}/execute/svc", params={"sessionid": session_id})
        )
        await wait_until_received(provider)

        running = await client.get(f"{API}/result", params={"sessionid": session_id})
        provider.release()
        response = await execute

        assert running.text == "RUNNING"
        assert response.text == "SUCCESS"


async def test_execute_returns_immediately_when_not_waiting() -> None:
    """EXECUTE_WAIT_FOR_COMPLETION=false では execute がすぐ OK を返し、後で SUCCESS になること"""
    provider = ScriptedProvider(gate=threading.Event())
    settings = make_settings(EXECUTE_WAIT_FOR_COMPLETION=False)
    async with running_emulator(settings, provider=provider) as (_, client):
        session_id = await start_session(client)
        await upload(client, session_id, "question", b"q")

        response = await client.get(
            f"{API}/execute/svc", params={"sessionid": session_id}
        )
        running = await client.get(f"{API}/result", params={"sessionid": session_id})
        provider.release()
        final = await wait_for_result(client, session_id)

        assert response.text == "OK"
        assert running.text == "RUNNING"
        assert final == "SUCCESS"


async def test_execute_rejects_while_running() -> None:
    """ジョブの実行中に execute すると 409 になること"""
    provider = ScriptedProvider(gate=threading.Event())
    settings = make_settings(EXECUTE_WAIT_FOR_COMPLETION=False)
    async with running_emulator(settings, provider=provider) as (_, client):
        session_id = await start_session(client)
        await upload(client, session_id, "question", b"q")
        await client.get(f"{API}/execute/svc", params={"sessionid": session_id})

        second = await client.get(
            f"{API}/execute/svc", params={"sessionid": session_id}
        )
        provider.release()
        await wait_for_result(client, session_id)

        assert second.status_code == 409


async def test_execute_without_question_fails_as_unsupported(
    client: httpx.AsyncClient,
) -> None:
    """question なし（削除サービスと同じ呼び方）は未対応の失敗になること"""
    session_id = await start_session(client)
    await upload(client, session_id, "file", b"part-1\npart-2\n")

    response = await client.get(
        f"{API}/execute/delete-service", params={"sessionid": session_id}
    )
    output = await client.get(
        f"{API}/download/outputfile", params={"sessionid": session_id}
    )

    assert response.text.startswith("FAILURE")
    assert "未対応" in response.text
    assert output.status_code == 404


@pytest.mark.parametrize(
    "params",
    [
        {"splitLength": "500", "filepath": ""},
        {"start": "0", "end": "1000"},
    ],
)
async def test_learning_and_sync_fail_as_unsupported(
    client: httpx.AsyncClient, params: dict[str, str]
) -> None:
    """学習・同期のパラメータ付きの execute は未対応の失敗になること"""
    session_id = await start_session(client)
    await upload(client, session_id, "file", b"data")

    await client.get(f"{API}/execute/svc", params={"sessionid": session_id, **params})
    result = await client.get(f"{API}/result", params={"sessionid": session_id})

    assert result.text.startswith("FAILURE")
    assert "未対応" in result.text


async def test_create_library_is_passed_to_adapter(
    client: httpx.AsyncClient, provider: ScriptedProvider
) -> None:
    """textdata の createLibrary が true でも拒否せず、アダプタに任せて回答すること"""
    session_id = await start_session(client)
    await upload(client, session_id, "question", b"q")
    await upload(client, session_id, "textdata", b'{"createLibrary":true}')

    response = await client.get(f"{API}/execute/svc", params={"sessionid": session_id})
    output = await client.get(
        f"{API}/download/outputfile", params={"sessionid": session_id}
    )

    assert response.text == "SUCCESS"
    assert json.loads(output.text)["answer"] == provider.answer


async def test_textdata_tools_for_non_secuaigent_answers_unsupported(
    client: httpx.AsyncClient, provider: ScriptedProvider
) -> None:
    """SecuAiGent 以外で textdata に tools があると、プロバイダを呼ばずに未対応を回答すること"""
    session_id = await start_session(client)
    await upload(client, session_id, "question", b"q")
    await upload(client, session_id, "textdata", b'{"tools":[{"name":"web_search"}]}')

    response = await client.get(f"{API}/execute/svc", params={"sessionid": session_id})
    output = await client.get(
        f"{API}/download/outputfile", params={"sessionid": session_id}
    )

    assert response.text == "SUCCESS"
    assert json.loads(output.text)["answer"].startswith("unsupported_tools_provider: ")
    assert provider.received == []


async def test_provider_error_fails_job_and_writes_error_event(tmp_path: Path) -> None:
    """プロバイダが失敗するとジョブが失敗し、途中経過の後にストリームへ error が書かれること"""
    stream_file = tmp_path / "stream.txt"
    stream_file.touch()
    provider = ScriptedProvider(
        reasoning=["途中"], error=RuntimeError("LLM が落ちました")
    )
    async with running_emulator(provider=provider) as (_, client):
        session_id = await start_session(client)
        await upload(client, session_id, "question", b"q")

        response = await client.get(
            f"{API}/execute/svc",
            params={"sessionid": session_id, "streamfilepath": str(stream_file)},
        )

    reason = response.text.removeprefix("FAILURE: ")
    assert response.text.startswith(f"FAILURE: {ADAPTER_FAILED_PREFIX}: ")
    assert "CHAT_PROVIDER_FAILURE: LLM が落ちました" in reason
    lines = stream_file.read_text(encoding="utf-8").splitlines()
    assert lines[0] == 'data:{"type":"reasoning_delta","text":"途中"}'
    assert json.loads(lines[1].removeprefix("data:")) == {
        "type": "error",
        "message": reason,
    }
    assert len(lines) == 2


async def test_stream_file_receives_reasoning_deltas_and_completed(
    client: httpx.AsyncClient, tmp_path: Path
) -> None:
    """ストリームファイルに差分ごとの reasoning_delta と最後の completed が追記されること"""
    stream_file = tmp_path / "stream.txt"
    stream_file.write_text("既存\n", encoding="utf-8")
    session_id = await start_session(client)
    await upload(client, session_id, "question", b"q")

    response = await client.get(
        f"{API}/execute/svc",
        params={"sessionid": session_id, "streamfilepath": str(stream_file)},
    )

    assert response.text == "SUCCESS"
    assert stream_file.read_text(encoding="utf-8") == (
        "既存\n"
        'data:{"type":"reasoning_delta","text":"こんにちは"}\n'
        'data:{"type":"reasoning_delta","text":"、"}\n'
        'data:{"type":"reasoning_delta","text":"世界"}\n'
        'data:{"type":"completed"}\n'
    )


async def test_missing_stream_file_fails_job_without_creating_it(
    client: httpx.AsyncClient, tmp_path: Path
) -> None:
    """ストリームファイルがなければ作らずに、想定内の失敗（理由のみ）にすること"""
    stream_file = tmp_path / "missing.txt"
    session_id = await start_session(client)
    await upload(client, session_id, "question", b"q")

    response = await client.get(
        f"{API}/execute/svc",
        params={"sessionid": session_id, "streamfilepath": str(stream_file)},
    )

    assert response.text == (
        f"FAILURE: streamfilepath のファイルがありません: {stream_file}"
    )
    assert not stream_file.exists()


async def test_completed_write_failure_keeps_success(
    client: httpx.AsyncClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """回答を保存した後に終端（completed）を書けなくても、ジョブは成功にすること"""
    original = StreamFile.write_event

    def failing_completed(self: StreamFile, event: dict[str, Any]) -> None:
        """completed だけ書けないことにする。

        Parameters
        ----------
        self : StreamFile
            ストリームファイル。
        event : dict[str, Any]
            書くイベント。

        Raises
        ------
        OSError
            completed のとき。
        """
        if event["type"] == "completed":
            raise OSError("No space left on device")
        original(self, event)

    monkeypatch.setattr(StreamFile, "write_event", failing_completed)
    stream_file = tmp_path / "stream.txt"
    stream_file.touch()
    session_id = await start_session(client)
    await upload(client, session_id, "question", b"q")

    response = await client.get(
        f"{API}/execute/svc",
        params={"sessionid": session_id, "streamfilepath": str(stream_file)},
    )
    output = await client.get(
        f"{API}/download/outputfile", params={"sessionid": session_id}
    )

    assert response.text == "SUCCESS"
    assert json.loads(output.text)["answer"] == "こんにちは、世界"


async def test_stream_file_outside_allowed_dir_fails_job(tmp_path: Path) -> None:
    """許可ディレクトリの外のストリームファイルには書かずにジョブを失敗させること"""
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    outside = tmp_path / "outside.txt"
    outside.touch()
    settings = make_settings(STREAM_ALLOWED_DIR=str(allowed))
    provider = ScriptedProvider()
    async with running_emulator(settings, provider=provider) as (_, client):
        session_id = await start_session(client)
        await upload(client, session_id, "question", b"q")

        response = await client.get(
            f"{API}/execute/svc",
            params={
                "sessionid": session_id,
                "streamfilepath": str(allowed / ".." / "outside.txt"),
            },
        )

    assert response.text.startswith("FAILURE")
    assert outside.read_text() == ""
    assert provider.received == []


async def test_textdata_stream_path_outside_allowed_dir_fails_job(
    tmp_path: Path,
) -> None:
    """textdata の streamfilepath が許可ディレクトリの外なら、プロバイダを呼ばずに失敗させること"""
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    outside = tmp_path / "outside.txt"
    outside.touch()
    settings = make_settings(STREAM_ALLOWED_DIR=str(allowed))
    provider = ScriptedProvider()
    text_data = json.dumps({"streamfilepath": str(outside)}).encode()
    async with running_emulator(settings, provider=provider) as (_, client):
        session_id = await start_session(client)
        await upload(client, session_id, "question", b"q")
        await upload(client, session_id, "textdata", text_data)

        response = await client.get(
            f"{API}/execute/svc", params={"sessionid": session_id}
        )

    assert response.text.startswith(
        "FAILURE: streamfilepath が許可されたディレクトリの外"
    )
    assert outside.read_text() == ""
    assert provider.received == []
