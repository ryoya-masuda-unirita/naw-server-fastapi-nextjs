from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import create_access_token
from app.main import app
from app.models.assistant import Assistant, AssistantType
from app.models.message import (
    Message,
    MessageContent,
    MessageContentStatus,
    MessageFeedback,
    MessageFile,
    MessageRating,
)
from app.models.room import Room
from app.models.tenant import Tenant
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
