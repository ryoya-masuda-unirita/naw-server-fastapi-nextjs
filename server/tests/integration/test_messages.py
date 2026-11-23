import base64
import inspect
import json
from collections.abc import AsyncIterator, Iterator
from contextlib import contextmanager
from decimal import Decimal
from typing import Any
from unittest.mock import patch
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import sessionmaker

from app.core.llm_client import AzureLlmChatClient, ChatMessage, ChatStreamChunk
from app.core.security import create_access_token
from app.main import app
from app.models.ai_model import AIModel, AIModelEndpointType
from app.models.assistant import Assistant, AssistantEndpoint, AssistantType
from app.models.group import Group, GroupUser
from app.models.message import (
    Message,
    MessageContent,
    MessageContentStatus,
    MessageFeedback,
    MessageFile,
    MessageRating,
)
from app.models.room import Room
from app.models.share import Share, ShareRoom
from app.models.tenant import Tenant
from app.models.tenant_endpoint import EndpointType, TenantEndpoint
from app.models.token_usage import TokenUsage
from app.models.user import User, UserRole
from app.repositories.assistant_endpoint_repository import AssistantEndpointRepository


def _tenant(tenant_id: str) -> Tenant:
    """テスト用のテナントを作る

    Parameters
    ----------
    tenant_id : str
        テナントID（名前にも同じ値を使う）

    Returns
    -------
    Tenant
        パスワードポリシーを設定した未保存のテナント
    """
    return Tenant(
        id=tenant_id,
        name=tenant_id,
        owner="admin",
        pw_policy_min_length=8,
        pw_policy_use_uppercase=True,
        pw_policy_use_lowercase=True,
        pw_policy_use_digits=True,
        pw_policy_use_symbols=True,
        pw_policy_valid_symbols="!@#$",
        pw_validity_period_days=90,
        pw_histories_limit=3,
    )


@pytest.fixture
async def messages_tenant(session: AsyncSession) -> Tenant:
    """テスト用テナント"""
    tenant = _tenant("tenant-messages-test")
    session.add(tenant)
    await session.commit()
    await session.refresh(tenant)
    return tenant


@pytest.fixture
async def other_tenant(session: AsyncSession) -> Tenant:
    """別テナント（テナント分離の確認用）"""
    tenant = _tenant("tenant-messages-other")
    session.add(tenant)
    await session.commit()
    await session.refresh(tenant)
    return tenant


