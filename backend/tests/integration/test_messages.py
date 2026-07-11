from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.llm_client import ChatStreamChunk
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
from app.models.user import User, UserRole


def _tenant(tenant_id: str) -> Tenant:
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
async def messages_tenant(session):
    tenant = _tenant("tenant-messages-test")
    session.add(tenant)
    await session.commit()
    await session.refresh(tenant)
    return tenant


@pytest.fixture
async def other_tenant(session):
    tenant = _tenant("tenant-messages-other")
    session.add(tenant)
    await session.commit()
    await session.refresh(tenant)
    return tenant


@pytest.fixture
async def message_owner_user(session, messages_tenant):
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
async def other_user_same_tenant(session, messages_tenant):
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
async def message_assistant(session, messages_tenant):
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
async def message_chat_endpoint(session, messages_tenant, message_assistant):
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
async def owned_room(session, messages_tenant, message_owner_user, message_assistant):
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
    session, messages_tenant, other_user_same_tenant, message_assistant
):
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
async def owned_message(session, messages_tenant, owned_room, message_assistant):
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
    session, messages_tenant, other_users_room, message_assistant
):
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
async def share_target_group(session, messages_tenant, other_user_same_tenant):
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
async def shared_room_share(session, messages_tenant, owned_room, share_target_group):
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
async def owned_message_content(session, messages_tenant, owned_message):
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
async def other_users_message_content(session, messages_tenant, other_users_message):
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
    token = create_access_token(login_id, tenant_id)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_id}


@pytest.fixture
def owner_headers(message_owner_user, messages_tenant):
    return _headers(message_owner_user.login_id, messages_tenant.id)


@pytest.fixture
def other_user_headers(other_user_same_tenant, messages_tenant):
    return _headers(other_user_same_tenant.login_id, messages_tenant.id)


