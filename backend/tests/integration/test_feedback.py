from uuid import uuid4

import pytest

from app.core.security import create_access_token
from app.models.assistant import Assistant, AssistantType
from app.models.group import Group, GroupUser
from app.models.message import Message, MessageFeedback, MessageRating
from app.models.room import Room, RoomRating
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


def _headers(login_id: str, tenant_id: str) -> dict[str, str]:
    token = create_access_token(login_id, tenant_id)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_id}


@pytest.fixture
async def feedback_tenant(session):
    tenant = _tenant("tenant-feedback-test")
    session.add(tenant)
    await session.commit()
    await session.refresh(tenant)
    return tenant


@pytest.fixture
async def other_tenant(session):
    tenant = _tenant("tenant-feedback-other")
    session.add(tenant)
    await session.commit()
    await session.refresh(tenant)
    return tenant


@pytest.fixture
async def tenant_admin_user(session, feedback_tenant):
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
async def group_admin_user(session, feedback_tenant):
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
async def general_user(session, feedback_tenant):
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
async def responded_user(session, feedback_tenant):
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
async def heavy_response_user(session, feedback_tenant):
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
async def unresponded_user(session, feedback_tenant):
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
async def other_tenant_user(session, other_tenant):
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
async def feedback_group(session, feedback_tenant, group_admin_user):
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
async def feedback_assistant(session, feedback_tenant):
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
async def other_tenant_assistant(session, other_tenant):
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
async def feedback_dataset(
    session,
    feedback_tenant,
    other_tenant,
    tenant_admin_user,
    group_admin_user,
    general_user,
    responded_user,
    heavy_response_user,
    unresponded_user,
    other_tenant_user,
    feedback_group,
    feedback_assistant,
    other_tenant_assistant,
):
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
        assistant_id=feedback_assistant.id,
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
            MessageFeedback(
                tenant_id=feedback_tenant.id,
                user_id=responded_user.id,
                message_id=responded_message.id,
                rating=MessageRating.GOOD,
            ),
            MessageFeedback(
                tenant_id=feedback_tenant.id,
                user_id=heavy_response_user.id,
                message_id=heavy_message_1.id,
                rating=MessageRating.GOOD,
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
    }


@pytest.fixture
def admin_headers(tenant_admin_user, feedback_tenant):
    return _headers(tenant_admin_user.login_id, feedback_tenant.id)


@pytest.fixture
def group_admin_headers(group_admin_user, feedback_tenant):
    return _headers(group_admin_user.login_id, feedback_tenant.id)


@pytest.fixture
def general_user_headers(general_user, feedback_tenant):
    return _headers(general_user.login_id, feedback_tenant.id)


@pytest.mark.asyncio
class TestFeedbackRouter:
    class TestGetFeedbackUsers:
        async def test_returns_feedback_message_count_and_room_rating_counts(
            self, client, admin_headers, feedback_dataset
        ):
            """フィードバック件数とルーム満足度別件数が正しく集計されること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackUser",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            content = response.json()["content"]
            responded_item = next(
                item
                for item in content
                if item["user"]["userId"] == feedback_dataset["responded_user"].login_id
            )

            assert responded_item["isResponded"] is True
            assert responded_item["feedbackMessageCount"] == 1
            assert responded_item["feedbackRoomCount"] == {
                "excellent": 1,
                "veryGood": 0,
                "good": 1,
                "average": 0,
                "poor": 0,
            }

        async def test_user_without_feedback_returns_zero_counts(
            self, client, admin_headers, feedback_dataset
        ):
            """フィードバック・評価ともにないユーザーは件数0・isResponded=falseで返ること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackUser",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            content = response.json()["content"]
            unresponded_item = next(
                item
                for item in content
                if item["user"]["userId"]
                == feedback_dataset["unresponded_user"].login_id
            )

            assert unresponded_item["isResponded"] is False
            assert unresponded_item["feedbackMessageCount"] == 0
            assert unresponded_item["feedbackRoomCount"] == {
                "excellent": 0,
                "veryGood": 0,
                "good": 0,
                "average": 0,
                "poor": 0,
            }

        async def test_filters_by_response_status_has_response(
            self, client, admin_headers, feedback_dataset
        ):
            """responseStatus=has_responseでフィードバック済みユーザーのみ絞り込まれること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackUser?responseStatus=has_response",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            login_ids = {item["user"]["userId"] for item in response.json()["content"]}
            assert login_ids == {
                feedback_dataset["responded_user"].login_id,
                feedback_dataset["heavy_response_user"].login_id,
            }

        async def test_filters_by_response_status_no_response(
            self, client, admin_headers, feedback_dataset
        ):
            """responseStatus=no_responseで未フィードバックユーザーのみ絞り込まれること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackUser?responseStatus=no_response",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            login_ids = {item["user"]["userId"] for item in response.json()["content"]}
            assert feedback_dataset["responded_user"].login_id not in login_ids
            assert feedback_dataset["heavy_response_user"].login_id not in login_ids
            assert feedback_dataset["unresponded_user"].login_id in login_ids

        async def test_filters_by_satisfaction_star5(
            self, client, admin_headers, feedback_dataset
        ):
            """satisfaction=star5でEXCELLENT評価を持つユーザーのみ絞り込まれること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackUser?satisfaction=star5",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            content = response.json()["content"]
            assert [item["user"]["userId"] for item in content] == [
                feedback_dataset["responded_user"].login_id
            ]

        async def test_sorts_by_feedback_count_ascending(
            self, client, admin_headers, feedback_dataset
        ):
            """sortField=count&sortOrder=ascでフィードバック件数の昇順に並ぶこと"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackUser?sortField=count&sortOrder=asc",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            counts = [
                item["feedbackMessageCount"] for item in response.json()["content"]
            ]
            assert counts == sorted(counts)
            assert response.json()["content"][-1]["user"]["userId"] == (
                feedback_dataset["heavy_response_user"].login_id
            )

        async def test_paginates_results(self, client, admin_headers, feedback_dataset):
            """page/sizeでページングされ、totalElementsが全体件数を示すこと"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackUser?page=0&size=1",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            body = response.json()
            assert len(body["content"]) == 1
            assert body["totalElements"] == 6
            assert body["number"] == 0
            assert body["size"] == 1

    class TestGetFeedbackUsersPermission:
        async def test_general_user_returns_403(
            self, client, general_user_headers, feedback_dataset
        ):
            """一般ユーザーはアクセスできないこと"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackUser",
                    headers=general_user_headers,
                )

            assert response.status_code == 403

        async def test_group_admin_can_access(
            self, client, group_admin_headers, feedback_dataset
        ):
            """グループ管理者はアクセスできること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackUser",
                    headers=group_admin_headers,
                )

            assert response.status_code == 200

    class TestTenantIsolation:
        async def test_other_tenant_users_are_excluded(
            self, client, admin_headers, feedback_dataset
        ):
            """別テナントのユーザー・フィードバックが結果に含まれないこと"""
            async with client as c:
                response = await c.get(
                    "/api/admin/feedbackUser?responseStatus=has_response",
                    headers=admin_headers,
                )

            assert response.status_code == 200
            login_ids = {item["user"]["userId"] for item in response.json()["content"]}
            assert feedback_dataset["other_tenant_user"].login_id not in login_ids