@pytest.fixture
async def message_owner_user(session: AsyncSession, messages_tenant: Tenant) -> User:
    """メッセージを所有するユーザー"""
    user = User(
        id=uuid4(),
        tenant_id=messages_tenant.id,
        login_id="message-owner",
        name="Message Owner",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def other_user_same_tenant(
    session: AsyncSession, messages_tenant: Tenant
) -> User:
    """同じテナントの別ユーザー"""
    user = User(
        id=uuid4(),
        tenant_id=messages_tenant.id,
        login_id="message-other",
        name="Other User",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def message_assistant(
    session: AsyncSession, messages_tenant: Tenant
) -> Assistant:
    """メッセージ送信先のアシスタント"""
    assistant = Assistant(
        tenant_id=messages_tenant.id,
        type=AssistantType.SAAS_CHAT,
        name="Message Assistant",
        include_history=False,
    )
    session.add(assistant)
    await session.commit()
    await session.refresh(assistant)
    return assistant


@pytest.fixture
async def message_chat_endpoint(
    session: AsyncSession, messages_tenant: Tenant, message_assistant: Assistant
) -> TenantEndpoint:
    """メッセージ送信(SSE)テスト用のAzure OpenAI Chatエンドポイント・AIモデル一式"""
    tenant_endpoint = TenantEndpoint(
        tenant_id=messages_tenant.id,
        type=EndpointType.AZURE_OPENAI_CHAT,
        endpoint_name="azure",
        endpoint="https://example.openai.azure.com",
        api_key="api-key",
    )
    session.add(tenant_endpoint)
    await session.commit()
    await session.refresh(tenant_endpoint)

    session.add(
        AssistantEndpoint(
            assistant_id=message_assistant.id,
            endpoint_id=tenant_endpoint.id,
            tenant_id=messages_tenant.id,
            model="gpt-4o",
        )
    )
    session.add(
        AIModel(
            endpoint_type=AIModelEndpointType.AZURE_OPENAI_CHAT,
            name="gpt-4o",
            max_tokens=4096,
            token_weight=Decimal("1.0"),
        )
    )
    await session.commit()
    return tenant_endpoint


@pytest.fixture
async def owned_room(
    session: AsyncSession,
    messages_tenant: Tenant,
    message_owner_user: User,
    message_assistant: Assistant,
) -> Room:
    """ユーザー自身のルーム"""
    room = Room(
        tenant_id=messages_tenant.id,
        name="Owner Room",
        default_assistant_id=message_assistant.id,
        user_id=message_owner_user.id,
    )
    session.add(room)
    await session.commit()
    await session.refresh(room)
    return room


@pytest.fixture
async def other_users_room(
    session: AsyncSession,
    messages_tenant: Tenant,
    other_user_same_tenant: User,
    message_assistant: Assistant,
) -> Room:
    """別ユーザーのルーム"""
    room = Room(
        tenant_id=messages_tenant.id,
        name="Other User Room",
        default_assistant_id=message_assistant.id,
        user_id=other_user_same_tenant.id,
    )
    session.add(room)
    await session.commit()
    await session.refresh(room)
    return room


@pytest.fixture
async def owned_message(
    session: AsyncSession,
    messages_tenant: Tenant,
    owned_room: Room,
    message_assistant: Assistant,
) -> Message:
    """ユーザー自身のメッセージ"""
    message = Message(
        tenant_id=messages_tenant.id,
        room_id=owned_room.id,
        assistant_id=message_assistant.id,
    )
    session.add(message)
    await session.commit()
    await session.refresh(message)
    return message


@pytest.fixture
async def other_users_message(
    session: AsyncSession,
    messages_tenant: Tenant,
    other_users_room: Room,
    message_assistant: Assistant,
) -> Message:
    """別ユーザーのメッセージ"""
    message = Message(
        tenant_id=messages_tenant.id,
        room_id=other_users_room.id,
        assistant_id=message_assistant.id,
    )
    session.add(message)
    await session.commit()
    await session.refresh(message)
    return message


@pytest.fixture
async def share_target_group(
    session: AsyncSession, messages_tenant: Tenant, other_user_same_tenant: User
) -> Group:
    """other_user_same_tenantが所属する共有先グループ"""
    group = Group(tenant_id=messages_tenant.id, name="Share Target Group")
    session.add(group)
    await session.commit()
    await session.refresh(group)
    session.add(
        GroupUser(
            group_id=group.id,
            tenant_id=messages_tenant.id,
            user_id=other_user_same_tenant.id,
            is_admin=False,
        )
    )
    await session.commit()
    return group


@pytest.fixture
async def shared_room_share(
    session: AsyncSession,
    messages_tenant: Tenant,
    owned_room: Room,
    share_target_group: Group,
) -> Share:
    """owned_roomをshare_target_groupに共有する共有リンク"""
    share = Share(tenant_id=messages_tenant.id, room_id=owned_room.id)
    session.add(share)
    await session.commit()
    await session.refresh(share)
    session.add(
        ShareRoom(
            tenant_id=messages_tenant.id,
            share_id=share.id,
            room_id=owned_room.id,
            group_id=share_target_group.id,
        )
    )
    await session.commit()
    return share


@pytest.fixture
async def owned_message_content(
    session: AsyncSession, messages_tenant: Tenant, owned_message: Message
) -> MessageContent:
    """ユーザー自身のメッセージコンテンツ"""
    content = MessageContent(
        tenant_id=messages_tenant.id,
        message_id=owned_message.id,
        status=MessageContentStatus.OK,
        question="質問です",
        answer="回答です",
        file_paths="path/a.txt, path/b.txt",
    )
    session.add(content)
    await session.commit()
    await session.refresh(content)
    session.add(
        MessageFile(
            tenant_id=messages_tenant.id,
            name="file.txt",
            type="text/plain",
            data=b"hello",
            message_id=content.id,
        )
    )
    await session.commit()
    return content


@pytest.fixture
async def other_users_message_content(
    session: AsyncSession, messages_tenant: Tenant, other_users_message: Message
) -> MessageContent:
    """別ユーザーのメッセージコンテンツ"""
    content = MessageContent(
        tenant_id=messages_tenant.id,
        message_id=other_users_message.id,
        status=MessageContentStatus.OK,
        question="他人の質問です",
        answer="他人の回答です",
    )
    session.add(content)
    await session.commit()
    await session.refresh(content)
    return content


def _headers(login_id: str, tenant_id: str) -> dict[str, str]:
    """認証済みリクエスト用のヘッダーを作る

    Parameters
    ----------
    login_id : str
        アクセストークンの対象ユーザーのログインID
    tenant_id : str
        テナントID（トークンと X-Tenant-ID ヘッダーに使う）

    Returns
    -------
    dict[str, str]
        Authorization と X-Tenant-ID を含むヘッダー
    """
    token = create_access_token(login_id, tenant_id)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_id}


@pytest.fixture
def owner_headers(message_owner_user: User, messages_tenant: Tenant) -> dict[str, str]:
    """メッセージ所有者の認証ヘッダー"""
    return _headers(message_owner_user.login_id, messages_tenant.id)


@pytest.fixture
def other_user_headers(
    other_user_same_tenant: User, messages_tenant: Tenant
) -> dict[str, str]:
    """別ユーザーの認証ヘッダー"""
    return _headers(other_user_same_tenant.login_id, messages_tenant.id)


@pytest.fixture
def client(override_get_session: None) -> AsyncClient:
    """テスト用の非同期 HTTP クライアント"""
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _content_form(
    text_data: dict[str, Any],
    attachment_files: list[tuple[str, bytes, str]] | None = None,
    history_attachment_files: list[tuple[str, bytes, str]] | None = None,
) -> list[tuple[str, tuple[str, str | bytes, str]]]:
    """メッセージ送信APIへ送るmultipartパートを組み立てる。

    移植元クライアント(secuaigent/client)の`buildMessageContentFormData`と同じく、`textData`を
    `application/json`のBlob（ファイル名`blob`）として送る。

    Parameters
    ----------
    text_data : dict[str, Any]
        `textData`パートに入れるリクエスト本体。
    attachment_files : list[tuple[str, bytes, str]] | None
        `attachmentFiles`パート（ファイル名・内容・Content-Type）。
    history_attachment_files : list[tuple[str, bytes, str]] | None
        `historyAttachmentFiles`パート（同上）。

    Returns
    -------
    list[tuple[str, tuple[str, str | bytes, str]]]
        httpxの`files`引数に渡すmultipartパートの一覧。
    """
    parts: list[tuple[str, tuple[str, str | bytes, str]]] = [
        ("textData", ("blob", json.dumps(text_data), "application/json"))
    ]
    for name, data, content_type in attachment_files or []:
        parts.append(("attachmentFiles", (name, data, content_type)))
    for name, data, content_type in history_attachment_files or []:
        parts.append(("historyAttachmentFiles", (name, data, content_type)))
    return parts


@contextmanager
def _patched_llm(
    engine: AsyncEngine,
    answer: str,
    sent_messages: list[list[ChatMessage]] | None = None,
) -> Iterator[None]:
    """LLM呼び出しを固定回答に差し替え、ストリーミング後の永続化先をテスト用DBにする。

    Parameters
    ----------
    engine : AsyncEngine
        テスト用DBエンジン。
    answer : str
        LLMが返す回答テキスト。
    sent_messages : list[list[ChatMessage]] | None
        指定した場合、LLMへ渡された会話履歴を呼び出しごとに追記する。

    Yields
    ------
    Iterator[None]
        差し替えが有効な間の制御を呼び出し元へ渡す。
    """
    # 呼び出し側が会話履歴を位置引数・キーワード引数のどちらで渡しても取り出せるよう、
    # 差し替え前の本物のシグネチャで引数を束縛する。
    stream_chat_signature = inspect.signature(AzureLlmChatClient.stream_chat)

    async def _stream_chunks(
        *args: Any, **kwargs: Any
    ) -> AsyncIterator[ChatStreamChunk]:
        """LLM のストリーミング応答を模したチャンクを返す"""
        if sent_messages is not None:
            bound = stream_chat_signature.bind(*args, **kwargs)
            sent_messages.append(bound.arguments["messages"])
        yield ChatStreamChunk(text_delta=answer)
        yield ChatStreamChunk(input_tokens=10, output_tokens=5)

    # 本番の`get_session_maker`と同じ`async_sessionmaker`を使う（同期版の`sessionmaker`は
    # `AsyncEngine`を受け取る型定義がなく、mypyでエラーになるため）。
    test_session_maker = async_sessionmaker(engine, expire_on_commit=False)
    with (
        patch(
            "app.services.message_service.AzureLlmChatClient.stream_chat",
            side_effect=_stream_chunks,
        ),
        patch(
            "app.services.message_service.get_session_maker",
            return_value=test_session_maker,
        ),
    ):
        yield


def _sse_events(body: str) -> list[dict[str, Any]]:
    """SSE本文を、`type`を持つイベントの一覧へ変換する。

    secuaigent/clientの`parseSseDataLine`/`parseStreamEvent`と同じく`data:`行だけを
    JSONとして読み、種別`type`で判定する。frontendは`error`を処理せず捨てるが、
    サーバーが送る内容を検証するため、ここでは`type`を持つイベントをすべて返す。

    Parameters
    ----------
    body : str
        SSEレスポンスの本文。

    Returns
    -------
    list[dict[str, Any]]
        `type`を持つイベント(JSON)の一覧。
    """
    events: list[dict[str, Any]] = []
    for line in body.splitlines():
        if line.startswith("data:"):
            event = json.loads(line[len("data:") :].strip())
            if "type" in event:
                events.append(event)
    return events


def _last_visible_message_id(
    records: list[dict[str, Any]], contents: list[dict[str, Any]]
) -> str | None:
    """読み直した会話から、移植元クライアント(secuaigent/client)が次の送信の親にするメッセージIDを求める。

    移植元クライアント(secuaigent/client)の`buildVisibleThread`/`getLastActiveRecordId`と同じく、親なしの
    メッセージから各階層の最後の兄弟を辿り、本文があるメッセージのうち最後のものを返す。

    Parameters
    ----------
    records : list[dict[str, Any]]
        メッセージ一覧取得APIの`messages`。
    contents : list[dict[str, Any]]
        メッセージ内容一覧取得APIの結果。

    Returns
    -------
    str | None
        次の送信の親になるメッセージID。本文を持つメッセージがなければNone。
    """
    messages_with_content = {content["messageId"] for content in contents}
    last_visible: str | None = None
    parent_id: str | None = None
    while True:
        siblings = [record for record in records if record["parentId"] == parent_id]
        if not siblings:
            return last_visible
        active = siblings[-1]
        if active["id"] in messages_with_content:
            last_visible = active["id"]
        parent_id = active["id"]


@pytest.mark.asyncio
class TestMessageRouter:
    """メッセージ API のテスト"""

    class TestCreateMessage:
        """メッセージ作成のテスト"""

        async def test_create_message_without_room_id_creates_new_room(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            message_assistant: Assistant,
        ) -> None:
            """roomId未指定でメッセージを作成すると新規ルームも作成されること"""
            async with client as c:
                response = await c.post(
                    "/api/messages",
                    json={
                        "assistantId": message_assistant.id,
                        "messageText": "こんにちは",
                    },
                    headers=owner_headers,
                )

            assert response.status_code == 200
            assert "id" in response.json()

        async def test_create_message_with_existing_room_id(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            owned_room: Room,
            message_assistant: Assistant,
        ) -> None:
            """既存の自分のルームIDを指定してメッセージを作成できること"""
            async with client as c:
                response = await c.post(
                    "/api/messages",
                    json={"roomId": owned_room.id, "assistantId": message_assistant.id},
                    headers=owner_headers,
                )

            assert response.status_code == 200

        async def test_create_message_with_invalid_assistant_id_returns_400(
            self, client: AsyncClient, owner_headers: dict[str, str]
        ) -> None:
            """存在しないアシスタントIDを指定すると400エラーになること"""
            async with client as c:
                response = await c.post(
                    "/api/messages",
                    json={"assistantId": "nonexistent"},
                    headers=owner_headers,
                )

            assert response.status_code == 400

        async def test_create_message_with_other_users_room_returns_403(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            other_users_room: Room,
            message_assistant: Assistant,
        ) -> None:
            """他人が所有するルームIDを指定するとエラーになること"""
            async with client as c:
                response = await c.post(
                    "/api/messages",
                    json={
                        "roomId": other_users_room.id,
                        "assistantId": message_assistant.id,
                    },
                    headers=owner_headers,
                )

            assert response.status_code == 403

        async def test_create_message_with_shared_group_member_returns_403(
            self,
            client: AsyncClient,
            other_user_headers: dict[str, str],
            owned_room: Room,
            shared_room_share: Share,
            message_assistant: Assistant,
        ) -> None:
            """共有先グループのメンバーは書き込み系（メッセージ送信）を行えず
            403になること（書き込み系は引き続き所有者限定のため）"""
            async with client as c:
                response = await c.post(
                    "/api/messages",
                    json={
                        "roomId": owned_room.id,
                        "assistantId": message_assistant.id,
                    },
                    headers=other_user_headers,
                )

            assert response.status_code == 403

        async def test_create_message_with_nonexistent_parent_id_sets_null(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            owned_room: Room,
            message_assistant: Assistant,
        ) -> None:
            """存在しない親メッセージIDを指定するとparentIdがnullになること"""
            async with client as c:
                response = await c.post(
                    "/api/messages",
                    json={
                        "roomId": owned_room.id,
                        "assistantId": message_assistant.id,
                        "parentMessageId": "nonexistent",
                    },
                    headers=owner_headers,
                )
                message_id = response.json()["id"]
                get_response = await c.get(
                    "/api/messages",
                    params={"roomId": owned_room.id},
                    headers=owner_headers,
                )

            created = next(
                m for m in get_response.json()["messages"] if m["id"] == message_id
            )
            assert created["parentId"] is None

        async def test_create_message_persists_tools_and_library_flag(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            owned_room: Room,
            message_assistant: Assistant,
        ) -> None:
            """tools・promptTemplateContent・isCreateLibraryが保存され一覧取得で復元できること"""
            async with client as c:
                response = await c.post(
                    "/api/messages",
                    json={
                        "roomId": owned_room.id,
                        "assistantId": message_assistant.id,
                        "tools": [{"name": "web_search"}],
                        "promptTemplateContent": "テンプレ本文",
                        "isCreateLibrary": True,
                    },
                    headers=owner_headers,
                )
                message_id = response.json()["id"]
                get_response = await c.get(
                    "/api/messages",
                    params={"roomId": owned_room.id},
                    headers=owner_headers,
                )

            created = next(
                m for m in get_response.json()["messages"] if m["id"] == message_id
            )
            assert len(created["tools"]) == 1
            assert created["tools"][0]["name"] == "web_search"
            assert created["promptTemplateContent"] == "テンプレ本文"
            assert created["isCreateLibrary"] is True

    class TestGetMessages:
        """メッセージ一覧取得のテスト"""

        async def test_get_messages_returns_list_and_assistants(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            owned_room: Room,
            owned_message: Message,
            message_assistant: Assistant,
        ) -> None:
            """自分のルームのメッセージ一覧と参照アシスタント一覧が取得できること"""
            async with client as c:
                response = await c.get(
                    "/api/messages",
                    params={"roomId": owned_room.id},
                    headers=owner_headers,
                )

            assert response.status_code == 200
            body = response.json()
            assert [m["id"] for m in body["messages"]] == [owned_message.id]
            assert [a["id"] for a in body["assistants"]] == [message_assistant.id]

        async def test_assistants_include_history_and_model(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            owned_room: Room,
            owned_message: Message,
            message_assistant: Assistant,
            message_chat_endpoint: TenantEndpoint,
        ) -> None:
            """assistants に includeHistory と model（紐づくエンドポイントの model）が入ること（Issue #309）"""
            async with client as c:
                response = await c.get(
                    "/api/messages",
                    params={"roomId": owned_room.id},
                    headers=owner_headers,
                )

            assert response.status_code == 200
            assistant = response.json()["assistants"][0]
            assert assistant["includeHistory"] is False
            assert assistant["model"] == "gpt-4o"
            # 移植元は endpoints[] に model を持たせない（assistant 直下だけ）
            assert all("model" not in e for e in assistant["endpoints"])

        async def test_assistant_model_is_null_without_endpoints(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            owned_room: Room,
            owned_message: Message,
            message_assistant: Assistant,
        ) -> None:
            """エンドポイントが無いアシスタントの model は null になること（キーは出る）"""
            async with client as c:
                response = await c.get(
                    "/api/messages",
                    params={"roomId": owned_room.id},
                    headers=owner_headers,
                )

            assistant = response.json()["assistants"][0]
            assert assistant["model"] is None
            assert assistant["endpoints"] == []

        async def test_get_messages_with_shared_group_member_returns_200(
            self,
            client: AsyncClient,
            other_user_headers: dict[str, str],
            owned_room: Room,
            owned_message: Message,
            shared_room_share: Share,
        ) -> None:
            """共有リンクを持つ共有先グループのメンバーはメッセージ一覧を
            取得できること"""
            async with client as c:
                response = await c.get(
                    "/api/messages",
                    params={"roomId": owned_room.id},
                    headers=other_user_headers,
                )

            assert response.status_code == 200
            body = response.json()
            assert [m["id"] for m in body["messages"]] == [owned_message.id]

        async def test_get_messages_with_other_users_room_returns_403(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            other_users_room: Room,
        ) -> None:
            """他人のルームを指定するとエラーになること"""
            async with client as c:
                response = await c.get(
                    "/api/messages",
                    params={"roomId": other_users_room.id},
                    headers=owner_headers,
                )

            assert response.status_code == 403

        async def test_get_messages_with_nonexistent_room_returns_404(
            self, client: AsyncClient, owner_headers: dict[str, str]
        ) -> None:
            """存在しないルームIDを指定すると404になること"""
            async with client as c:
                response = await c.get(
                    "/api/messages",
                    params={"roomId": "nonexistent"},
                    headers=owner_headers,
                )

            assert response.status_code == 404

    class TestGetMessageContents:
        """メッセージコンテンツ取得のテスト"""

        async def test_get_message_contents_returns_attachment_and_reference_paths(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            owned_message: Message,
            owned_message_content: MessageContent,
        ) -> None:
            """メッセージ内容一覧に添付ファイルと参照パスが含まれること"""
            async with client as c:
                response = await c.post(
                    "/api/messages/contents",
                    json={"messageIds": [owned_message.id]},
                    headers=owner_headers,
                )

            assert response.status_code == 200
            body = response.json()
            assert len(body) == 1
            assert body[0]["referencePaths"] == ["path/a.txt", "path/b.txt"]
            assert [f["name"] for f in body[0]["attachmentFiles"]] == ["file.txt"]

        async def test_get_message_contents_with_shared_group_member_returns_200(
            self,
            client: AsyncClient,
            other_user_headers: dict[str, str],
            owned_message: Message,
            owned_message_content: MessageContent,
            shared_room_share: Share,
        ) -> None:
            """共有リンクを持つ共有先グループのメンバーはメッセージ内容一覧を
            取得できること"""
            async with client as c:
                response = await c.post(
                    "/api/messages/contents",
                    json={"messageIds": [owned_message.id]},
                    headers=other_user_headers,
                )

            assert response.status_code == 200
            body = response.json()
            assert len(body) == 1

        async def test_get_message_contents_with_other_users_message_returns_403(
            self,
            client: AsyncClient,
            session: AsyncSession,
            messages_tenant: Tenant,
            owner_headers: dict[str, str],
            other_users_message: Message,
        ) -> None:
            """他人のルームに属するメッセージIDが混在するとエラーになること"""
            session.add(
                MessageContent(
                    tenant_id=messages_tenant.id,
                    message_id=other_users_message.id,
                    status=MessageContentStatus.OK,
                    question="質問です",
                    answer="回答です",
                )
            )
            await session.commit()

            async with client as c:
                response = await c.post(
                    "/api/messages/contents",
                    json={"messageIds": [other_users_message.id]},
                    headers=owner_headers,
                )

            assert response.status_code == 403

    class TestCreateMessageContent:
        """メッセージコンテンツ作成のテスト"""

        async def test_streams_sse_and_persists_message_content(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            owned_message: Message,
            message_chat_endpoint: TenantEndpoint,
            engine: AsyncEngine,
        ) -> None:
            """正常系: SSEでtext_delta・message_stop・message_contentイベントを配信すること"""

            async def _stream_chunks(
                *args: Any, **kwargs: Any
            ) -> AsyncIterator[ChatStreamChunk]:
                """LLM のストリーミング応答を模したチャンクを返す"""
                yield ChatStreamChunk(text_delta="こんにちは")
                yield ChatStreamChunk(input_tokens=10, output_tokens=5)

            # ストリーミング完了後の永続化はリクエストのDIスコープ(テスト用の`session`
            # フィクスチャ)とは独立した新規セッションで行われるため、`get_session_maker`
            # もテスト用エンジンにつなぎ替える。
            test_session_maker = sessionmaker(  # type: ignore[call-overload]
                engine, class_=AsyncSession, expire_on_commit=False
            )
            with (
                patch(
                    "app.services.message_service.AzureLlmChatClient.stream_chat",
                    side_effect=_stream_chunks,
                ),
                patch(
                    "app.services.message_service.get_session_maker",
                    return_value=test_session_maker,
                ),
            ):
                async with client as c:
                    response = await c.post(
                        "/api/messages/content",
                        files=_content_form(
                            {
                                "messageId": owned_message.id,
                                "userInput": "こんにちは",
                            }
                        ),
                        headers=owner_headers,
                    )
                    contents_response = await c.post(
                        "/api/messages/contents",
                        json={"messageIds": [owned_message.id]},
                        headers=owner_headers,
                    )

            assert response.status_code == 200
            events = _sse_events(response.text)
            assert [event["type"] for event in events] == [
                "text_delta",
                "message_stop",
                "message_content",
            ]
            assert events[-1]["data"]["messageId"] == owned_message.id
            # クライアントと同じmultipart形式の送信で、質問・回答が保存されること(Issue #182)
            assert [
                (content["question"], content["answer"])
                for content in contents_response.json()
            ] == [("こんにちは", "こんにちは")]

        async def test_returns_404_when_message_not_found(
            self, client: AsyncClient, owner_headers: dict[str, str]
        ) -> None:
            """存在しないmessageIdを指定すると404になること"""
            async with client as c:
                response = await c.post(
                    "/api/messages/content",
                    files=_content_form(
                        {"messageId": "nonexistent", "userInput": "こんにちは"}
                    ),
                    headers=owner_headers,
                )

            assert response.status_code == 404

        async def test_returns_403_when_room_not_owned(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            other_users_message: Message,
        ) -> None:
            """他人のルームに属するメッセージIDを指定するとエラーになること"""
            async with client as c:
                response = await c.post(
                    "/api/messages/content",
                    files=_content_form(
                        {
                            "messageId": other_users_message.id,
                            "userInput": "こんにちは",
                        }
                    ),
                    headers=owner_headers,
                )

            assert response.status_code == 403

        async def test_regenerates_existing_content_and_keeps_question(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            owned_message_content: MessageContent,
            message_chat_endpoint: TenantEndpoint,
            engine: AsyncEngine,
        ) -> None:
            """messageContentId指定時、既存の回答が上書きされ質問文は変更されないこと"""

            async def _stream_chunks(
                *args: Any, **kwargs: Any
            ) -> AsyncIterator[ChatStreamChunk]:
                """LLM のストリーミング応答を模したチャンクを返す"""
                yield ChatStreamChunk(text_delta="新しい回答")
                yield ChatStreamChunk(input_tokens=10, output_tokens=5)

            test_session_maker = sessionmaker(  # type: ignore[call-overload]
                engine, class_=AsyncSession, expire_on_commit=False
            )
            with (
                patch(
                    "app.services.message_service.AzureLlmChatClient.stream_chat",
                    side_effect=_stream_chunks,
                ),
                patch(
                    "app.services.message_service.get_session_maker",
                    return_value=test_session_maker,
                ),
            ):
                async with client as c:
                    response = await c.post(
                        "/api/messages/content",
                        files=_content_form(
                            {
                                "messageContentId": owned_message_content.id,
                                "userInput": "もう一度答えて",
                            }
                        ),
                        headers=owner_headers,
                    )

            assert response.status_code == 200
            final_event = _sse_events(response.text)[-1]
            assert final_event["type"] == "message_content"
            assert final_event["data"]["question"] == "質問です"
            assert final_event["data"]["answer"] == "新しい回答"
            assert final_event["data"]["id"] == owned_message_content.id

        async def test_regenerate_returns_404_when_message_content_not_found(
            self, client: AsyncClient, owner_headers: dict[str, str]
        ) -> None:
            """存在しないmessageContentIdを指定すると404になること"""
            async with client as c:
                response = await c.post(
                    "/api/messages/content",
                    files=_content_form(
                        {
                            "messageContentId": "nonexistent",
                            "userInput": "もう一度答えて",
                        }
                    ),
                    headers=owner_headers,
                )

            assert response.status_code == 404

        async def test_regenerate_returns_403_when_room_not_owned(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            other_users_message_content: MessageContent,
        ) -> None:
            """他人のルームに属するmessageContentIdを指定するとエラーになること"""
            async with client as c:
                response = await c.post(
                    "/api/messages/content",
                    files=_content_form(
                        {
                            "messageContentId": other_users_message_content.id,
                            "userInput": "もう一度答えて",
                        }
                    ),
                    headers=owner_headers,
                )

            assert response.status_code == 403

        async def test_returns_400_when_neither_message_id_nor_content_id_given(
            self, client: AsyncClient, owner_headers: dict[str, str]
        ) -> None:
            """messageId・messageContentIdのいずれも指定しないとバリデーションエラーになること"""
            async with client as c:
                response = await c.post(
                    "/api/messages/content",
                    files=_content_form({"userInput": "こんにちは"}),
                    headers=owner_headers,
                )

            assert response.status_code == 400
            assert response.json()["message"] == (
                "messageId または messageContentId のいずれかを指定してください"
            )

        async def test_persists_attachment_files_and_returns_them_in_message_content_event(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            owned_message: Message,
            message_chat_endpoint: TenantEndpoint,
            engine: AsyncEngine,
        ) -> None:
            """attachmentFilesをファイルパートで送信した場合、message_filesに永続化されmessage_contentイベントに反映されること"""

            async def _stream_chunks(
                *args: Any, **kwargs: Any
            ) -> AsyncIterator[ChatStreamChunk]:
                """LLM のストリーミング応答を模したチャンクを返す"""
                yield ChatStreamChunk(text_delta="こんにちは")
                yield ChatStreamChunk(input_tokens=10, output_tokens=5)

            test_session_maker = sessionmaker(  # type: ignore[call-overload]
                engine, class_=AsyncSession, expire_on_commit=False
            )
            with (
                patch(
                    "app.services.message_service.AzureLlmChatClient.stream_chat",
                    side_effect=_stream_chunks,
                ),
                patch(
                    "app.services.message_service.get_session_maker",
                    return_value=test_session_maker,
                ),
            ):
                async with client as c:
                    response = await c.post(
                        "/api/messages/content",
                        files=_content_form(
                            {
                                "messageId": owned_message.id,
                                "userInput": "こんにちは",
                            },
                            attachment_files=[
                                ("photo.png", b"binary-image-data", "image/png")
                            ],
                        ),
                        headers=owner_headers,
                    )
                    contents_response = await c.post(
                        "/api/messages/contents",
                        json={"messageIds": [owned_message.id]},
                        headers=owner_headers,
                    )

            assert response.status_code == 200
            final_event = _sse_events(response.text)[-1]
            assert final_event["type"] == "message_content"
            assert [f["name"] for f in final_event["data"]["attachmentFiles"]] == [
                "photo.png"
            ]

            saved_files = [
                f
                for content in contents_response.json()
                for f in content["attachmentFiles"]
            ]
            assert [(f["name"], f["type"]) for f in saved_files] == [
                ("photo.png", "image/png")
            ]
            assert base64.b64decode(saved_files[0]["data"]) == b"binary-image-data"

        async def test_accepts_text_data_as_plain_form_field(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            owned_message: Message,
            message_chat_endpoint: TenantEndpoint,
            engine: AsyncEngine,
        ) -> None:
            """textDataを通常のフォーム値で送っても受け付け、質問・回答が保存されること"""
            with _patched_llm(engine, "フォーム値の回答"):
                async with client as c:
                    response = await c.post(
                        "/api/messages/content",
                        data={
                            "textData": json.dumps(
                                {"messageId": owned_message.id, "userInput": "質問A"}
                            )
                        },
                        headers=owner_headers,
                    )
                    contents_response = await c.post(
                        "/api/messages/contents",
                        json={"messageIds": [owned_message.id]},
                        headers=owner_headers,
                    )

            assert response.status_code == 200
            assert [
                (content["question"], content["answer"])
                for content in contents_response.json()
            ] == [("質問A", "フォーム値の回答")]

        async def test_returns_400_when_text_data_is_not_json(
            self, client: AsyncClient, owner_headers: dict[str, str]
        ) -> None:
            """textDataがJSONとして解釈できない場合は400になること"""
            async with client as c:
                response = await c.post(
                    "/api/messages/content",
                    files=[("textData", ("blob", "not-json", "application/json"))],
                    headers=owner_headers,
                )

            assert response.status_code == 400

        async def test_returns_400_when_text_data_is_not_object(
            self, client: AsyncClient, owner_headers: dict[str, str]
        ) -> None:
            """textDataがJSONオブジェクトでない場合は400になること"""
            async with client as c:
                response = await c.post(
                    "/api/messages/content",
                    files=[("textData", ("blob", "[]", "application/json"))],
                    headers=owner_headers,
                )

            assert response.status_code == 400
            assert response.json()["message"] == "Input should be an object"

        async def test_returns_400_when_text_data_is_not_utf8(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            owned_message: Message,
        ) -> None:
            """textDataがUTF-8でない場合は文字化けしたまま受け付けず400になること"""
            text_data = json.dumps(
                {"messageId": owned_message.id, "userInput": "こんにちは"},
                ensure_ascii=False,
            ).encode("shift_jis")
            async with client as c:
                response = await c.post(
                    "/api/messages/content",
                    files=[("textData", ("blob", text_data, "application/json"))],
                    headers=owner_headers,
                )

            assert response.status_code == 400

        async def test_returns_401_before_parsing_text_data_when_unauthenticated(
            self, client: AsyncClient, messages_tenant: Tenant
        ) -> None:
            """未認証の場合、textDataの解析より先に認証エラー(401)になること"""
            async with client as c:
                response = await c.post(
                    "/api/messages/content",
                    files=[("textData", ("blob", "not-json", "application/json"))],
                    headers={"X-Tenant-ID": messages_tenant.id},
                )

            assert response.status_code == 401

        async def test_returns_400_when_text_data_is_missing(
            self, client: AsyncClient, owner_headers: dict[str, str]
        ) -> None:
            """textDataパートがない場合は400になること"""
            async with client as c:
                response = await c.post(
                    "/api/messages/content",
                    files=[("attachmentFiles", ("a.png", b"data", "image/png"))],
                    headers=owner_headers,
                )

            assert response.status_code == 400
            assert response.json()["message"] == "Field required"

        async def test_accepts_history_attachment_count_mismatch(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            owned_message: Message,
            message_chat_endpoint: TenantEndpoint,
            engine: AsyncEngine,
        ) -> None:
            """historyAttachmentFilesを送らず履歴のattachmentsCountだけを送っても、移植元と同じく受け付けて質問・回答が保存されること(Issue #245)"""
            with _patched_llm(engine, "回答"):
                async with client as c:
                    response = await c.post(
                        "/api/messages/content",
                        # 移植元クライアントと同じく、attachmentsCountは送るが
                        # historyAttachmentFilesは送らない
                        files=_content_form(
                            {
                                "messageId": owned_message.id,
                                "userInput": "こんにちは",
                                "historyMessages": [
                                    {
                                        "type": "USER",
                                        "content": "過去",
                                        "attachmentsCount": 1,
                                    }
                                ],
                            }
                        ),
                        headers=owner_headers,
                    )
                    contents_response = await c.post(
                        "/api/messages/contents",
                        json={"messageIds": [owned_message.id]},
                        headers=owner_headers,
                    )

            assert response.status_code == 200
            assert _sse_events(response.text)[-1]["type"] == "message_content"
            assert [
                (content["question"], content["answer"])
                for content in contents_response.json()
            ] == [("こんにちは", "回答")]

        async def test_returns_400_when_user_input_is_missing(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            owned_message: Message,
        ) -> None:
            """userInputの項目がない場合は400になること"""
            async with client as c:
                response = await c.post(
                    "/api/messages/content",
                    files=_content_form({"messageId": owned_message.id}),
                    headers=owner_headers,
                )

            assert response.status_code == 400

        async def test_sends_empty_user_input_with_image_and_saves_it(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            owned_message: Message,
            message_chat_endpoint: TenantEndpoint,
            engine: AsyncEngine,
        ) -> None:
            """userInputが空文字でも画像添付と一緒にLLMへ送られ、空文字の質問と回答が保存されること(Issue #245)"""
            sent_messages: list[list[ChatMessage]] = []
            with _patched_llm(engine, "画像の説明", sent_messages=sent_messages):
                async with client as c:
                    response = await c.post(
                        "/api/messages/content",
                        files=_content_form(
                            {"messageId": owned_message.id, "userInput": ""},
                            attachment_files=[
                                ("photo.png", b"image-data", "image/png")
                            ],
                        ),
                        headers=owner_headers,
                    )
                    contents_response = await c.post(
                        "/api/messages/contents",
                        json={"messageIds": [owned_message.id]},
                        headers=owner_headers,
                    )

            assert response.status_code == 200
            assert _sse_events(response.text)[-1]["type"] == "message_content"
            last_turn = sent_messages[0][-1]
            assert last_turn.role == "user"
            encoded_image = base64.b64encode(b"image-data").decode("ascii")
            assert last_turn.content == [
                {"type": "text", "text": ""},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{encoded_image}"},
                },
            ]
            assert [
                (content["question"], content["answer"])
                for content in contents_response.json()
            ] == [("", "画像の説明")]

        async def test_next_message_chains_to_previous_after_reloading_room(
            self,
            client: AsyncClient,
            session: AsyncSession,
            owner_headers: dict[str, str],
            owned_room: Room,
            owned_message: Message,
            owned_message_content: MessageContent,
            message_assistant: Assistant,
            message_chat_endpoint: TenantEndpoint,
            engine: AsyncEngine,
        ) -> None:
            """送信後に会話を読み直しても末尾が直前のメッセージになり、次の送信の親が直前のメッセージになること(Issue #182)"""
            with _patched_llm(engine, "Bへの回答"):
                async with client as c:
                    create_b = await c.post(
                        "/api/messages",
                        json={
                            "roomId": owned_room.id,
                            "assistantId": message_assistant.id,
                            "parentMessageId": owned_message.id,
                            "messageText": "質問B",
                        },
                        headers=owner_headers,
                    )
                    message_b_id = create_b.json()["id"]
                    send_b = await c.post(
                        "/api/messages/content",
                        files=_content_form(
                            {
                                "assistantId": message_assistant.id,
                                "messageId": message_b_id,
                                "userInput": "質問B",
                            }
                        ),
                        headers=owner_headers,
                    )

                    # ページを開き直したときと同じく、サーバーから会話を読み直す
                    list_response = await c.get(
                        "/api/messages",
                        params={"roomId": owned_room.id},
                        headers=owner_headers,
                    )
                    records = list_response.json()["messages"]
                    contents_response = await c.post(
                        "/api/messages/contents",
                        json={"messageIds": [record["id"] for record in records]},
                        headers=owner_headers,
                    )
                    parent_for_next = _last_visible_message_id(
                        records, contents_response.json()
                    )

                    create_c = await c.post(
                        "/api/messages",
                        json={
                            "roomId": owned_room.id,
                            "assistantId": message_assistant.id,
                            "parentMessageId": parent_for_next,
                            "messageText": "質問C",
                        },
                        headers=owner_headers,
                    )

            assert send_b.status_code == 200
            assert parent_for_next == message_b_id
            message_c = await session.get(Message, create_c.json()["id"])
            assert message_c is not None
            assert message_c.parent_id == message_b_id

        async def test_edit_and_resend_streams_message_content_with_edited_question(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            owned_room: Room,
            owned_message: Message,
            owned_message_content: MessageContent,
            message_assistant: Assistant,
            message_chat_endpoint: TenantEndpoint,
            engine: AsyncEngine,
        ) -> None:
            """編集・再送信で、編集後の質問文を持つmessage_contentが届き、編集前後が同じ親のバージョンになること(Issue #183)"""
            with _patched_llm(engine, "編集後の回答"):
                async with client as c:
                    # 編集対象: 既存メッセージAに続けて送ったメッセージB（親がA）
                    create_original = await c.post(
                        "/api/messages",
                        json={
                            "roomId": owned_room.id,
                            "assistantId": message_assistant.id,
                            "parentMessageId": owned_message.id,
                            "messageText": "編集前の質問",
                        },
                        headers=owner_headers,
                    )
                    original_message_id = create_original.json()["id"]
                    # secuaigent/clientのeditMessageと同じく、編集前(B)と同じ親(A)で新しい
                    # メッセージB'を作成し、編集後の質問文で送信する
                    create_edited = await c.post(
                        "/api/messages",
                        json={
                            "roomId": owned_room.id,
                            "assistantId": message_assistant.id,
                            "parentMessageId": owned_message.id,
                            "messageText": "編集後の質問",
                        },
                        headers=owner_headers,
                    )
                    edited_message_id = create_edited.json()["id"]
                    resend = await c.post(
                        "/api/messages/content",
                        files=_content_form(
                            {
                                "assistantId": message_assistant.id,
                                "messageId": edited_message_id,
                                "userInput": "編集後の質問",
                            }
                        ),
                        headers=owner_headers,
                    )
                    list_response = await c.get(
                        "/api/messages",
                        params={"roomId": owned_room.id},
                        headers=owner_headers,
                    )

            assert create_original.status_code == 200
            assert create_edited.status_code == 200
            assert resend.status_code == 200
            events = _sse_events(resend.text)
            assert [event["type"] for event in events] == [
                "text_delta",
                "message_stop",
                "message_content",
            ]
            edited_content = events[-1]["data"]
            assert edited_content["messageId"] == edited_message_id
            assert edited_content["question"] == "編集後の質問"
            assert edited_content["answer"] == "編集後の回答"
            assert edited_content["status"] == "OK"

            parent_by_id = {
                record["id"]: record["parentId"]
                for record in list_response.json()["messages"]
            }
            # 編集前(B)と編集後(B')が同じ親(A)を持つ兄弟＝バージョン分岐になること
            assert parent_by_id[original_message_id] == owned_message.id
            assert parent_by_id[edited_message_id] == owned_message.id

    class TestDeleteMessage:
        """メッセージ削除のテスト"""

        async def test_delete_message_removes_message(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            owned_message: Message,
        ) -> None:
            """メッセージが削除されること"""
            async with client as c:
                response = await c.delete(
                    f"/api/messages/{owned_message.id}", headers=owner_headers
                )

            assert response.status_code == 204

        async def test_delete_other_users_message_returns_403(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            other_users_message: Message,
        ) -> None:
            """他人のメッセージを削除しようとするとエラーになること"""
            async with client as c:
                response = await c.delete(
                    f"/api/messages/{other_users_message.id}", headers=owner_headers
                )

            assert response.status_code == 403

        async def test_delete_nonexistent_message_succeeds_idempotently(
            self, client: AsyncClient, owner_headers: dict[str, str]
        ) -> None:
            """存在しないmessageIdを指定しても何もせず成功すること"""
            async with client as c:
                response = await c.delete(
                    "/api/messages/nonexistent", headers=owner_headers
                )

            assert response.status_code == 204

    class TestDeleteMessageByContentId:
        """コンテンツ ID 指定のメッセージ削除のテスト"""

        async def test_delete_by_content_id_removes_message(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            owned_message_content: MessageContent,
        ) -> None:
            """メッセージ内容IDを指定してメッセージを削除できること"""
            async with client as c:
                response = await c.delete(
                    f"/api/messages/content/{owned_message_content.id}",
                    headers=owner_headers,
                )

            assert response.status_code == 204

    class TestFeedbackMessage:
        """メッセージへのフィードバックのテスト"""

        async def test_feedback_message_creates_new_feedback(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            owned_message: Message,
        ) -> None:
            """未評価のメッセージにフィードバックを新規作成できること"""
            async with client as c:
                response = await c.post(
                    f"/api/messages/{owned_message.id}/feedback",
                    json={"rating": "GOOD"},
                    headers=owner_headers,
                )

            assert response.status_code == 200
            assert response.json()["rating"] == "GOOD"

        async def test_feedback_message_updates_existing_rating(
            self,
            client: AsyncClient,
            session: AsyncSession,
            messages_tenant: Tenant,
            message_owner_user: User,
            owner_headers: dict[str, str],
            owned_message: Message,
        ) -> None:
            """既存フィードバックのratingが上書きされ新規作成されないこと"""
            existing = MessageFeedback(
                tenant_id=messages_tenant.id,
                user_id=message_owner_user.id,
                message_id=owned_message.id,
                rating=MessageRating.BAD,
            )
            session.add(existing)
            await session.commit()
            await session.refresh(existing)

            async with client as c:
                response = await c.post(
                    f"/api/messages/{owned_message.id}/feedback",
                    json={"rating": "GOOD"},
                    headers=owner_headers,
                )

            assert response.status_code == 200
            body = response.json()
            assert body["id"] == existing.id
            assert body["rating"] == "GOOD"

        async def test_feedback_other_users_message_returns_403(
            self,
            client: AsyncClient,
            owner_headers: dict[str, str],
            other_users_message: Message,
        ) -> None:
            """他人のメッセージにフィードバックしようとするとエラーになること"""
            async with client as c:
                response = await c.post(
                    f"/api/messages/{other_users_message.id}/feedback",
                    json={"rating": "GOOD"},
                    headers=owner_headers,
                )

            assert response.status_code == 403

    class TestTenantIsolation:
        """テナント分離のテスト"""

        async def test_get_messages_on_other_tenant_room_returns_404(
            self,
            client: AsyncClient,
            session: AsyncSession,
            other_tenant: Tenant,
            owner_headers: dict[str, str],
        ) -> None:
            """別テナントのルームIDを指定した操作が404になること"""
            other_tenant_user = User(
                id=uuid4(),
                tenant_id=other_tenant.id,
                login_id="other-tenant-owner",
                name="Other Tenant Owner",
                role=UserRole.USER,
                is_required_password_reset=False,
            )
            session.add(other_tenant_user)
            await session.commit()
            await session.refresh(other_tenant_user)

            other_tenant_assistant = Assistant(
                tenant_id=other_tenant.id,
                type=AssistantType.SAAS_CHAT,
                name="Other Tenant Assistant",
                include_history=False,
            )
            session.add(other_tenant_assistant)
            await session.commit()
            await session.refresh(other_tenant_assistant)

            other_tenant_room = Room(
                tenant_id=other_tenant.id,
                name="Other Tenant Room",
                default_assistant_id=other_tenant_assistant.id,
                user_id=other_tenant_user.id,
            )
            session.add(other_tenant_room)
            await session.commit()
            await session.refresh(other_tenant_room)

            async with client as c:
                response = await c.get(
                    "/api/messages",
                    params={"roomId": other_tenant_room.id},
                    headers=owner_headers,
                )

            assert response.status_code == 404


