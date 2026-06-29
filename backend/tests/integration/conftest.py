import pytest
from datetime import datetime
from uuid import uuid4

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.security import hash_password
from app.database import Base, get_session
from app.main import app
from app.models.tenant import Tenant
from app.models.user import User
from app.models.password_history import PasswordHistory

DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    """Session-scoped event loop for async tests"""
    import asyncio

    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
async def engine():
    """インメモリ SQLite DB エンジン"""
    engine = create_async_engine(DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def session(engine):
    """DB セッション"""
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as sess:
        yield sess

        # テスト後にテーブルをクリア
        from sqlalchemy import text
        tables = ["password_histories", "users", "tenants"]
        for table in tables:
            await sess.execute(text(f"DELETE FROM {table}"))
        await sess.commit()
        await sess.rollback()


@pytest.fixture
def override_get_session(session):
    """get_session の依存性をオーバーライド"""
    app.dependency_overrides[get_session] = lambda: session
    yield
    app.dependency_overrides.clear()


@pytest.fixture
async def test_tenant(session):
    """テスト用テナント"""
    tenant = Tenant(
        id="test-tenant",
        name="Test Tenant",
        owner="admin",
        pw_policy_min_length=8,
        pw_policy_use_uppercase=True,
        pw_policy_use_lowercase=True,
        pw_policy_use_digits=True,
        pw_policy_use_symbols=True,
        pw_histories_limit=3,
    )
    session.add(tenant)
    await session.flush()
    await session.refresh(tenant)
    return tenant


@pytest.fixture
async def test_user(session, test_tenant):
    """テスト用ユーザー（パスワード未設定）"""
    user = User(
        id=uuid4(),
        tenant_id=test_tenant.id,
        login_id="testuser",
        name="Test User",
        role="USER",
        is_required_password_reset=False,
    )
    session.add(user)
    await session.flush()
    await session.refresh(user)
    return user


@pytest.fixture
async def test_user_with_password(session, test_tenant, test_user):
    """テスト用ユーザー（パスワード設定済み）"""
    plain_password = "TestPassword123!"
    hashed_password = hash_password(plain_password)

    password_history = PasswordHistory(
        tenant_id=test_tenant.id,
        user_id=test_user.id,
        password=hashed_password,
        created_at=datetime.utcnow(),
    )
    session.add(password_history)
    await session.flush()
    await session.refresh(password_history)

    return {
        "user": test_user,
        "plain_password": plain_password,
        "hashed_password": hashed_password,
    }
