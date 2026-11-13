"""サイズ上限・想定外のエラー・定期掃除など、サーバー全体の挙動（#253）。"""

import asyncio
from collections.abc import AsyncIterator, Callable
from typing import Any

import httpx
import pytest
from fastapi import FastAPI, Request

import app.main
from app.core.config import Settings
from app.core.errors import register_exception_handlers
from app.core.middleware import MultipartSizeLimitMiddleware
from app.services import file_service
from app.services.stream import cleanup
from tests.conftest import AUTH_HEADERS

ORIGIN = "http://browser.test"
FILES_URL = "/api/admin/indexes/idx-1/files"
TENANT = {"X-Tenant-ID": "tenant-1"}
SMALL_LIMIT_BYTES = 1000
# multipart の境界・ヘッダーを足しても上限に収まるファイルの大きさ
WITHIN_LIMIT_FILE_BYTES = 10
CHUNK_BYTES = 100


def make_limited_app() -> FastAPI:
    """サイズ上限を小さくしたミドルウェアだけを付けたアプリを作る。

    本物のアプリの上限（数十 MB）だと送る量が大きすぎるため、上限を小さくして
    multipart を受け取るだけのエンドポイントで上限の挙動を確かめる。

    Returns
    -------
    FastAPI
        /upload を持ち、上限 SMALL_LIMIT_BYTES のミドルウェアを付けたアプリ。
    """
    limited = FastAPI()
    register_exception_handlers(limited)

    @limited.post("/upload")
    async def upload(request: Request) -> dict[str, int]:
        """multipart を読み切り、受け取ったフィールド数を返す。

        Parameters
        ----------
        request : Request
            multipart のリクエスト。

        Returns
        -------
        dict[str, int]
            フィールド数を入れた応答。
        """
        form = await request.form()
        return {"fields": len(form)}

    limited.add_middleware(MultipartSizeLimitMiddleware, max_bytes=SMALL_LIMIT_BYTES)
    return limited


def multipart_body(size: int) -> tuple[bytes, str]:
    """指定バイト数のファイルを 1 つだけ入れた multipart の本文を手で組み立てる。

    Content-Length の有無や分割送信を制御するため、httpx に任せず本文を直接作る。

    Parameters
    ----------
    size : int
        ファイル部分のバイト数。

    Returns
    -------
    tuple[bytes, str]
        multipart の本文と、境界文字列を含む Content-Type。
    """
    boundary = "test-boundary"
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="file"; filename="a.txt"\r\n'
        "Content-Type: text/plain\r\n\r\n"
        f"{'x' * size}\r\n"
        f"--{boundary}--\r\n"
    ).encode()
    return body, f"multipart/form-data; boundary={boundary}"