_BEDROCK_MODEL = "anthropic.claude-sonnet-5"
_BEDROCK_MAX_TOKENS = 8192


@pytest.fixture
async def message_bedrock_endpoint(
    session: AsyncSession, messages_tenant: Tenant, message_assistant: Assistant
) -> TenantEndpoint:
    """メッセージ送信(SSE)テスト用のBedrockチャットエンドポイント・AIモデル一式"""
    tenant_endpoint = TenantEndpoint(
        tenant_id=messages_tenant.id,
        type=EndpointType.BEDROCK_CHAT,
        endpoint_name="bedrock",
        endpoint="https://bedrock-mantle.ap-northeast-1.api.aws/anthropic",
        api_key="bedrock-api-key",
    )
    session.add(tenant_endpoint)
    await session.commit()
    await session.refresh(tenant_endpoint)

    session.add(
        AssistantEndpoint(
            assistant_id=message_assistant.id,
            endpoint_id=tenant_endpoint.id,
            tenant_id=messages_tenant.id,
            model=_BEDROCK_MODEL,
        )
    )
    session.add(
        AIModel(
            endpoint_type=AIModelEndpointType.BEDROCK_CHAT,
            name=_BEDROCK_MODEL,
            max_tokens=_BEDROCK_MAX_TOKENS,
            token_weight=Decimal("1.0"),
        )
    )
    await session.commit()
    return tenant_endpoint


