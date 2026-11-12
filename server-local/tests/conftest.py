from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import SQLModel

import app.models  # noqa: F401 — テーブル定義をメタデータに登録する
from app.clients.waha_client import ResultStatus
from app.core.config import Settings
from app.core.database import create_engine, create_session_factory
from app.core.errors import ExternalServiceError
from app.main import create_app

AUTH_KEY = "test-key"
AUTH_HEADERS = {"X-SERVER-AUTH-KEY": AUTH_KEY}


def make_settings(tmp_path: Path, **overrides: Any) -> Settings:
    """テスト用の設定を、.env を読まずに組み立てる。

    DB とストリーム出力先を tmp_path 配下に置いてテストごとに分離し、ポーリング間隔や
    リトライ待ちを短くしてテストを速く終わらせる。外部サービスの URL は実在しない
    テスト用ホストにしておく。

    Parameters
    ----------
    tmp_path : Path
        pytest が用意するテストごとの一時ディレクトリ。
    **overrides : Any
        既定値を上書きする設定（環境変数名をキーにする）。

    Returns
    -------
    Settings
        テスト用の値を入れた設定。
    """
    values: dict[str, Any] = {
        "SECURITY_SERVER_AUTH_KEY": AUTH_KEY,
        "DATABASE_URL": f"sqlite+aiosqlite:///{tmp_path / 'test.sqlite3'}",
        "STREAM_OUTPUT_DIR": str(tmp_path / "stream-output"),
        "STREAM_TAIL_POLL_INTERVAL_MS": 10,
        "STREAM_RESULT_POLL_INTERVAL_MS": 30,
        "STREAM_EMITTER_TIMEOUT_MS": 5000,
        "WAHA_RESULT_RETRY_INTERVAL_MS": 0,
        "WAHA_URL": "http://waha.test/",
        "WAHA_AUTHKEY": "waha-key",
        "NAW_BASE_URL": "http://naw.test",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


@dataclass
class UploadRecord:
    """FakeWahaClient.upload_file に渡された内容を、テストで検証できるよう保持する。"""

    filename: str
    content: bytes
    slot: str
    session_id: str
    content_type: str | None


@dataclass
class FakeWahaClient:
    """WahaClient の偽物。呼び出しを記録し、応答を差し替えられる。"""

    session_id: str = "session-1"
    result_statuses: list[ResultStatus] = field(
        default_factory=lambda: [ResultStatus.SUCCESS]
    )
    download_content: str | None = '{"answer":"回答です"}'
    fail_on: set[str] = field(default_factory=set)
    on_execute_with_stream_file: Callable[[str], None] | None = None
    # Waha! のジョブ完了を待っている間に割り込ませる処理（#251 のロック確認用）
    on_get_results: Callable[[], Awaitable[None]] | None = None
    calls: list[tuple[str, tuple[Any, ...]]] = field(default_factory=list)
    uploads: list[UploadRecord] = field(default_factory=list)

    def _record(self, name: str, *args: Any) -> None:
        """呼び出しを記録し、fail_on に含まれる操作なら失敗させる。

        Parameters
        ----------
        name : str
            呼ばれた操作名（WahaClient のメソッド名）。
        *args : Any
            操作に渡された引数。

        Raises
        ------
        ExternalServiceError
            name が fail_on に含まれる場合。Waha! 側の失敗を再現するため。
        """
        self.calls.append((name, args))
        if name in self.fail_on:
            raise ExternalServiceError(f"{name} failed")

    def call_names(self) -> list[str]:
        """呼ばれた操作名を呼び出し順に返す。

        Returns
        -------
        list[str]
            操作名のリスト。引数を除いて呼び出し順だけを検証したいときに使う。
        """
        return [name for name, _ in self.calls]

    async def start_session(self) -> str:
        """セッション開始を記録し、固定のセッションIDを返す。

        Returns
        -------
        str
            session_id に設定したセッションID。
        """
        self._record("start_session")
        return self.session_id

    async def end_session(self, session_id: str) -> str:
        """セッション終了を記録する。

        Parameters
        ----------
        session_id : str
            終了するセッションID。

        Returns
        -------
        str
            Waha! の成功応答に合わせた "OK"。
        """
        self._record("end_session", session_id)
        return "OK"

    async def upload_file(
        self,
        *,
        filename: str,
        content: bytes,
        slot: str,
        session_id: str,
        content_type: str | None = None,
    ) -> str:
        """アップロード内容を uploads に残し、呼び出しをスロット名付きで記録する。

        Parameters
        ----------
        filename : str
            アップロードするファイル名。
        content : bytes
            ファイルの中身。
        slot : str
            アップロード先のスロット名。
        session_id : str
            セッションID。
        content_type : str | None
            ファイルの Content-Type。

        Returns
        -------
        str
            Waha! の成功応答に合わせた "OK"。
        """
        self.uploads.append(
            UploadRecord(filename, content, slot, session_id, content_type)
        )
        self._record("upload_file", slot)
        return "OK"

    async def execute(self, session_id: str, service_id: str) -> None:
        """サービス実行を記録する。

        Parameters
        ----------
        session_id : str
            セッションID。
        service_id : str
            実行するサービスID。
        """
        self._record("execute", session_id, service_id)

    async def execute_with_stream_file(
        self, session_id: str, service_id: str, stream_file_path: str
    ) -> None:
        """ストリーム出力付きのサービス実行を記録し、設定があればフックを呼ぶ。

        フックでストリームファイルへ書き込むことで、Waha! が回答を逐次出力する様子を
        テストから再現できる。

        Parameters
        ----------
        session_id : str
            セッションID。
        service_id : str
            実行するサービスID。
        stream_file_path : str
            Waha! が回答を書き出すストリームファイルのパス。
        """
        self._record(
            "execute_with_stream_file", session_id, service_id, stream_file_path
        )
        if self.on_execute_with_stream_file is not None:
            self.on_execute_with_stream_file(stream_file_path)

    async def execute_learning(
        self,
        session_id: str,
        service_id: str,
        split_length: str | None,
        reference: str | None,
    ) -> None:
        """学習サービスの実行を記録する。

        Parameters
        ----------
        session_id : str
            セッションID。
        service_id : str
            実行するサービスID。
        split_length : str | None
            分割長。
        reference : str | None
            参照情報。
        """
        self._record(
            "execute_learning", session_id, service_id, split_length, reference
        )

    async def execute_sync(
        self, session_id: str, service_id: str, start: int, end: int
    ) -> None:
        """同期サービスの実行を記録する。

        Parameters
        ----------
        session_id : str
            セッションID。
        service_id : str
            実行するサービスID。
        start : int
            同期範囲の開始位置。
        end : int
            同期範囲の終了位置。
        """
        self._record("execute_sync", session_id, service_id, start, end)

    async def poll_result_once(self, session_id: str) -> ResultStatus:
        """result_statuses を先頭から順に返し、最後の 1 件は返し続ける。

        「実行中が何回か続いてから成功する」といった遷移をテストで再現するため。

        Parameters
        ----------
        session_id : str
            セッションID。

        Returns
        -------
        ResultStatus
            今回のポーリング結果。
        """
        self._record("poll_result_once", session_id)
        if len(self.result_statuses) > 1:
            return self.result_statuses.pop(0)
        return self.result_statuses[0]

    async def get_results(self, session_id: str) -> None:
        """結果取得を記録し、設定があれば割り込み処理を待つ。

        Parameters
        ----------
        session_id : str
            セッションID。
        """
        self._record("get_results", session_id)
        if self.on_get_results is not None:
            await self.on_get_results()

    async def download_file(self, session_id: str, slot: str) -> str | None:
        """ダウンロードを記録し、download_content を返す。

        Parameters
        ----------
        session_id : str
            セッションID。
        slot : str
            ダウンロードするスロット名。

        Returns
        -------
        str | None
            download_content に設定した内容。None なら結果ファイルが無い状態を表す。
        """
        self._record("download_file", session_id, slot)
        return self.download_content


@dataclass
class FakeNawApiClient:
    """NawApiClient の偽物。本物の NAW API を呼ばずに呼び出しを記録する。"""

    library_id: str = "library-1"
    fail_create: bool = False
    calls: list[tuple[str, tuple[Any, ...]]] = field(default_factory=list)

    async def create_library_stub(
        self, message_id: str | None, access_token: str | None, tenant_id: str | None
    ) -> str:
        """ライブラリスタブ作成を記録し、固定のライブラリIDを返す。

        Parameters
        ----------
        message_id : str | None
            メッセージID。
        access_token : str | None
            NAW へのアクセストークン。
        tenant_id : str | None
            テナントID。

        Returns
        -------
        str
            library_id に設定したライブラリID。

        Raises
        ------
        RuntimeError
            fail_create が True の場合。NAW 側の作成失敗を再現するため。
        """
        self.calls.append(
            ("create_library_stub", (message_id, access_token, tenant_id))
        )
        if self.fail_create:
            raise RuntimeError("NAW のライブラリスタブ作成に失敗しました")
        return self.library_id

    async def update_library_title(
        self,
        library_id: str,
        title: str,
        access_token: str | None,
        tenant_id: str | None,
    ) -> None:
        """ライブラリのタイトル更新を記録する。

        Parameters
        ----------
        library_id : str
            ライブラリID。
        title : str
            新しいタイトル。
        access_token : str | None
            NAW へのアクセストークン。
        tenant_id : str | None
            テナントID。
        """
        self.calls.append(
            ("update_library_title", (library_id, title, access_token, tenant_id))
        )


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    """テストごとに分離した既定の設定を用意する。

    Parameters
    ----------
    tmp_path : Path
        pytest が用意するテストごとの一時ディレクトリ。

    Returns
    -------
    Settings
        make_settings で組み立てた設定。
    """
    return make_settings(tmp_path)


@pytest.fixture
async def session_factory(
    settings: Settings,
) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    """一時ディレクトリの SQLite にテーブルを作り、セッションファクトリを用意する。

    マイグレーションを流さずメタデータから直接テーブルを作り、テストを速く独立に
    動かす。終了時にエンジンを破棄して接続を残さない。

    Parameters
    ----------
    settings : Settings
        DB の接続先を持つ設定。

    Yields
    ------
    async_sessionmaker[AsyncSession]
        テスト用 DB に接続するセッションファクトリ。
    """
    engine = create_engine(settings.database_url)
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield create_session_factory(engine)
    await engine.dispose()


@pytest.fixture
def fake_waha() -> FakeWahaClient:
    """本物の Waha! を呼ばないよう、既定応答の FakeWahaClient を用意する。

    Returns
    -------
    FakeWahaClient
        既定値の偽 Waha! クライアント。
    """
    return FakeWahaClient()


@pytest.fixture
def fake_naw() -> FakeNawApiClient:
    """本物の NAW API を呼ばないよう、既定応答の FakeNawApiClient を用意する。

    Returns
    -------
    FakeNawApiClient
        既定値の偽 NAW API クライアント。
    """
    return FakeNawApiClient()


@pytest.fixture
def app_factory(
    session_factory: async_sessionmaker[AsyncSession],
    fake_waha: FakeWahaClient,
    fake_naw: FakeNawApiClient,
) -> Callable[[Settings], Any]:
    """設定だけ差し替えてアプリを作れる関数を用意する。

    DB と外部クライアントはテスト用のものに固定し、テストごとに設定（認証キーや
    上限値など）だけを変えたアプリを作れるようにする。定期クリーンアップは
    テストの邪魔をしないよう止めておく。

    Parameters
    ----------
    session_factory : async_sessionmaker[AsyncSession]
        テスト用 DB のセッションファクトリ。
    fake_waha : FakeWahaClient
        アプリに差し込む偽 Waha! クライアント。
    fake_naw : FakeNawApiClient
        アプリに差し込む偽 NAW API クライアント。

    Returns
    -------
    Callable[[Settings], Any]
        設定を受け取って FastAPI アプリを返す関数。
    """

    def _factory(app_settings: Settings) -> Any:
        """渡された設定とテスト用の依存でアプリを作る。

        Parameters
        ----------
        app_settings : Settings
            アプリに使う設定。

        Returns
        -------
        Any
            作成した FastAPI アプリ。
        """
        return create_app(
            app_settings,
            session_factory=session_factory,
            waha_client=fake_waha,  # 偽物を差し込むため型は一致しない
            naw_client=fake_naw,
            enable_cleanup=False,
        )

    return _factory


@pytest.fixture
async def client(
    settings: Settings, app_factory: Callable[[Settings], Any]
) -> AsyncIterator[httpx.AsyncClient]:
    """アプリの lifespan を動かした状態で、認証ヘッダー付きの HTTP クライアントを用意する。

    サーバーを起動せず ASGI で直接呼ぶ。raise_app_exceptions=False にして、
    未処理例外もサーバーと同じく 500 応答として検証できるようにする。

    Parameters
    ----------
    settings : Settings
        アプリに使う設定。
    app_factory : Callable[[Settings], Any]
        アプリを作る関数。

    Yields
    ------
    httpx.AsyncClient
        認証キーのヘッダーを既定で付けるクライアント。
    """
    app = app_factory(settings)
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://test", headers=AUTH_HEADERS
        ) as http_client:
            yield http_client
