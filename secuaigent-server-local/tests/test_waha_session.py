import pytest

from app.core.errors import ExternalServiceError
from app.services.waha_session import waha_session
from tests.conftest import FakeWahaClient


async def test_session_ends_after_success(fake_waha: FakeWahaClient) -> None:
    """処理が成功したら、セッションを終了すること"""
    async with waha_session(fake_waha, "テスト") as session:  # type: ignore[arg-type]
        assert session.id == "session-1"

    assert fake_waha.call_names() == ["start_session", "end_session"]


async def test_end_session_failure_after_success_is_raised(
    fake_waha: FakeWahaClient,
) -> None:
    """処理が成功したあとの終了の失敗は、そのまま投げること"""
    fake_waha.fail_on = {"end_session"}

    with pytest.raises(ExternalServiceError, match="end_session failed"):
        async with waha_session(fake_waha, "テスト"):  # type: ignore[arg-type]
            pass


async def test_end_session_failure_keeps_original_error(
    fake_waha: FakeWahaClient,
) -> None:
    """処理が失敗しているときの終了の失敗は、元のエラーを上書きしないこと"""
    fake_waha.fail_on = {"end_session"}

    with pytest.raises(ValueError, match="元のエラー"):
        async with waha_session(fake_waha, "テスト"):  # type: ignore[arg-type]
            raise ValueError("元のエラー")

    assert fake_waha.call_names()[-1] == "end_session"
