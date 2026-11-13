from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models.assistant import AssistantType
from app.models.library import Library
from app.models.tenant_endpoint import EndpointType
from app.services.library_service import LibraryService

_MODULE = "app.services.library_service"
_TENANT_ID = "tenant-1"


@dataclass
class _Mocks:
    """テストで使うモック一式。"""

    find_library: AsyncMock
    find_message: AsyncMock
    find_room: AsyncMock
    can_view_room: AsyncMock
    is_visible: AsyncMock
    find_content: AsyncMock
    exists_content: AsyncMock
    find_assistant: AsyncMock
    find_endpoints: AsyncMock


def _library(title: str | None = "タイトル") -> Library:
    """テスト用のライブラリを作る。

    Parameters
    ----------
    title : str | None
        ライブラリのタイトル。Noneならスタブ。

    Returns
    -------
    Library
        テスト用のライブラリ。
    """
    now = datetime.now(UTC)
    return Library(
        id=uuid4(),
        tenant_id=_TENANT_ID,
        message_id="message-1",
        user_id=uuid4(),
        title=title,
        created_at=now,
        updated_at=now,
    )


def _user() -> SimpleNamespace:
    """テスト用のユーザーを作る。

    Returns
    -------
    SimpleNamespace
        `id` だけを持つユーザー。
    """
    return SimpleNamespace(id=uuid4())


def _tenant_endpoint(endpoint_type: EndpointType, api_key: str) -> SimpleNamespace:
    """テスト用のテナントエンドポイントを作る。

    Parameters
    ----------
    endpoint_type : EndpointType
        エンドポイントの種別。
    api_key : str
        APIキー。

    Returns
    -------
    SimpleNamespace
        テナントエンドポイントを模したオブジェクト。
    """
    return SimpleNamespace(
        type=endpoint_type, endpoint=f"https://{endpoint_type.value}", api_key=api_key
    )


@pytest.fixture
def mocks() -> Iterator[_Mocks]:
    """リポジトリ・権限判定をモックに差し替える。"""
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
        patch(
            f"{_MODULE}.LibraryContentRepository.find_by_library_id_and_tenant_id",
            new_callable=AsyncMock,
        ) as find_content,
        patch(
            f"{_MODULE}.LibraryContentRepository.exists_by_library_id_and_tenant_id",
            new_callable=AsyncMock,
        ) as exists_content,
        patch(
            f"{_MODULE}.AssistantRepository.find_by_id_and_tenant_id",
            new_callable=AsyncMock,
        ) as find_assistant,
        patch(
            f"{_MODULE}.AssistantEndpointRepository.find_with_tenant_endpoints_by_assistant_id",
            new_callable=AsyncMock,
        ) as find_endpoints,
    ):
        find_message.return_value = SimpleNamespace(
            room_id="room-1", assistant_id="assistant-1"
        )
        find_room.return_value = SimpleNamespace(id="room-1")
        find_content.return_value = None
        exists_content.return_value = False
        find_assistant.return_value = None
        find_endpoints.return_value = []
        yield _Mocks(
            find_library,
            find_message,
            find_room,
            can_view_room,
            is_visible,
            find_content,
            exists_content,
            find_assistant,
            find_endpoints,
        )


