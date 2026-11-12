from collections.abc import AsyncIterator, Callable
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
    calls: list[tuple[str, tuple[Any, ...]]] = field(default_factory=list)
    uploads: list[UploadRecord] = field(default_factory=list)

    def _record(self, name: str, *args: Any) -> None:
        self.calls.append((name, args))
        if name in self.fail_on:
            raise ExternalServiceError(f"{name} failed")

    def call_names(self) -> list[str]:
        return [name for name, _ in self.calls]

    async def start_session(self) -> str:
        self._record("start_session")
        return self.session_id

    async def end_session(self, session_id: str) -> str:
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
        self.uploads.append(
            UploadRecord(filename, content, slot, session_id, content_type)
        )
        self._record("upload_file", slot)
        return "OK"

    async def execute(self, session_id: str, service_id: str) -> None:
        self._record("execute", session_id, service_id)

    async def execute_with_stream_file(
        self, session_id: str, service_id: str, stream_file_path: str
    ) -> None:
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
        self._record(
            "execute_learning", session_id, service_id, split_length, reference
        )

    async def execute_sync(
        self, session_id: str, service_id: str, start: int, end: int
    ) -> None:
        self._record("execute_sync", session_id, service_id, start, end)

    async def poll_result_once(self, session_id: str) -> ResultStatus:
        self._record("poll_result_once", session_id)
        if len(self.result_statuses) > 1:
            return self.result_statuses.pop(0)
        return self.result_statuses[0]

    async def get_results(self, session_id: str) -> None:
        self._record("get_results", session_id)

    async def download_file(self, session_id: str, slot: str) -> str | None:
        self._record("download_file", session_id, slot)
        return self.download_content


@dataclass
class FakeNawApiClient:
    library_id: str = "library-1"
    fail_create: bool = False
    calls: list[tuple[str, tuple[Any, ...]]] = field(default_factory=list)

    async def create_library_stub(
        self, message_id: str | None, access_token: str | None, tenant_id: str | None
    ) -> str:
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
        self.calls.append(
            ("update_library_title", (library_id, title, access_token, tenant_id))
        )


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return make_settings(tmp_path)


@pytest.fixture
async def session_factory(
    settings: Settings,
) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = create_engine(settings.database_url)
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield create_session_factory(engine)
    await engine.dispose()


@pytest.fixture
def fake_waha() -> FakeWahaClient:
    return FakeWahaClient()


@pytest.fixture
def fake_naw() -> FakeNawApiClient:
    return FakeNawApiClient()


@pytest.fixture
def app_factory(
    session_factory: async_sessionmaker[AsyncSession],
    fake_waha: FakeWahaClient,
    fake_naw: FakeNawApiClient,
) -> Callable[[Settings], Any]:
    def _factory(app_settings: Settings) -> Any:
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
    app = app_factory(settings)
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://test", headers=AUTH_HEADERS
        ) as http_client:
            yield http_client