class TestFindChatEndpoint:
    """AssistantEndpointRepository.find_chat_endpoint のテスト"""

    async def test_resolves_bedrock_chat_endpoint(
        self,
        session: AsyncSession,
        messages_tenant: Tenant,
        message_assistant: Assistant,
        message_bedrock_endpoint: TenantEndpoint,
    ) -> None:
        """Bedrockのチャット用エンドポイントだけを紐づけたアシスタントでも解決できること"""
        result = await AssistantEndpointRepository.find_chat_endpoint(
            message_assistant.id, messages_tenant.id, session
        )

        assert result is not None
        assistant_endpoint, tenant_endpoint = result
        assert tenant_endpoint.id == message_bedrock_endpoint.id
        assert tenant_endpoint.type == EndpointType.BEDROCK_CHAT
        assert assistant_endpoint.model == _BEDROCK_MODEL

    async def test_prefers_azure_when_both_azure_and_bedrock_are_linked(
        self,
        session: AsyncSession,
        messages_tenant: Tenant,
        message_assistant: Assistant,
    ) -> None:
        """Azure OpenAIとBedrockの両方を紐づけた場合、IDの並びによらずAzure OpenAIを従来どおり選ぶこと"""
        # BedrockのIDのほうが辞書順で小さくなるようにし、ID順ではBedrockが選ばれる状況にする
        bedrock_endpoint = TenantEndpoint(
            id="0" * 32,
            tenant_id=messages_tenant.id,
            type=EndpointType.BEDROCK_CHAT,
            endpoint_name="bedrock",
            endpoint="https://bedrock-mantle.ap-northeast-1.api.aws/anthropic",
            api_key="bedrock-api-key",
        )
        azure_endpoint = TenantEndpoint(
            id="f" * 32,
            tenant_id=messages_tenant.id,
            type=EndpointType.AZURE_OPENAI_CHAT,
            endpoint_name="azure",
            endpoint="https://example.openai.azure.com",
            api_key="api-key",
        )
        session.add_all([bedrock_endpoint, azure_endpoint])
        await session.commit()
        session.add_all(
            [
                AssistantEndpoint(
                    assistant_id=message_assistant.id,
                    endpoint_id=bedrock_endpoint.id,
                    tenant_id=messages_tenant.id,
                    model=_BEDROCK_MODEL,
                ),
                AssistantEndpoint(
                    assistant_id=message_assistant.id,
                    endpoint_id=azure_endpoint.id,
                    tenant_id=messages_tenant.id,
                    model="gpt-4o",
                ),
            ]
        )
        await session.commit()

        result = await AssistantEndpointRepository.find_chat_endpoint(
            message_assistant.id, messages_tenant.id, session
        )

        assert result is not None
        assert result[1].id == azure_endpoint.id
        assert result[0].model == "gpt-4o"

    async def test_returns_none_without_chat_endpoint(
        self,
        session: AsyncSession,
        messages_tenant: Tenant,
        message_assistant: Assistant,
    ) -> None:
        """チャット用以外（埋め込み）のエンドポイントしか紐づいていない場合はNoneになること"""
        embedding_endpoint = TenantEndpoint(
            tenant_id=messages_tenant.id,
            type=EndpointType.AZURE_OPENAI_EMBEDDING,
            endpoint_name="embedding",
            endpoint="https://example.openai.azure.com",
            api_key="api-key",
        )
        session.add(embedding_endpoint)
        await session.commit()
        await session.refresh(embedding_endpoint)
        session.add(
            AssistantEndpoint(
                assistant_id=message_assistant.id,
                endpoint_id=embedding_endpoint.id,
                tenant_id=messages_tenant.id,
                model="text-embedding-ada-002",
            )
        )
        await session.commit()

        result = await AssistantEndpointRepository.find_chat_endpoint(
            message_assistant.id, messages_tenant.id, session
        )

        assert result is None


