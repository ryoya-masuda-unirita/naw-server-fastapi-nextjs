import sys
from pathlib import Path

# backend ディレクトリを Python パスに追加
backend_dir = Path(__file__).parent.parent.parent
sys.path.insert(0, str(backend_dir))

import pytest
from datetime import datetime, timedelta
from uuid import uuid4

import jwt

from app.core.security import hash_password, create_access_token, SECRET_KEY, ALGORITHM
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.models.password_history import PasswordHistory


@pytest.fixture
def test_tenant():
    """テスト用テナント（DB なし）"""
    return Tenant(
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


@pytest.fixture
def test_user(test_tenant):
    """テスト用ユーザー（DB なし）"""
    return User(
        id=uuid4(),
        tenant_id=test_tenant.id,
        login_id="testuser",
        name="Test User",
        role=UserRole.USER,
        is_required_password_reset=False,
    )


@pytest.fixture
def test_user_with_password(test_tenant, test_user):
    """テスト用ユーザー（パスワード設定済み、DB なし）"""
    plain_password = "TestPassword123!"
    hashed_password = hash_password(plain_password)

    return {
        "user": test_user,
        "plain_password": plain_password,
        "hashed_password": hashed_password,
    }


@pytest.fixture
def valid_jwt_token(test_user):
    """有効な JWT トークン"""
    return create_access_token(test_user.login_id, "test-tenant")


@pytest.fixture
def expired_jwt_token(test_user):
    """有効期限切れ JWT"""
    payload = {
        "sub": test_user.login_id,
        "tenantId": "test-tenant",
        "exp": datetime.utcnow() - timedelta(hours=1),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


@pytest.fixture
def invalid_jwt_token():
    """不正な JWT（署名が違う秘密鍵で生成）"""
    payload = {
        "sub": "testuser",
        "tenantId": "test-tenant",
        "exp": datetime.utcnow() + timedelta(hours=5),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, "wrong-secret-key", algorithm=ALGORITHM)
