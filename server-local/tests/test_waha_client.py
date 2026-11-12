from collections.abc import Callable

import httpx
import pytest

from app.clients.waha_client import ResultStatus, WahaClient
from app.core.errors import ExternalServiceError

API = "http://waha.test/WahaServer/servicerun/api"
ENCODED_AUTH_KEY = "key%2B%2F%3D"


def make_client(
    handler: Callable[[httpx.Request], httpx.Response], max_retries: int = 10
) -> tuple[WahaClient, httpx.AsyncClient]:
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = WahaClient(
        base_url="http://waha.test/",
        auth_key="key+/=",
        http_client=http,
        result_retry_interval_seconds=0,
        result_max_retries=max_retries,
    )
    return client, http


async def test_start_session() -> None:
    """startsession に認証キーをクエリで渡し、本文をセッション ID として返すこと"""
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, text="sess-1")

    client, http = make_client(handler)
    async with http:
        assert await client.start_session() == "sess-1"
    assert requests[0].method == "GET"
    assert requests[0].url.path == "/WahaServer/servicerun/api/startsession"
    assert requests[0].url.params["authkey"] == "key+/="


async def test_upload_file() -> None:
    """upload/{slot} に multipart の file パートで送ること"""
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, text="OK")

    client, http = make_client(handler)
    async with http:
        await client.upload_file(
            filename="question.txt",
            content="質問".encode(),
            slot="question",
            session_id="s1",
        )
    request = requests[0]
    assert request.method == "POST"
    assert str(request.url) == f"{API}/upload/question?sessionid=s1"
    assert request.headers["content-type"].startswith("multipart/form-data")
    body = request.content
    assert b'name="file"; filename="question.txt"' in body
    assert b"Content-Type: text/plain" in body
    assert "質問".encode() in body


async def test_execute_variants() -> None:
    """execute 系はサービス ID をパス、各値をクエリで渡すこと"""
    urls: list[httpx.URL] = []

    def handler(request: httpx.Request) -> httpx.Response:
        urls.append(request.url)
        return httpx.Response(200, text="OK")

    client, http = make_client(handler)
    async with http:
        await client.execute("s1", "svc")
        await client.execute_with_stream_file("s1", "svc", "/data/a b.txt")
        await client.execute_learning("s1", "svc", "1000", "/docs")
        await client.execute_sync("s1", "svc", 0, 100)
    assert all(u.path == "/WahaServer/servicerun/api/execute/svc" for u in urls)
    assert dict(urls[0].params) == {"sessionid": "s1"}
    assert dict(urls[1].params) == {
        "sessionid": "s1",
        "streamfilepath": "/data/a b.txt",
    }
    assert dict(urls[2].params) == {
        "sessionid": "s1",
        "splitLength": "1000",
        "filepath": "/docs",
    }
    assert dict(urls[3].params) == {"sessionid": "s1", "start": "0", "end": "100"}


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        ("SUCCESS", ResultStatus.SUCCESS),
        ("SUCCESS:done", ResultStatus.SUCCESS),
        ("RUNNING", ResultStatus.RUNNING),
        ("FAILURE", ResultStatus.FAILURE),
        ("", ResultStatus.FAILURE),
    ],
)
async def test_poll_result_once(body: str, expected: ResultStatus) -> None:
    """result の本文から状態を判定すること"""
    client, http = make_client(lambda _r: httpx.Response(200, text=body))
    async with http:
        assert await client.poll_result_once("s1") == expected


async def test_get_results_success_after_running() -> None:
    """RUNNING の間は待ち、SUCCESS で戻ること"""
    bodies = iter(["RUNNING", "RUNNING", "SUCCESS"])
    count = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal count
        count += 1
        return httpx.Response(200, text=next(bodies))

    client, http = make_client(handler)
    async with http:
        await client.get_results("s1")
    assert count == 3


async def test_get_results_failure() -> None:
    """FAILURE ならジョブ失敗の例外を投げること"""
    client, http = make_client(lambda _r: httpx.Response(200, text="FAILURE"))
    async with http:
        with pytest.raises(ExternalServiceError, match="ジョブの実行に失敗しました。"):
            await client.get_results("s1")


