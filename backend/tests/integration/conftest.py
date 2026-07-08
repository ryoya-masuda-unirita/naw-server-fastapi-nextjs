from datetime import datetime
from uuid import uuid4

import jwt
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.security import ALGORITHM, SECRET_KEY, create_access_token, hash_password
from app.core.database import Base, get_session
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
    _engine = create_async_engine(DATABASE_URL, echo=False)

    # SQLite はデフォルトで外部キー制約を無効にするため接続ごとに有効化する
    @event.listens_for(_engine.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield _engine
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await _engine.dispose()


@pytest.fixture
async def session(engine):
    """DB セッション"""
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as sess:
        yield sess

        # テスト後にテーブルをクリア
        # IntegrityError 等でセッションが中断された場合に備えてロールバックで回復する
        from sqlalchemy import text

        await sess.rollback()
        tables = [
            "library_tag_mappings",
            "share_libraries",
            "libraries",
            "library_tags",
            "ai_models",
            "message_files",
            "message_feedbacks",
            "message_contents",
            "messages",
            "share_rooms",
            "shares",
            "room_pins",
            "rooms",
            "assistant_category_mappings",
            "assistant_categories",
            "assistants_endpoints",
            "tenant_endpoints",
            "groups_assistants",
            "assistants",
            "groups_users",
            "groups",
            "password_histories",
            "users",
            "tenants",
        ]
        for table in tables:
            await sess.execute(text(f"DELETE FROM {table}"))
        await sess.commit()


@pytest.fixture
def override_get_session(session):
    """get_session の依存性をオーバーライド"""
    app.dependency_overrides[get_session] = lambda: session
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client(override_get_session):
    """ASGITransport を利用したテストクライアント"""
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


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


@pytest.fixture
def valid_jwt_token(test_user, test_tenant):
    """有効な JWT トークン"""
    return create_access_token(test_user.login_id, test_tenant.id)


@pytest.fixture
def expired_jwt_token(test_user, test_tenant):
    """有効期限切れ JWT"""
    payload = {
        "sub": test_user.login_id,
        "tenantId": test_tenant.id,
        "exp": 1,
        "iat": 0,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


@pytest.fixture
def invalid_jwt_token(test_tenant):
    """不正な JWT（異なる秘密鍵で生成）"""
    payload = {
        "sub": "testuser",
        "tenantId": test_tenant.id,
        "exp": 4102444800,
        "iat": 0,
    }
    return jwt.encode(payload, "wrong-secret-key", algorithm=ALGORITHM)