async def post_limited(content: Any, headers: dict[str, str]) -> httpx.Response:
    """上限を小さくしたアプリの /upload に本文を POST する。

    Parameters
    ----------
    content : Any
        送る本文。bytes なら Content-Length 付き、非同期イテレーターなら分割送信になる。
    headers : dict[str, str]
        リクエストヘッダー。

    Returns
    -------
    httpx.Response
        アプリの応答。
    """
    transport = httpx.ASGITransport(app=make_limited_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        return await c.post("/upload", content=content, headers=headers)


class TestMultipartSizeLimit:
    """multipart のサイズ上限ミドルウェアのテスト。"""

    async def test_content_length_over_limit_returns_413(self) -> None:
        """Content-Length が上限を超える multipart は、受信前に 413 にすること"""
        body, content_type = multipart_body(SMALL_LIMIT_BYTES)
        res = await post_limited(body, {"content-type": content_type})
        assert res.status_code == 413
        assert res.json()["status"] == 413
        assert res.json()["error"] == "Payload Too Large"
        assert res.json()["path"] == "/upload"

    async def test_streamed_body_over_limit_returns_413(self) -> None:
        """Content-Length のない multipart も、受信中に上限を超えた時点で 413 にすること"""
        body, content_type = multipart_body(SMALL_LIMIT_BYTES)

        async def chunks() -> AsyncIterator[bytes]:
            """本文を CHUNK_BYTES ずつ区切って送り、Content-Length の無い送信にする。

            Yields
            ------
            bytes
                本文の一部。
            """
            for start in range(0, len(body), CHUNK_BYTES):
                yield body[start : start + CHUNK_BYTES]

        res = await post_limited(chunks(), {"content-type": content_type})
        assert res.status_code == 413
        assert res.json()["error"] == "Payload Too Large"

    async def test_within_limit_passes(self) -> None:
        """上限以内の multipart はそのまま処理すること"""
        body, content_type = multipart_body(WITHIN_LIMIT_FILE_BYTES)
        res = await post_limited(body, {"content-type": content_type})
        assert res.status_code == 200
        assert res.json() == {"fields": 1}

    async def test_non_multipart_is_not_limited(self) -> None:
        """multipart 以外（JSON など）には上限をかけないこと（移植元の multipart 設定と同じ）"""
        transport = httpx.ASGITransport(app=make_limited_app())
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            res = await c.post(
                "/upload",
                content=b"x" * (SMALL_LIMIT_BYTES * 2),
                headers={"content-type": "application/json"},
            )
        assert res.status_code == 200

    async def test_app_returns_413_with_cors_headers(
        self,
        monkeypatch: pytest.MonkeyPatch,
        settings: Settings,
        app_factory: Callable[[Settings], Any],
    ) -> None:
        """アプリに組み込んだ上限超過の 413 にも CORS ヘッダーを付けること"""
        monkeypatch.setattr(app.main, "MAX_REQUEST_SIZE_BYTES", SMALL_LIMIT_BYTES)
        application = app_factory(settings)
        transport = httpx.ASGITransport(app=application, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://test", headers=AUTH_HEADERS
        ) as c:
            res = await c.post(
                FILES_URL,
                headers={**TENANT, "Origin": ORIGIN},
                data={"name": "a.txt", "userId": "u"},
                files={"file": ("a.txt", b"x" * SMALL_LIMIT_BYTES, "text/plain")},
            )
        assert res.status_code == 413
        assert res.headers["access-control-allow-origin"] == ORIGIN


class TestUnhandledError:
    """想定外の例外を 500 応答にする処理のテスト。"""

    async def test_unexpected_error_returns_500_with_cors_headers(
        self, client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """想定外の例外の 500 にも、移植元と同じく CORS ヘッダーを付けること"""

        async def broken(*_args: Any, **_kwargs: Any) -> None:
            """ファイル検索の代わりに、想定外の例外を投げる。

            Parameters
            ----------
            *_args : Any
                使わない位置引数。
            **_kwargs : Any
                使わないキーワード引数。

            Raises
            ------
            RuntimeError
                常に投げる。ハンドラーが詳細を隠して 500 にするか確かめるため。
            """
            raise RuntimeError("想定外のエラー")

        monkeypatch.setattr(file_service, "search_files", broken)
        res = await client.get(
            FILES_URL,
            params={"page": 0, "size": 10},
            headers={**TENANT, "Origin": ORIGIN},
        )
        assert res.status_code == 500
        assert res.headers["access-control-allow-origin"] == ORIGIN
        body = res.json()
        assert body["status"] == 500
        assert body["error"] == "Internal Server Error"
        assert body["path"] == FILES_URL
        assert "想定外のエラー" not in res.text


class TestCleanupLoop:
    """ストリーム出力の定期掃除ループのテスト。"""

    async def test_cleanup_loop_continues_after_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """掃除で想定外の例外が起きても、ループを止めずに次の回も実行すること"""
        calls: list[str] = []
        second_call = asyncio.Event()

        def flaky_cleanup(output_dir: str, _max_age_hours: int) -> int:
            """1 回目だけ失敗し、2 回目以降は呼ばれたことをイベントで知らせる。

            Parameters
            ----------
            output_dir : str
                掃除対象のディレクトリ。
            _max_age_hours : int
                使わない保持時間。

            Returns
            -------
            int
                削除件数（常に 0）。

            Raises
            ------
            RuntimeError
                1 回目の呼び出しで投げる。ループが止まらないか確かめるため。
            """
            calls.append(output_dir)
            if len(calls) == 1:
                raise RuntimeError("想定外のエラー")
            second_call.set()
            return 0

        monkeypatch.setattr(cleanup, "cleanup_orphan_stream_files", flaky_cleanup)
        monkeypatch.setattr(cleanup, "CLEANUP_INTERVAL_SECONDS", 0)
        task = asyncio.create_task(cleanup.run_cleanup_loop("out", 24))
        try:
            await asyncio.wait_for(second_call.wait(), timeout=5)
        finally:
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
        assert len(calls) >= 2