@pytest.mark.asyncio
class TestGetLibraryContent:
    """LibraryService.get_library_content のテスト"""

    async def test_returns_content_when_room_viewable(self, mocks):
        """ルームを閲覧できれば本文テーブルの本文を返し、ライブラリの可視判定は行わないこと"""
        library = _library()
        mocks.find_library.return_value = library
        mocks.can_view_room.return_value = True
        mocks.find_content.return_value = SimpleNamespace(content="# 本文")

        result = await LibraryService.get_library_content(
            _TENANT_ID, _user(), str(library.id), session=None
        )

        assert result.data == "# 本文"
        mocks.find_content.assert_awaited_once_with(library.id, _TENANT_ID, None)
        mocks.is_visible.assert_not_called()

    async def test_returns_content_when_library_visible(self, mocks):
        """ルームを閲覧できなくてもライブラリが可視なら本文を返すこと"""
        library = _library()
        mocks.find_library.return_value = library
        mocks.can_view_room.return_value = False
        mocks.is_visible.return_value = True
        mocks.find_content.return_value = SimpleNamespace(content="# 本文")

        result = await LibraryService.get_library_content(
            _TENANT_ID, _user(), str(library.id), session=None
        )

        assert result.data == "# 本文"

    async def test_raises_404_when_not_readable(self, mocks):
        """ルームもライブラリも見えない場合はLibrary not foundの404になること"""
        library = _library()
        mocks.find_library.return_value = library
        mocks.can_view_room.return_value = False
        mocks.is_visible.return_value = False

        with pytest.raises(HTTPException) as exc_info:
            await LibraryService.get_library_content(
                _TENANT_ID, _user(), str(library.id), session=None
            )

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Library not found"
        mocks.find_content.assert_not_called()

    async def test_raises_404_when_library_not_in_tenant(self, mocks):
        """テナント内にライブラリが無い場合はLibrary not foundの404になること"""
        library_id = uuid4()
        mocks.find_library.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await LibraryService.get_library_content(
                _TENANT_ID, _user(), str(library_id), session=None
            )

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Library not found"
        mocks.find_library.assert_awaited_once_with(library_id, _TENANT_ID, None)

    async def test_falls_back_to_visibility_when_message_missing(self, mocks):
        """紐づくメッセージが無い場合はライブラリの可視判定で閲覧可否を決めること"""
        library = _library()
        mocks.find_library.return_value = library
        mocks.find_message.return_value = None
        mocks.is_visible.return_value = True
        mocks.find_content.return_value = SimpleNamespace(content="# 本文")

        result = await LibraryService.get_library_content(
            _TENANT_ID, _user(), str(library.id), session=None
        )

        assert result.data == "# 本文"
        mocks.find_room.assert_not_called()
        mocks.can_view_room.assert_not_called()

    async def test_falls_back_to_visibility_when_room_missing(self, mocks):
        """紐づくルームが無く、ライブラリも見えない場合は404になること"""
        library = _library()
        mocks.find_library.return_value = library
        mocks.find_room.return_value = None
        mocks.is_visible.return_value = False

        with pytest.raises(HTTPException) as exc_info:
            await LibraryService.get_library_content(
                _TENANT_ID, _user(), str(library.id), session=None
            )

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Library not found"
        mocks.can_view_room.assert_not_called()

    async def test_raises_404_when_content_row_missing(self, mocks):
        """本文テーブルに行が無い場合はLibrary content not foundの404になること"""
        library = _library()
        mocks.find_library.return_value = library
        mocks.can_view_room.return_value = True
        mocks.find_content.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await LibraryService.get_library_content(
                _TENANT_ID, _user(), str(library.id), session=None
            )

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Library content not found"

    async def test_returns_empty_string_content(self, mocks):
        """本文が空文字の場合は空文字を返すこと"""
        library = _library()
        mocks.find_library.return_value = library
        mocks.can_view_room.return_value = True
        mocks.find_content.return_value = SimpleNamespace(content="")

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


