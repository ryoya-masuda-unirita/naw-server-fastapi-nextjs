from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file import File, FileStatus
from app.models.assistant import Assistant, AssistantType
from app.models.index import Index, IndexType
from app.models.room import Room
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.repositories.file_repository import FileRepository

TENANT_ID = "tenant-file-repository-test"


async def _create_files(session: AsyncSession) -> dict[FileStatus, str]:
    """ステータスごとに1件ずつファイルを作成し、ステータス→ファイルIDを返す。"""
    # リレーションを定義していないモデル同士はINSERT順が保証されないため、
    # 外部キーの参照先から順にコミットする。
    session.add(Tenant(id=TENANT_ID, name="File Repository Test", owner="admin"))
    await session.commit()
    user = User(
        id=uuid4(),
        tenant_id=TENANT_ID,
        login_id="file-repository-admin",
        name="File Repository Admin",
        role=UserRole.ADMIN,
        is_required_password_reset=False,
    )
    index = Index(tenant_id=TENANT_ID, type=IndexType.SAAS_GLOBAL, name="Index")
    session.add_all([user, index])
    await session.commit()

    file_ids: dict[FileStatus, str] = {}
    for file_status in FileStatus:
        file = File(
            tenant_id=TENANT_ID,
            name=f"{file_status.name}.txt",
            status=file_status,
            user_id=user.id,
            index_id=index.id,
        )
        session.add(file)
        file_ids[file_status] = file.id
    await session.commit()
    return file_ids


class TestFileRepository:
    """ファイルリポジトリのテスト。"""

    class TestFindNotDeletedByIdsAndTenantId:
        """ID群とテナントIDによる未削除ファイル検索のテスト。"""

        async def test_find_not_deleted_by_ids_excludes_deleted_files(
            self, session: AsyncSession
        ) -> None:
            """論理削除済みのファイルを除き、学習中・停止中のファイルだけを返すこと"""
            file_ids = await _create_files(session)

            files = await FileRepository.find_not_deleted_by_ids_and_tenant_id(
                list(file_ids.values()), TENANT_ID, session
            )

            assert {f.id for f in files} == {
                file_ids[FileStatus.ENABLE],
                file_ids[FileStatus.DISABLE],
            }

        async def test_find_not_deleted_by_ids_returns_empty_for_empty_ids(
            self, session: AsyncSession
        ) -> None:
            """ファイルID一覧が空なら空の一覧を返すこと"""
            files = await FileRepository.find_not_deleted_by_ids_and_tenant_id(
                [], TENANT_ID, session
            )

            assert files == []


class TestFindRoomIdsByIndexId:
    """学習先フォルダからルームIDを引くテスト。"""

    async def test_returns_distinct_room_ids_of_the_index(
        self, session: AsyncSession
    ) -> None:
        """フォルダのファイルが持つルームIDを重複なく返し、room_id が NULL のファイルを除くこと"""
        session.add(Tenant(id=TENANT_ID, name="File Repository Test", owner="admin"))
        await session.commit()
        user = User(
            id=uuid4(),
            tenant_id=TENANT_ID,
            login_id="file-repository-admin",
            name="File Repository Admin",
            role=UserRole.ADMIN,
            is_required_password_reset=False,
        )
        target = Index(tenant_id=TENANT_ID, type=IndexType.SAAS_GLOBAL, name="Target")
        other = Index(tenant_id=TENANT_ID, type=IndexType.SAAS_GLOBAL, name="Other")
        assistant = Assistant(
            tenant_id=TENANT_ID,
            type=AssistantType.SAAS_CHAT,
            name="Assistant",
            include_history=False,
        )
        session.add_all([user, target, other, assistant])
        await session.commit()
        rooms = [
            Room(
                tenant_id=TENANT_ID,
                user_id=user.id,
                name=f"r{i}",
                default_assistant_id=assistant.id,
            )
            for i in range(3)
        ]
        session.add_all(rooms)
        await session.commit()
        for index, room_id in [
            (target, rooms[0].id),
            (target, rooms[0].id),
            (target, rooms[1].id),
            (target, None),
            (other, rooms[2].id),
        ]:
            session.add(
                File(
                    tenant_id=TENANT_ID,
                    name="f.txt",
                    status=FileStatus.ENABLE,
                    user_id=user.id,
                    index_id=index.id,
                    room_id=room_id,
                )
            )
        await session.commit()

        room_ids = await FileRepository.find_room_ids_by_index_id(
            TENANT_ID, target.id, session
        )
        other_tenant_room_ids = await FileRepository.find_room_ids_by_index_id(
            "other-tenant", target.id, session
        )

        assert sorted(room_ids) == sorted([rooms[0].id, rooms[1].id])
        assert other_tenant_room_ids == []