class TestCreateMessageContentWithBedrock:
    """Bedrockのエンドポイントを紐づけたアシスタントへのメッセージ送信のテスト"""

    async def test_streams_with_bedrock_assistant(
        self,
        client: AsyncClient,
        owner_headers: dict[str, str],
        owned_message: Message,
        message_bedrock_endpoint: TenantEndpoint,
        engine: AsyncEngine,
    ) -> None:
        """Bedrockのアシスタントへ送信するとBedrockクライアントで応答し、使用量がBEDROCK_CHATで記録されること"""
        bedrock_calls: list[tuple[Any, ...]] = []

        async def _stream_chunks(
            *args: Any, **kwargs: Any
        ) -> AsyncIterator[ChatStreamChunk]:
            """LLM のストリーミング応答を模したチャンクを返す"""
            bedrock_calls.append(args)
            yield ChatStreamChunk(input_tokens=10)
            yield ChatStreamChunk(text_delta="Bedrockの回答")
            yield ChatStreamChunk(output_tokens=5)

        test_session_maker = async_sessionmaker(engine, expire_on_commit=False)
        with (
            patch(
                "app.services.message_service.BedrockLlmChatClient.stream_chat",
                side_effect=_stream_chunks,
            ),
            patch(
                "app.services.message_service.get_session_maker",
                return_value=test_session_maker,
            ),
        ):
            async with client as c:
                response = await c.post(
                    "/api/messages/content",
                    files=_content_form(
                        {"messageId": owned_message.id, "userInput": "質問"}
                    ),
                    headers=owner_headers,
                )

        assert response.status_code == 200
        events = _sse_events(response.text)
        assert [event["type"] for event in events] == [
            "text_delta",
            "message_stop",
            "message_content",
        ]
        assert events[2]["data"]["answer"] == "Bedrockの回答"
        assert len(bedrock_calls) == 1
        # モデルID・APIキーはBedrockのエンドポイントのもの、上限はAIモデルの上限であること
        assert bedrock_calls[0][1] == "bedrock-api-key"
        assert bedrock_calls[0][2] == _BEDROCK_MODEL
        assert bedrock_calls[0][5] == _BEDROCK_MAX_TOKENS

        async with test_session_maker() as verify_session:
            usages = (
                (
                    await verify_session.execute(
                        select(TokenUsage).where(
                            TokenUsage.message_id == owned_message.id  # type: ignore[arg-type]
                        )
                    )
                )
                .scalars()
                .all()
            )
        assert [(u.endpoint_type, u.model) for u in usages] == [
            ("BEDROCK_CHAT", _BEDROCK_MODEL)
        ]

    async def test_returns_400_when_tools_specified_with_bedrock(
        self,
        client: AsyncClient,
        owner_headers: dict[str, str],
        owned_message: Message,
        message_bedrock_endpoint: TenantEndpoint,
    ) -> None:
        """Bedrockのアシスタントでtoolsを指定すると、SSEを始めずに400になりLLMを呼ばないこと"""
        with patch(
            "app.services.message_service.BedrockLlmChatClient.stream_chat"
        ) as mock_stream:
            async with client as c:
                response = await c.post(
                    "/api/messages/content",
                    files=_content_form(
                        {
                            "messageId": owned_message.id,
                            "userInput": "質問",
                            "tools": [{"name": "web_search"}],
                        }
                    ),
                    headers=owner_headers,
                )

        assert response.status_code == 400
        assert "web_search/mcp" in response.json()["message"]
        mock_stream.assert_not_called()