@pytest.mark.asyncio
class TestGetLibrary:
    """LibraryService.get_library のテスト"""

    async def test_returns_metadata_assistant_and_content_flag(self, mocks):
        """移植元の項目（メタデータ・アシスタント・本文の有無）を返すこと"""
        library = _library()
        mocks.find_library.return_value = library
        mocks.can_view_room.return_value = True
        mocks.exists_content.return_value = True
        mocks.find_assistant.return_value = SimpleNamespace(
            id="assistant-1", type=AssistantType.SAAS_CHAT, include_history=True
        )
        mocks.find_endpoints.return_value = [
            (
                SimpleNamespace(model="gpt-first"),
                _tenant_endpoint(EndpointType.AZURE_OPENAI_CHAT, "azure-key"),
            ),
            (
                SimpleNamespace(model="gpt-second"),
                _tenant_endpoint(EndpointType.LOCAL_SERVER, "local-key"),
            ),
        ]

        result = await LibraryService.get_library(
            _TENANT_ID, _user(), str(library.id), session=None
        )

        assert result.id == str(library.id)
        assert result.title == "タイトル"
        assert result.messageId == "message-1"
        assert result.userId == str(library.user_id)
        assert result.hasNawContent is True
        assert result.assistant is not None
        assert result.assistant.id == "assistant-1"
        assert result.assistant.type == "SAAS_CHAT"
        assert result.assistant.includeHistory is True
        assert result.assistant.model == "gpt-first"
        # SECURE以外のアシスタントではAPIキーを返さない
        assert [e.apiKey for e in result.assistant.endpoints] == ["", ""]

    async def test_returns_api_key_only_for_secure_local_server(self, mocks):
        """SECUREアシスタントのLOCAL_SERVERエンドポイントだけAPIキーを返すこと"""
        library = _library()
        mocks.find_library.return_value = library
        mocks.can_view_room.return_value = True
        mocks.find_assistant.return_value = SimpleNamespace(
            id="assistant-1", type=AssistantType.SECURE, include_history=False
        )
        mocks.find_endpoints.return_value = [
            (
                SimpleNamespace(model="m1"),
                _tenant_endpoint(EndpointType.AZURE_OPENAI_CHAT, "azure-key"),
            ),
            (
                SimpleNamespace(model="m2"),
                _tenant_endpoint(EndpointType.LOCAL_SERVER, "local-key"),
            ),
        ]

        result = await LibraryService.get_library(
            _TENANT_ID, _user(), str(library.id), session=None
        )

        assert result.assistant is not None
        assert {e.type: e.apiKey for e in result.assistant.endpoints} == {
            "AZURE_OPENAI_CHAT": "",
            "LOCAL_SERVER": "local-key",
        }

    async def test_returns_null_model_when_assistant_has_no_endpoint(self, mocks):
        """エンドポイントが無いアシスタントでは`model`がNoneになること"""
        library = _library()
        mocks.find_library.return_value = library
        mocks.can_view_room.return_value = True
        mocks.find_assistant.return_value = SimpleNamespace(
            id="assistant-1", type=AssistantType.SECURE, include_history=False
        )

        result = await LibraryService.get_library(
            _TENANT_ID, _user(), str(library.id), session=None
        )

        assert result.assistant is not None
        assert result.assistant.model is None
        assert result.assistant.endpoints == []

    async def test_returns_null_assistant_when_message_has_no_assistant(self, mocks):
        """メッセージにアシスタントが無い場合は`assistant`がNoneになること"""
        library = _library(title=None)
        mocks.find_library.return_value = library
        mocks.can_view_room.return_value = True
        mocks.find_message.return_value = SimpleNamespace(
            room_id="room-1", assistant_id=None
        )

        result = await LibraryService.get_library(
            _TENANT_ID, _user(), str(library.id), session=None
        )

        assert result.title is None
        assert result.assistant is None
        assert result.hasNawContent is False
        mocks.find_assistant.assert_not_called()

    async def test_returns_null_assistant_when_assistant_missing(self, mocks):
        """アシスタントが存在しない場合は`assistant`がNoneになること"""
        library = _library()
        mocks.find_library.return_value = library
        mocks.can_view_room.return_value = True
        mocks.find_assistant.return_value = None

        result = await LibraryService.get_library(
            _TENANT_ID, _user(), str(library.id), session=None
        )

        assert result.assistant is None
        mocks.find_endpoints.assert_not_called()

    async def test_raises_404_when_not_readable(self, mocks):
        """閲覧できない場合はLibrary not foundの404になること"""
        library = _library()
        mocks.find_library.return_value = library
        mocks.can_view_room.return_value = False
        mocks.is_visible.return_value = False

        with pytest.raises(HTTPException) as exc_info:
            await LibraryService.get_library(
                _TENANT_ID, _user(), str(library.id), session=None
            )

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Library not found"