async def test_get_results_gives_up_after_max_retries() -> None:
    """RUNNING が上限回数続いたら例外にせず戻ること（移植元どおり）"""
    count = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal count
        count += 1
        return httpx.Response(200, text="RUNNING")

    client, http = make_client(handler, max_retries=3)
    async with http:
        await client.get_results("s1")
    assert count == 3


async def test_download_and_end_session() -> None:
    """download/{slot} の本文を返し、endsession を呼べること"""
    urls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        urls.append(str(request.url))
        return httpx.Response(200, text='{"answer":"a"}')

    client, http = make_client(handler)
    async with http:
        assert await client.download_file("s1", "outputfile") == '{"answer":"a"}'
        await client.end_session("s1")
    assert urls == [
        f"{API}/download/outputfile?sessionid=s1",
        f"{API}/endsession?sessionid=s1",
    ]


async def test_http_error_message_hides_authkey() -> None:
    """Waha! が 4xx/5xx を返したら、URL（authkey）を含まない移植元と同じ書式の例外にすること"""
    client, http = make_client(lambda _r: httpx.Response(503))
    async with http:
        with pytest.raises(ExternalServiceError) as exc_info:
            await client.start_session()
    exc = exc_info.value
    assert exc.message == "503 Service Unavailable: [no body]"
    # URL に入る authkey は URL エンコードされるため、エンコード後の形でも確かめる
    assert "key+/=" not in str(exc)
    assert ENCODED_AUTH_KEY not in str(exc)
    assert "authkey" not in str(exc)
    # 元の httpx の例外（URL 付き）をトレースバックに出さない
    assert exc.__cause__ is None
    assert exc.__context__ is None


async def test_http_error_message_with_body() -> None:
    """エラー応答の本文は引用符で囲み、改行・制御文字を置き換えること"""
    client, http = make_client(lambda _r: httpx.Response(500, text="err\r\nline\x07"))
    async with http:
        with pytest.raises(ExternalServiceError) as exc_info:
            await client.execute("s1", "svc")
    assert exc_info.value.message == '500 Internal Server Error: "err<EOL><EOL>line?"'


async def test_upload_http_error() -> None:
    """アップロードの HTTP エラーも ExternalServiceError にすること"""
    client, http = make_client(lambda _r: httpx.Response(404))
    async with http:
        with pytest.raises(ExternalServiceError) as exc_info:
            await client.upload_file(
                filename="a.txt", content=b"x", slot="file", session_id="s1"
            )
    assert exc_info.value.message == "404 Not Found: [no body]"


async def test_http_error_without_reason_phrase() -> None:
    """理由句のない応答では、移植元（HttpURLConnection）と同じく理由句を空にすること"""
    client, http = make_client(
        lambda _r: httpx.Response(503, extensions={"reason_phrase": b""})
    )
    async with http:
        with pytest.raises(ExternalServiceError) as exc_info:
            await client.start_session()
    assert exc_info.value.message == "503 : [no body]"


async def test_connection_error_message_hides_authkey() -> None:
    """通信エラーは、クエリ（authkey）を除いた URL で移植元と同じ書式の例外にすること"""

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Connection refused", request=request)

    client, http = make_client(handler)
    async with http:
        with pytest.raises(ExternalServiceError) as exc_info:
            await client.start_session()
    exc = exc_info.value
    assert exc.message == (
        f'I/O error on GET request for "{API}/startsession": Connection refused'
    )
    assert "key" not in exc.message
    # 原因を追えるよう元の例外は連鎖させる（通信エラーのメッセージは URL を含まない）
    assert isinstance(exc.__cause__, httpx.ConnectError)
    assert "key" not in str(exc.__cause__)


async def test_connection_error_without_message() -> None:
    """通信エラーのメッセージが空のときは、例外の型名を出すこと"""

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadError("", request=request)

    client, http = make_client(handler)
    async with http:
        with pytest.raises(ExternalServiceError) as exc_info:
            await client.execute("s1", "svc")
    assert exc_info.value.message == (
        f'I/O error on GET request for "{API}/execute/svc": ReadError'
    )
