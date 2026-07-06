import uuid

import pytest
import sqlalchemy.exc

from app.models.tenant import Tenant
from app.models.user import User, UserRole


class TestTenantModel:
    class TestInsert:
        @pytest.mark.asyncio
        async def test_insert_tenant(self, session):
            """テナントをインサートできること"""
            tenant = Tenant(id="t1", name="テナント1", owner="owner1")
            session.add(tenant)
            await session.commit()
            result = await session.get(Tenant, "t1")
            assert result is not None
            assert result.name == "テナント1"

        @pytest.mark.asyncio
        async def test_default_values(self, session):
            """デフォルト値が正しく設定されること"""
            tenant = Tenant(id="t2", name="テナント2", owner="owner2")
            session.add(tenant)
            await session.commit()
            result = await session.get(Tenant, "t2")
            assert result.is_deleted is False
            assert result.pw_policy_min_length == 12
            assert result.pw_policy_use_uppercase is True
            assert result.pw_histories_limit == 1
            assert result.max_usage_based_credits_per_month == 0

    class TestConstraints:
        @pytest.mark.asyncio
        async def test_check_constraint_pw_histories_limit_zero(self, session):
            """pw_histories_limit が 0 で CHECK 制約違反になること"""
            tenant = Tenant(
                id="t3", name="テナント3", owner="owner3", pw_histories_limit=0
            )
            session.add(tenant)
            with pytest.raises(sqlalchemy.exc.IntegrityError):
                await session.commit()

        @pytest.mark.asyncio
        async def test_primary_key_duplicate(self, session):
            """id が重複すると PK 制約違反になること"""
            t1 = Tenant(id="dup", name="テナントA", owner="owner")
            t2 = Tenant(id="dup", name="テナントB", owner="owner")
            session.add(t1)
            await session.commit()
            session.add(t2)
            with pytest.raises(sqlalchemy.exc.IntegrityError):
                await session.commit()


class TestUserModel:
    class TestInsert:
        @pytest.mark.asyncio
        async def test_insert_user(self, session):
            """ユーザーをインサートできること"""
            tenant = Tenant(id="ut1", name="テナント", owner="owner")
            session.add(tenant)
            await session.commit()

            user = User(
                login_id="user01",
                tenant_id="ut1",
                name="ユーザー1",
                password="hashed",
                role=UserRole.USER,
            )
            session.add(user)
            await session.commit()

            result = await session.get(User, user.id)
            assert result is not None
            assert result.login_id == "user01"

        @pytest.mark.asyncio
        async def test_id_auto_generated_as_uuid(self, session):
            """id が UUID として自動生成されること"""
            tenant = Tenant(id="ut2", name="テナント", owner="owner")
            session.add(tenant)
            await session.commit()

            user = User(
                login_id="user02",
                tenant_id="ut2",
                name="ユーザー2",
                password="hashed",
                role=UserRole.ADMIN,
            )
            session.add(user)
            await session.commit()

            assert isinstance(user.id, uuid.UUID)

        @pytest.mark.asyncio
        async def test_is_required_password_reset_default_true(self, session):
            """is_required_password_reset のデフォルトが True であること"""
            tenant = Tenant(id="ut3", name="テナント", owner="owner")
            session.add(tenant)
            await session.commit()

            user = User(
                login_id="user03",
                tenant_id="ut3",
                name="ユーザー3",
                password="hashed",
                role=UserRole.USER,
            )
            session.add(user)
            await session.commit()

            result = await session.get(User, user.id)
            assert result.is_required_password_reset is True

    class TestConstraints:
        @pytest.mark.asyncio
        async def test_unique_constraint_login_id_tenant_id(self, session):
            """login_id と tenant_id の重複で UNIQUE 制約違反になること"""
            tenant = Tenant(id="uc1", name="テナント", owner="owner")
            session.add(tenant)
            await session.commit()

            u1 = User(
                login_id="dup",
                tenant_id="uc1",
                name="U1",
                password="p",
                role=UserRole.USER,
            )
            u2 = User(
                login_id="dup",
                tenant_id="uc1",
                name="U2",
                password="p",
                role=UserRole.USER,
            )
            session.add(u1)
            await session.commit()
            session.add(u2)
            with pytest.raises(sqlalchemy.exc.IntegrityError):
                await session.commit()

        @pytest.mark.asyncio
        async def test_foreign_key_constraint_nonexistent_tenant(self, session):
            """存在しない tenant_id で FK 制約違反になること"""
            user = User(
                login_id="orphan",
                tenant_id="nonexistent",
                name="孤立ユーザー",
                password="p",
                role=UserRole.USER,
            )
            session.add(user)
            with pytest.raises(sqlalchemy.exc.IntegrityError):
                await session.commit()

        @pytest.mark.asyncio
        async def test_cascade_delete_user_on_tenant_delete(self, session):
            """テナント削除時にユーザーが CASCADE 削除されること"""
            tenant = Tenant(id="uc2", name="テナント", owner="owner")
            session.add(tenant)
            await session.commit()

            user = User(
                login_id="u",
                tenant_id="uc2",
                name="U",
                password="p",
                role=UserRole.USER,
            )
            session.add(user)
            await session.commit()
            user_id = user.id

            await session.delete(tenant)
            await session.commit()
            session.expire_all()  # expire_on_commit=False のためキャッシュを手動でクリア

            result = await session.get(User, user_id)
            assert result is None