@pytest.mark.asyncio
class TestCreateLibraryStub:
    """LibraryService.create_library_stub のテスト"""

    @patch(f"{_MODULE}.LibraryRepository.save", new_callable=AsyncMock)
    @patch(f"{_MODULE}.require_owned_room", new_callable=AsyncMock)
    @patch(
        f"{_MODULE}.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_saves_library_without_title(
        self, mock_find_message, mock_require_owned_room, mock_save
    ):
        """所有者確認のうえ、タイトルなしのライブラリを保存してIDを返すこと"""
        user = _user()
        mock_find_message.return_value = SimpleNamespace(room_id="room-1")
        saved = _library(title=None)
        mock_save.return_value = saved

        result = await LibraryService.create_library_stub(
            _TENANT_ID, user, "message-1", session=None
        )

        assert result.id == str(saved.id)
        mock_require_owned_room.assert_awaited_once_with(
            _TENANT_ID, user, "room-1", None
        )
        created = mock_save.await_args.args[0]
        assert created.title is None
        assert created.tenant_id == _TENANT_ID
        assert created.message_id == "message-1"
        assert created.user_id == user.id

    @patch(f"{_MODULE}.LibraryRepository.save", new_callable=AsyncMock)
    @patch(
        f"{_MODULE}.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_raises_404_when_message_missing(self, mock_find_message, mock_save):
        """メッセージが無い場合はMessage not foundの404になり保存しないこと"""
        mock_find_message.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await LibraryService.create_library_stub(
                _TENANT_ID, _user(), "message-1", session=None
            )

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Message not found"
        mock_save.assert_not_called()

    @patch(f"{_MODULE}.LibraryRepository.save", new_callable=AsyncMock)
    @patch(f"{_MODULE}.require_owned_room", new_callable=AsyncMock)
    @patch(
        f"{_MODULE}.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_does_not_save_when_not_room_owner(
        self, mock_find_message, mock_require_owned_room, mock_save
    ):
        """ルームの所有者でない場合は例外を伝え、保存しないこと"""
        mock_find_message.return_value = SimpleNamespace(room_id="room-1")
        mock_require_owned_room.side_effect = HTTPException(status_code=403)

        with pytest.raises(HTTPException) as exc_info:
            await LibraryService.create_library_stub(
                _TENANT_ID, _user(), "message-1", session=None
            )

        assert exc_info.value.status_code == 403
        mock_save.assert_not_called()


@pytest.mark.asyncio
class TestUpdateLibraryTitle:
    """LibraryService.update_library_title のテスト"""

    @patch(f"{_MODULE}.LibraryRepository.save", new_callable=AsyncMock)
    @patch(f"{_MODULE}.require_owned_room", new_callable=AsyncMock)
    async def test_updates_title(self, mock_require_owned_room, mock_save, mocks):
        """所有者確認のうえ、タイトルだけを更新してIDを返すこと"""
        library = _library(title=None)
        mocks.find_library.return_value = library
        mock_save.side_effect = lambda lib, session: lib

        result = await LibraryService.update_library_title(
            _TENANT_ID, _user(), str(library.id), "新タイトル", session=None
        )

        assert result.id == str(library.id)
        assert library.title == "新タイトル"
        mock_require_owned_room.assert_awaited_once()

    async def test_raises_404_when_library_missing(self, mocks):
        """ライブラリが無い場合はLibrary not foundの404になること"""
        mocks.find_library.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await LibraryService.update_library_title(
                _TENANT_ID, _user(), str(uuid4()), "新タイトル", session=None
            )

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Library not found"

    async def test_raises_404_when_message_missing(self, mocks):
        """紐づくメッセージが無い場合はLibrary not foundの404になること"""
        library = _library()
        mocks.find_library.return_value = library
        mocks.find_message.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await LibraryService.update_library_title(
                _TENANT_ID, _user(), str(library.id), "新タイトル", session=None
            )

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Library not found"