@pytest.fixture
def client(override_get_session):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
class TestMessageRouter:
    class TestCreateMessage:
        async def test_create_message_without_room_id_creates_new_room(
            self, client, owner_headers, message_assistant
        ):
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
            self, client, owner_headers, owned_room, message_assistant
        ):
            """既存の自分のルームIDを指定してメッセージを作成できること"""
            async with client as c:
                response = await c.post(
                    "/api/messages",
                    json={"roomId": owned_room.id, "assistantId": message_assistant.id},
                    headers=owner_headers,
                )

            assert response.status_code == 200

        async def test_create_message_with_invalid_assistant_id_returns_400(
            self, client, owner_headers
        ):
            """存在しないアシスタントIDを指定すると400エラーになること"""
            async with client as c:
                response = await c.post(
                    "/api/messages",
                    json={"assistantId": "nonexistent"},
                    headers=owner_headers,
                )

            assert response.status_code == 400

        async def test_create_message_with_other_users_room_returns_403(
            self, client, owner_headers, other_users_room, message_assistant
        ):
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
            client,
            other_user_headers,
            owned_room,
            shared_room_share,
            message_assistant,
        ):
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
            self, client, owner_headers, owned_room, message_assistant
        ):
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
            self, client, owner_headers, owned_room, message_assistant
        ):
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
        async def test_get_messages_returns_list_and_assistants(
            self, client, owner_headers, owned_room, owned_message, message_assistant
        ):
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

        async def test_get_messages_with_shared_group_member_returns_200(
            self,
            client,
            other_user_headers,
            owned_room,
            owned_message,
            shared_room_share,
        ):
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
            self, client, owner_headers, other_users_room
        ):
            """他人のルームを指定するとエラーになること"""
            async with client as c:
                response = await c.get(
                    "/api/messages",
                    params={"roomId": other_users_room.id},
                    headers=owner_headers,
                )

            assert response.status_code == 403

        async def test_get_messages_with_nonexistent_room_returns_404(
            self, client, owner_headers
        ):
            """存在しないルームIDを指定すると404になること"""
            async with client as c:
                response = await c.get(
                    "/api/messages",
                    params={"roomId": "nonexistent"},
                    headers=owner_headers,
                )

            assert response.status_code == 404

    class TestGetMessageContents:
        async def test_get_message_contents_returns_attachment_and_reference_paths(
            self, client, owner_headers, owned_message, owned_message_content
        ):
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
            client,
            other_user_headers,
            owned_message,
            owned_message_content,
            shared_room_share,
        ):
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
            self, client, session, messages_tenant, owner_headers, other_users_message
        ):
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
        async def test_streams_sse_and_persists_message_content(
            self,
            client,
            owner_headers,
            owned_message,
            message_chat_endpoint,
            engine,
        ):
            """正常系: SSEでtext_delta・message_stop・completeイベントを配信すること"""

            async def _stream_chunks(*args, **kwargs):
                yield ChatStreamChunk(text_delta="こんにちは")
                yield ChatStreamChunk(input_tokens=10, output_tokens=5)

            # ストリーミング完了後の永続化はリクエストのDIスコープ(テスト用の`session`
            # フィクスチャ)とは独立した新規セッションで行われるため、`get_session_maker`
            # もテスト用エンジンにつなぎ替える。
            test_session_maker = sessionmaker(
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
                        json={
                            "messageId": owned_message.id,
                            "userInput": "こんにちは",
                        },
                        headers=owner_headers,
                    )

            assert response.status_code == 200
            body = response.text
            assert "event: text_delta" in body
            assert "event: message_stop" in body
            assert "event: complete" in body

        async def test_returns_404_when_message_not_found(self, client, owner_headers):
            """存在しないmessageIdを指定すると404になること"""
            async with client as c:
                response = await c.post(
                    "/api/messages/content",
                    json={"messageId": "nonexistent", "userInput": "こんにちは"},
                    headers=owner_headers,
                )

            assert response.status_code == 404

        async def test_returns_403_when_room_not_owned(
            self, client, owner_headers, other_users_message
        ):
            """他人のルームに属するメッセージIDを指定するとエラーになること"""
            async with client as c:
                response = await c.post(
                    "/api/messages/content",
                    json={
                        "messageId": other_users_message.id,
                        "userInput": "こんにちは",
                    },
                    headers=owner_headers,
                )

            assert response.status_code == 403

        async def test_regenerates_existing_content_and_keeps_question(
            self,
            client,
            owner_headers,
            owned_message_content,
            message_chat_endpoint,
            engine,
        ):
            """messageContentId指定時、既存の回答が上書きされ質問文は変更されないこと"""

            async def _stream_chunks(*args, **kwargs):
                yield ChatStreamChunk(text_delta="新しい回答")
                yield ChatStreamChunk(input_tokens=10, output_tokens=5)

            test_session_maker = sessionmaker(
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
                        json={
                            "messageContentId": owned_message_content.id,
                            "userInput": "もう一度答えて",
                        },
                        headers=owner_headers,
                    )

            assert response.status_code == 200
            body = response.text
            assert "event: complete" in body
            assert '"question": "質問です"' in body
            assert '"answer": "新しい回答"' in body
            assert f'"id": "{owned_message_content.id}"' in body

        async def test_regenerate_returns_404_when_message_content_not_found(
            self, client, owner_headers
        ):
            """存在しないmessageContentIdを指定すると404になること"""
            async with client as c:
                response = await c.post(
                    "/api/messages/content",
                    json={
                        "messageContentId": "nonexistent",
                        "userInput": "もう一度答えて",
                    },
                    headers=owner_headers,
                )

            assert response.status_code == 404

        async def test_regenerate_returns_403_when_room_not_owned(
            self, client, owner_headers, other_users_message_content
        ):
            """他人のルームに属するmessageContentIdを指定するとエラーになること"""
            async with client as c:
                response = await c.post(
                    "/api/messages/content",
                    json={
                        "messageContentId": other_users_message_content.id,
                        "userInput": "もう一度答えて",
                    },
                    headers=owner_headers,
                )

            assert response.status_code == 403

        async def test_returns_422_when_neither_message_id_nor_content_id_given(
            self, client, owner_headers
        ):
            """messageId・messageContentIdのいずれも指定しないとバリデーションエラーになること"""
            async with client as c:
                response = await c.post(
                    "/api/messages/content",
                    json={"userInput": "こんにちは"},
                    headers=owner_headers,
                )

            assert response.status_code == 422

        async def test_persists_attachment_files_and_returns_them_in_complete_event(
            self,
            client,
            owner_headers,
            owned_message,
            message_chat_endpoint,
            engine,
        ):
            """attachmentFilesを送信した場合、message_filesに永続化されcompleteイベントに反映されること"""
            import base64

            async def _stream_chunks(*args, **kwargs):
                yield ChatStreamChunk(text_delta="こんにちは")
                yield ChatStreamChunk(input_tokens=10, output_tokens=5)

            test_session_maker = sessionmaker(
                engine, class_=AsyncSession, expire_on_commit=False
            )
            encoded = base64.b64encode(b"binary-image-data").decode("ascii")
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
                        json={
                            "messageId": owned_message.id,
                            "userInput": "こんにちは",
                            "attachmentFiles": [
                                {
                                    "name": "photo.png",
                                    "type": "image/png",
                                    "data": encoded,
                                }
                            ],
                        },
                        headers=owner_headers,
                    )
                    contents_response = await c.post(
                        "/api/messages/contents",
                        json={"messageIds": [owned_message.id]},
                        headers=owner_headers,
                    )

            assert response.status_code == 200
            body = response.text
            assert "event: complete" in body
            assert "photo.png" in body

            saved_names = [
                f["name"]
                for content in contents_response.json()
                for f in content["attachmentFiles"]
            ]
            assert "photo.png" in saved_names

    class TestDeleteMessage:
        async def test_delete_message_removes_message(
            self, client, owner_headers, owned_message
        ):
            """メッセージが削除されること"""
            async with client as c:
                response = await c.delete(
                    f"/api/messages/{owned_message.id}", headers=owner_headers
                )

            assert response.status_code == 204

        async def test_delete_other_users_message_returns_403(
            self, client, owner_headers, other_users_message
        ):
            """他人のメッセージを削除しようとするとエラーになること"""
            async with client as c:
                response = await c.delete(
                    f"/api/messages/{other_users_message.id}", headers=owner_headers
                )

            assert response.status_code == 403

        async def test_delete_nonexistent_message_succeeds_idempotently(
            self, client, owner_headers
        ):
            """存在しないmessageIdを指定しても何もせず成功すること"""
            async with client as c:
                response = await c.delete(
                    "/api/messages/nonexistent", headers=owner_headers
                )

            assert response.status_code == 204

    class TestDeleteMessageByContentId:
        async def test_delete_by_content_id_removes_message(
            self, client, owner_headers, owned_message_content
        ):
            """メッセージ内容IDを指定してメッセージを削除できること"""
            async with client as c:
                response = await c.delete(
                    f"/api/messages/content/{owned_message_content.id}",
                    headers=owner_headers,
                )

            assert response.status_code == 204

    class TestFeedbackMessage:
        async def test_feedback_message_creates_new_feedback(
            self, client, owner_headers, owned_message
        ):
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
            client,
            session,
            messages_tenant,
            message_owner_user,
            owner_headers,
            owned_message,
        ):
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
            self, client, owner_headers, other_users_message
        ):
            """他人のメッセージにフィードバックしようとするとエラーになること"""
            async with client as c:
                response = await c.post(
                    f"/api/messages/{other_users_message.id}/feedback",
                    json={"rating": "GOOD"},
                    headers=owner_headers,
                )

            assert response.status_code == 403

    class TestTenantIsolation:
        async def test_get_messages_on_other_tenant_room_returns_404(
            self,
            client,
            session,
            other_tenant,
            owner_headers,
        ):
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
