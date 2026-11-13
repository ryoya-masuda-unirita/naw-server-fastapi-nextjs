from uuid import uuid4

import pytest

from app.core.security import create_access_token
from app.models.assistant import Assistant, AssistantEndpoint, AssistantType
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models.file import File, FileStatus
from app.models.group import Group, GroupUser
from app.models.index import Index, IndexType
from app.models.message import (
    Message,
    MessageContent,
    MessageContentStatus,
    MessageFeedback,
    MessageRating,
)
from app.models.room import Room, RoomRating
from app.models.tenant import Tenant
from app.models.tenant_endpoint import EndpointType, TenantEndpoint
from app.models.user import User, UserRole
from typing import Any
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


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
async def feedback_tenant(session: AsyncSession) -> Tenant:
    """テスト用テナント"""
    tenant = _tenant("tenant-feedback-test")
    session.add(tenant)
    await session.commit()
    await session.refresh(tenant)
    return tenant


@pytest.fixture
async def other_tenant(session: AsyncSession) -> Tenant:
    """別テナント（テナント分離の確認用）"""
    tenant = _tenant("tenant-feedback-other")
    session.add(tenant)
    await session.commit()
    await session.refresh(tenant)
    return tenant


@pytest.fixture
async def tenant_admin_user(session: AsyncSession, feedback_tenant: Tenant) -> User:
    """テナント管理者ユーザー"""
    user = User(
        id=uuid4(),
        tenant_id=feedback_tenant.id,
        login_id="feedback-admin",
        name="Feedback Admin",
        role=UserRole.ADMIN,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def group_admin_user(session: AsyncSession, feedback_tenant: Tenant) -> User:
    """グループ管理者ユーザー"""
    user = User(
        id=uuid4(),
        tenant_id=feedback_tenant.id,
        login_id="feedback-group-admin",
        name="Feedback Group Admin",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def general_user(session: AsyncSession, feedback_tenant: Tenant) -> User:
    """一般ユーザー"""
    user = User(
        id=uuid4(),
        tenant_id=feedback_tenant.id,
        login_id="feedback-general",
        name="Feedback General",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def responded_user(session: AsyncSession, feedback_tenant: Tenant) -> User:
    """フィードバックに回答済みのユーザー"""
    user = User(
        id=uuid4(),
        tenant_id=feedback_tenant.id,
        login_id="feedback-responded",
        name="Responded User",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def heavy_response_user(session: AsyncSession, feedback_tenant: Tenant) -> User:
    """回答数が多いユーザー"""
    user = User(
        id=uuid4(),
        tenant_id=feedback_tenant.id,
        login_id="feedback-heavy",
        name="Heavy Response User",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def unresponded_user(session: AsyncSession, feedback_tenant: Tenant) -> User:
    """フィードバックに未回答のユーザー"""
    user = User(
        id=uuid4(),
        tenant_id=feedback_tenant.id,
        login_id="feedback-unresponded",
        name="Unresponded User",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def other_tenant_user(session: AsyncSession, other_tenant: Tenant) -> User:
    """別テナントのユーザー"""
    user = User(
        id=uuid4(),
        tenant_id=other_tenant.id,
        login_id="feedback-other-tenant",
        name="Other Tenant User",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def feedback_group(
    session: AsyncSession, feedback_tenant: Tenant, group_admin_user: User
) -> Group:
    """フィードバック集計用のグループ"""
    group = Group(tenant_id=feedback_tenant.id, name="Feedback Admin Group")
    session.add(group)
    await session.commit()
    await session.refresh(group)
    session.add(
        GroupUser(
            group_id=group.id,
            tenant_id=feedback_tenant.id,
            user_id=group_admin_user.id,
            is_admin=True,
        )
    )
    await session.commit()
    return group


@pytest.fixture
async def feedback_assistant(
    session: AsyncSession, feedback_tenant: Tenant
) -> Assistant:
    """フィードバック対象のアシスタント"""
    assistant = Assistant(
        tenant_id=feedback_tenant.id,
        type=AssistantType.SAAS_CHAT,
        name="Feedback Assistant",
        include_history=False,
    )
    session.add(assistant)
    await session.commit()
    await session.refresh(assistant)
    return assistant


@pytest.fixture
async def other_tenant_assistant(
    session: AsyncSession, other_tenant: Tenant
) -> Assistant:
    """別テナントのアシスタント"""
    assistant = Assistant(
        tenant_id=other_tenant.id,
        type=AssistantType.SAAS_CHAT,
        name="Other Feedback Assistant",
        include_history=False,
    )
    session.add(assistant)
    await session.commit()
    await session.refresh(assistant)
    return assistant


@pytest.fixture
async def secondary_feedback_assistant(
    session: AsyncSession, feedback_tenant: Tenant
) -> Assistant:
    """2 つ目のフィードバック対象アシスタント"""
    assistant = Assistant(
        tenant_id=feedback_tenant.id,
        type=AssistantType.SECURE,
        name="Secondary Feedback Assistant",
        include_history=False,
    )
    session.add(assistant)
    await session.commit()
    await session.refresh(assistant)
    return assistant


@pytest.fixture
async def feedback_dataset(
    session: AsyncSession,
    feedback_tenant: Tenant,
    other_tenant: Tenant,
    tenant_admin_user: User,
    group_admin_user: User,
    general_user: User,
    responded_user: User,
    heavy_response_user: User,
    unresponded_user: User,
    other_tenant_user: User,
    feedback_group: Group,
    feedback_assistant: Assistant,
    other_tenant_assistant: Assistant,
    secondary_feedback_assistant: Assistant,
) -> dict[str, Any]:
    """フィードバック集計テスト用のデータ一式"""
    responded_room_excellent = Room(
        tenant_id=feedback_tenant.id,
        name="Responded Excellent",
        default_assistant_id=feedback_assistant.id,
        user_id=responded_user.id,
        rating=RoomRating.EXCELLENT,
    )
    responded_room_good = Room(
        tenant_id=feedback_tenant.id,
        name="Responded Good",
        default_assistant_id=feedback_assistant.id,
        user_id=responded_user.id,
        rating=RoomRating.GOOD,
    )
    heavy_room = Room(
        tenant_id=feedback_tenant.id,
        name="Heavy Room",
        default_assistant_id=feedback_assistant.id,
        user_id=heavy_response_user.id,
        rating=None,
    )
    other_tenant_room = Room(
        tenant_id=other_tenant.id,
        name="Other Tenant Room",
        default_assistant_id=other_tenant_assistant.id,
        user_id=other_tenant_user.id,
        rating=RoomRating.EXCELLENT,
    )
    session.add_all(
        [
            responded_room_excellent,
            responded_room_good,
            heavy_room,
            other_tenant_room,
        ]
    )
    await session.commit()
    await session.refresh(responded_room_excellent)
    await session.refresh(responded_room_good)
    await session.refresh(heavy_room)
    await session.refresh(other_tenant_room)

    responded_message = Message(
        tenant_id=feedback_tenant.id,
        room_id=responded_room_excellent.id,
        assistant_id=feedback_assistant.id,
    )
    heavy_message_1 = Message(
        tenant_id=feedback_tenant.id,
        room_id=heavy_room.id,
        assistant_id=feedback_assistant.id,
    )
    heavy_message_2 = Message(
        tenant_id=feedback_tenant.id,
        room_id=heavy_room.id,
        assistant_id=secondary_feedback_assistant.id,
    )
    other_tenant_message = Message(
        tenant_id=other_tenant.id,
        room_id=other_tenant_room.id,
        assistant_id=other_tenant_assistant.id,
    )
    session.add_all(
        [
            responded_message,
            heavy_message_1,
            heavy_message_2,
            other_tenant_message,
        ]
    )
    await session.commit()
    await session.refresh(responded_message)
    await session.refresh(heavy_message_1)
    await session.refresh(heavy_message_2)
    await session.refresh(other_tenant_message)

    session.add_all(
        [
            MessageContent(
                tenant_id=feedback_tenant.id,
                message_id=responded_message.id,
                status=MessageContentStatus.OK,
                question="Responded question",
                answer="Responded answer",
            ),
            MessageContent(
                tenant_id=feedback_tenant.id,
                message_id=heavy_message_1.id,
                status=MessageContentStatus.OK,
                question="Heavy question",
                answer="Heavy answer",
            ),
        ]
    )
    await session.commit()

    local_server_endpoint = TenantEndpoint(
        tenant_id=feedback_tenant.id,
        type=EndpointType.LOCAL_SERVER,
        endpoint_name="Local Server",
        endpoint="http://local-server.example",
        api_key="local-server-key",
    )
    session.add(local_server_endpoint)
    await session.commit()
    await session.refresh(local_server_endpoint)

    session.add(
        AssistantEndpoint(
            assistant_id=secondary_feedback_assistant.id,
            endpoint_id=local_server_endpoint.id,
            tenant_id=feedback_tenant.id,
            model="local-server-model",
        )
    )
    await session.commit()

    session.add_all(
        [
            MessageFeedback(
                tenant_id=feedback_tenant.id,
                user_id=responded_user.id,
                message_id=responded_message.id,
                rating=MessageRating.GOOD,
                index_id="folder-responded",
            ),
            MessageFeedback(
                tenant_id=feedback_tenant.id,
                user_id=heavy_response_user.id,
                message_id=heavy_message_1.id,
                rating=MessageRating.GOOD,
                index_id="folder-001",
            ),
            MessageFeedback(
                tenant_id=feedback_tenant.id,
                user_id=heavy_response_user.id,
                message_id=heavy_message_2.id,
                rating=MessageRating.BAD,
            ),
            MessageFeedback(
                tenant_id=other_tenant.id,
                user_id=other_tenant_user.id,
                message_id=other_tenant_message.id,
                rating=MessageRating.GOOD,
            ),
        ]
    )
    await session.commit()

    return {
        "tenant_admin_user": tenant_admin_user,
        "group_admin_user": group_admin_user,
        "general_user": general_user,
        "responded_user": responded_user,
        "heavy_response_user": heavy_response_user,
        "unresponded_user": unresponded_user,
        "other_tenant_user": other_tenant_user,
        "feedback_group": feedback_group,
        "feedback_assistant": feedback_assistant,
        "secondary_feedback_assistant": secondary_feedback_assistant,
        "local_server_endpoint": local_server_endpoint,
    }


@pytest.fixture
def admin_headers(tenant_admin_user: User, feedback_tenant: Tenant) -> dict[str, str]:
    """テナント管理者の認証ヘッダー"""
    return _headers(tenant_admin_user.login_id, feedback_tenant.id)


@pytest.fixture
def group_admin_headers(
    group_admin_user: User, feedback_tenant: Tenant
) -> dict[str, str]:
    """グループ管理者の認証ヘッダー"""
    return _headers(group_admin_user.login_id, feedback_tenant.id)


@pytest.fixture
def general_user_headers(general_user: User, feedback_tenant: Tenant) -> dict[str, str]:
    """一般ユーザーの認証ヘッダー"""
    return _headers(general_user.login_id, feedback_tenant.id)


@pytest.mark.asyncio
class TestFeedbackRouter:
    """フィードバック API のテスト"""

    class TestGetFeedbackUsers:
        """フィードバックのユーザー別集計取得のテスト"""

        async def test_returns_feedback_message_count_and_room_rating_counts(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """フィードバック件数とルーム満足度別件数が正しく集計されること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackUser",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            content = response.json()["feedbacks"]["content"]
            responded_item = next(
                item
                for item in content
                if item["user"]["userId"] == feedback_dataset["responded_user"].login_id
            )

            assert responded_item["isResponded"] is True
            assert responded_item["responded"] is True
            assert responded_item["feedbackMessageCount"] == 1
            assert responded_item["feedbackRoomCount"] == {
                "excellent": 1,
                "veryGood": 0,
                "good": 1,
                "average": 0,
                "poor": 0,
            }

        async def test_user_without_feedback_returns_zero_counts(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """フィードバック・評価ともにないユーザーは件数0・isResponded=falseで返ること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackUser",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            content = response.json()["feedbacks"]["content"]
            unresponded_item = next(
                item
                for item in content
                if item["user"]["userId"]
                == feedback_dataset["unresponded_user"].login_id
            )

            assert unresponded_item["isResponded"] is False
            assert unresponded_item["responded"] is False
            assert unresponded_item["feedbackMessageCount"] == 0
            assert unresponded_item["feedbackRoomCount"] == {
                "excellent": 0,
                "veryGood": 0,
                "good": 0,
                "average": 0,
                "poor": 0,
            }

        async def test_filters_by_response_status_has_response(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """responseStatus=has_responseでフィードバック済みユーザーのみ絞り込まれること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackUser?responseStatus=has_response",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            login_ids = {
                item["user"]["userId"]
                for item in response.json()["feedbacks"]["content"]
            }
            assert login_ids == {
                feedback_dataset["responded_user"].login_id,
                feedback_dataset["heavy_response_user"].login_id,
            }

        async def test_filters_by_response_status_no_response(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """responseStatus=no_responseで未フィードバックユーザーのみ絞り込まれること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackUser?responseStatus=no_response",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            login_ids = {
                item["user"]["userId"]
                for item in response.json()["feedbacks"]["content"]
            }
            assert feedback_dataset["responded_user"].login_id not in login_ids
            assert feedback_dataset["heavy_response_user"].login_id not in login_ids
            assert feedback_dataset["unresponded_user"].login_id in login_ids

        async def test_filters_by_satisfaction_star5(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """satisfaction=star5でEXCELLENT評価を持つユーザーのみ絞り込まれること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackUser?satisfaction=star5",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            content = response.json()["feedbacks"]["content"]
            assert [item["user"]["userId"] for item in content] == [
                feedback_dataset["responded_user"].login_id
            ]

        async def test_invalid_sort_order_returns_400(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """sortOrderが不正だと400になり、移植元と同じ文言が返ること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackUser?sortOrder=up",
                    headers=admin_headers,
                )

            assert response.status_code == 400
            assert (
                response.json()["message"]
                == "ソート順は asc または desc を指定してください"
            )

        async def test_sorts_by_feedback_count_ascending(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """sortField=count&sortOrder=ascでフィードバック件数の昇順に並ぶこと"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackUser?sortField=count&sortOrder=asc",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            content = response.json()["feedbacks"]["content"]
            counts = [item["feedbackMessageCount"] for item in content]
            assert counts == sorted(counts)
            assert content[-1]["user"]["userId"] == (
                feedback_dataset["heavy_response_user"].login_id
            )

        async def test_paginates_results(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """page/sizeでページングされ、totalElements・totalPages・numberOfElementsが正しいこと"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackUser?page=0&size=1",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            body = response.json()["feedbacks"]
            assert len(body["content"]) == 1
            assert body["totalElements"] == 6
            assert body["number"] == 0
            assert body["size"] == 1
            assert body["totalPages"] == 6
            assert body["numberOfElements"] == 1

    class TestGetFeedbackUsersPermission:
        """フィードバックのユーザー別集計取得の権限のテスト"""

        async def test_general_user_returns_403(
            self,
            client: AsyncClient,
            general_user_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """一般ユーザーはアクセスできないこと"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackUser",
                    headers=general_user_headers,
                )

            assert response.status_code == 403

        async def test_group_admin_can_access(
            self,
            client: AsyncClient,
            group_admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """グループ管理者はアクセスできること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackUser",
                    headers=group_admin_headers,
                )

            assert response.status_code == 200

    class TestTenantIsolation:
        """テナント分離のテスト"""

        async def test_other_tenant_users_are_excluded(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """別テナントのユーザー・フィードバックが結果に含まれないこと"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackUser?responseStatus=has_response",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            login_ids = {
                item["user"]["userId"]
                for item in response.json()["feedbacks"]["content"]
            }
            assert feedback_dataset["other_tenant_user"].login_id not in login_ids

    class TestGetFeedbackMessages:
        """フィードバックメッセージ取得のテスト"""

        async def test_returns_feedback_message_with_assistant_name_and_content(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """assistantName と question/answer を含む一覧が返ること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackMessage?assistantId="
                    + feedback_dataset["feedback_assistant"].id,
                    headers=admin_headers,
                )

            assert response.status_code == 200
            item = response.json()["feedbacks"]["content"][0]
            assert (
                item["message"]["assistantId"]
                == feedback_dataset["feedback_assistant"].id
            )
            assert item["message"]["assistantName"] == "Feedback Assistant"
            assert item["message"]["content"]["question"] == "Responded question"
            assert item["message"]["content"]["answer"] == "Responded answer"
            assert item["rating"] == "GOOD"

        async def test_returns_assistant_id_to_server_map_for_local_server(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """LOCAL_SERVER endpoint を assistantIdToServerMap として返すこと"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackMessage?assistantId="
                    + feedback_dataset["secondary_feedback_assistant"].id,
                    headers=admin_headers,
                )

            assert response.status_code == 200
            server_map = response.json()["assistantIdToServerMap"]
            assert server_map == {
                feedback_dataset["secondary_feedback_assistant"].id: {
                    "url": feedback_dataset["local_server_endpoint"].endpoint,
                    "authKey": feedback_dataset["local_server_endpoint"].api_key,
                }
            }

        async def test_returns_null_content_when_message_content_is_missing(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """message_contents が無い場合でも content.question/answer が null で返ること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackMessage?assistantId="
                    + feedback_dataset["secondary_feedback_assistant"].id,
                    headers=admin_headers,
                )

            assert response.status_code == 200
            item = response.json()["feedbacks"]["content"][0]
            assert item["message"]["content"]["question"] is None
            assert item["message"]["content"]["answer"] is None

        async def test_filters_by_assistant_id(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """assistantId 絞り込みが効くこと"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackMessage?assistantId="
                    + feedback_dataset["secondary_feedback_assistant"].id,
                    headers=admin_headers,
                )

            assert response.status_code == 200
            items = response.json()["feedbacks"]["content"]
            assert len(items) == 1
            assert (
                items[0]["message"]["assistantId"]
                == feedback_dataset["secondary_feedback_assistant"].id
            )

        async def test_filters_by_rating(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """rating 絞り込みが効くこと"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackMessage?rating=BAD",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            items = response.json()["feedbacks"]["content"]
            assert len(items) == 1
            assert items[0]["rating"] == "BAD"

        async def test_filters_by_folder_id(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """folderId 絞り込みが message_feedbacks.index_id に対して効くこと"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackMessage?folderId=folder-001",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            items = response.json()["feedbacks"]["content"]
            assert len(items) == 1
            assert items[0]["indexId"] == "folder-001"
            assert items[0]["message"]["content"]["question"] == "Heavy question"

        async def test_sorts_by_accuracy_ascending(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """accuracy 昇順ソートが効くこと"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackMessage?sortField=accuracy&sortOrder=asc",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            ratings = [
                item["rating"] for item in response.json()["feedbacks"]["content"]
            ]
            assert ratings == sorted(ratings)

        async def test_paginates_feedback_messages(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """page/size でページングされ、totalPages・numberOfElementsも正しいこと"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackMessage?page=0&size=1",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            body = response.json()["feedbacks"]
            assert len(body["content"]) == 1
            assert body["totalElements"] == 3
            assert body["number"] == 0
            assert body["size"] == 1
            assert body["totalPages"] == 3
            assert body["numberOfElements"] == 1

    class TestGetFeedbackMessagesPermission:
        """フィードバックメッセージ取得の権限のテスト"""

        async def test_general_user_returns_403(
            self,
            client: AsyncClient,
            general_user_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """一般ユーザーはアクセスできないこと"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackMessage",
                    headers=general_user_headers,
                )

            assert response.status_code == 403

        async def test_group_admin_can_access(
            self,
            client: AsyncClient,
            group_admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """グループ管理者はアクセスできること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackMessage",
                    headers=group_admin_headers,
                )

            assert response.status_code == 200

    class TestGetFeedbackRooms:
        """フィードバックのルーム評価取得のテスト"""

        async def test_returns_latest_index_id_of_room_files(
            self,
            client: AsyncClient,
            session: AsyncSession,
            feedback_tenant: Tenant,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """feedbackRoom の indexId がルームに紐づく最新ファイルのインデックスIDになること（Issue #309）"""
            room = (
                (
                    await session.execute(
                        select(Room).where(Room.name == "Responded Good")  # type: ignore[arg-type]
                    )
                )
                .scalars()
                .one()
            )
            old_index = Index(
                tenant_id=feedback_tenant.id, type=IndexType.SAAS_GLOBAL, name="old"
            )
            new_index = Index(
                tenant_id=feedback_tenant.id, type=IndexType.SAAS_GLOBAL, name="new"
            )
            session.add_all([old_index, new_index])
            await session.commit()
            now = datetime.now(timezone.utc)
            for index, created_at in (
                (old_index, now - timedelta(days=1)),
                (new_index, now),
            ):
                session.add(
                    File(
                        tenant_id=feedback_tenant.id,
                        name=f"{index.name}.txt",
                        status=FileStatus.ENABLE,
                        user_id=room.user_id,
                        index_id=index.id,
                        room_id=room.id,
                        created_at=created_at,
                    )
                )
            await session.commit()

            async with client as c:
                response = await c.get("/api/admin/feedbackRoom", headers=admin_headers)

            items = {
                item["room"]["name"]: item
                for item in response.json()["feedbacks"]["content"]
            }
            assert items["Responded Good"]["indexId"] == new_index.id
            assert items["Responded Excellent"]["indexId"] is None

        async def test_excludes_unrated_rooms(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """rating未登録のルームは一覧から除外されること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackRoom",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            room_names = {
                item["room"]["name"] for item in response.json()["feedbacks"]["content"]
            }
            assert "Heavy Room" not in room_names
            assert room_names == {"Responded Excellent", "Responded Good"}

        async def test_returns_user_name_and_assistant_name(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """userNameとdefaultAssistantNameが解決されて返ること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackRoom",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            item = next(
                item
                for item in response.json()["feedbacks"]["content"]
                if item["room"]["name"] == "Responded Excellent"
            )
            assert item["userName"] == feedback_dataset["responded_user"].name
            assert item["room"]["defaultAssistantName"] == "Feedback Assistant"
            assert item["rating"] == "EXCELLENT"
            assert item["room"]["rating"] == "EXCELLENT"

        async def test_filters_by_assistant_id(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """assistantId絞り込みが効くこと"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackRoom?assistantId="
                    + feedback_dataset["secondary_feedback_assistant"].id,
                    headers=admin_headers,
                )

            assert response.status_code == 200
            assert response.json()["feedbacks"]["content"] == []

        async def test_filters_by_rating(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """rating絞り込みが効くこと"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackRoom?rating=GOOD",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            items = response.json()["feedbacks"]["content"]
            assert len(items) == 1
            assert items[0]["room"]["name"] == "Responded Good"

        async def test_sorts_by_level_ascending(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """sortField=level&sortOrder=ascで評価の昇順に並ぶこと"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackRoom?sortField=level&sortOrder=asc",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            ratings = [
                item["rating"] for item in response.json()["feedbacks"]["content"]
            ]
            assert ratings == sorted(ratings)

        async def test_paginates_feedback_rooms(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """page/sizeでページングされ、totalPages・numberOfElementsも正しいこと"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackRoom?page=0&size=1",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            body = response.json()["feedbacks"]
            assert len(body["content"]) == 1
            assert body["totalElements"] == 2
            assert body["number"] == 0
            assert body["size"] == 1
            assert body["totalPages"] == 2
            assert body["numberOfElements"] == 1

        async def test_excludes_other_tenant_rooms(
            self,
            client: AsyncClient,
            admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """別テナントの評価済みルームが結果に含まれないこと"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackRoom",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            room_names = {
                item["room"]["name"] for item in response.json()["feedbacks"]["content"]
            }
            assert "Other Tenant Room" not in room_names

    class TestGetFeedbackRoomsPermission:
        """フィードバックのルーム評価取得の権限のテスト"""

        async def test_general_user_returns_403(
            self,
            client: AsyncClient,
            general_user_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """一般ユーザーはアクセスできないこと"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackRoom",
                    headers=general_user_headers,
                )

            assert response.status_code == 403

        async def test_group_admin_can_access(
            self,
            client: AsyncClient,
            group_admin_headers: dict[str, str],
            feedback_dataset: dict[str, Any],
        ) -> None:
            """グループ管理者はアクセスできること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackRoom",
                    headers=group_admin_headers,
                )

            assert response.status_code == 200

        async def test_returns_401_without_token(
            self, client: AsyncClient, feedback_dataset: dict[str, Any]
        ) -> None:
            """未ログインではアクセスできないこと"""
            async with client as c:
                response = await c.get("/api/admin/feedbackRoom")

            assert response.status_code == 401
