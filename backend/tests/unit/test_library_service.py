from collections.abc import Iterator
from dataclasses import dataclass
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models.library import Library
from app.services.library_service import LibraryService

_MODULE = "app.services.library_service"
_TENANT_ID = "tenant-1"


@dataclass
class _Mocks:
    find_library: AsyncMock
    find_message: AsyncMock
    find_room: AsyncMock
    can_view_room: AsyncMock
    is_visible: AsyncMock


def _library(content: str | None) -> Library:
    return Library(
        id=uuid4(),
        tenant_id=_TENANT_ID,
        message_id="message-1",
        user_id=uuid4(),
        title="タイトル",
        content=content,
    )


def _user() -> SimpleNamespace:
    return SimpleNamespace(id=uuid4())


@pytest.fixture
def mocks() -> Iterator[_Mocks]:
    with (
        patch(
            f"{_MODULE}.LibraryRepository.find_by_id_and_tenant_id",
            new_callable=AsyncMock,
        ) as find_library,
        patch(
            f"{_MODULE}.MessageRepository.find_by_tenant_id_and_id",
            new_callable=AsyncMock,
        ) as find_message,
        patch(
            f"{_MODULE}.RoomRepository.find_by_id_and_tenant_id",
            new_callable=AsyncMock,
        ) as find_room,
        patch(f"{_MODULE}.can_view_room", new_callable=AsyncMock) as can_view_room,
        patch(
            f"{_MODULE}.LibraryRepository.is_visible_to_user",
            new_callable=AsyncMock,
        ) as is_visible,
    ):
        find_message.return_value = SimpleNamespace(room_id="room-1")
        find_room.return_value = SimpleNamespace(id="room-1")
        yield _Mocks(find_library, find_message, find_room, can_view_room, is_visible)


@pytest.mark.asyncio
class TestGetLibraryContent:
    """LibraryService.get_library_content のテスト"""

    async def test_returns_content_when_room_viewable(self, mocks):
        """ルームを閲覧できれば本文を返し、ライブラリの可視判定は行わないこと"""
        library = _library("# 本文")
        mocks.find_library.return_value = library
        mocks.can_view_room.return_value = True

        result = await LibraryService.get_library_content(
            _TENANT_ID, _user(), str(library.id), session=None
        )

        assert result.data == "# 本文"
        mocks.is_visible.assert_not_called()

    async def test_returns_content_when_library_visible(self, mocks):
        """ルームを閲覧できなくてもライブラリが可視なら本文を返すこと"""
        library = _library("# 本文")
        mocks.find_library.return_value = library
        mocks.can_view_room.return_value = False
        mocks.is_visible.return_value = True

        result = await LibraryService.get_library_content(
            _TENANT_ID, _user(), str(library.id), session=None
        )

        assert result.data == "# 本文"

    async def test_raises_404_when_not_readable(self, mocks):
        """ルームもライブラリも見えない場合はLibrary not foundの404になること"""
        library = _library("# 本文")
        mocks.find_library.return_value = library
        mocks.can_view_room.return_value = False
        mocks.is_visible.return_value = False

        with pytest.raises(HTTPException) as exc_info:
            await LibraryService.get_library_content(
                _TENANT_ID, _user(), str(library.id), session=None
            )

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Library not found"

    async def test_raises_404_when_content_is_none(self, mocks):
        """本文が無い場合はLibrary content not foundの404になること"""
        library = _library(None)
        mocks.find_library.return_value = library
        mocks.can_view_room.return_value = True

        with pytest.raises(HTTPException) as exc_info:
            await LibraryService.get_library_content(
                _TENANT_ID, _user(), str(library.id), session=None
            )

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Library content not found"

    async def test_returns_empty_string_content(self, mocks):
        """本文が空文字の場合は空文字を返すこと"""
        library = _library("")
        mocks.find_library.return_value = library
        mocks.can_view_room.return_value = True

        result = await LibraryService.get_library_content(
            _TENANT_ID, _user(), str(library.id), session=None
        )

        assert result.data == ""

    async def test_raises_404_when_library_id_is_not_uuid(self, mocks):
        """UUID形式でないIDは検索せずにLibrary not foundの404になること"""
        with pytest.raises(HTTPException) as exc_info:
            await LibraryService.get_library_content(
                _TENANT_ID, _user(), "not-a-uuid", session=None
            )

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Library not found"
        mocks.find_library.assert_not_called()
