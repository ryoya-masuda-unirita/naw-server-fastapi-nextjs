from pydantic import BaseModel


class LoginRequest(BaseModel):
    """ログインリクエスト"""

    username: str
    password: str


class LoginKeyRequest(BaseModel):
    """ログインキー認証リクエスト"""

    loginKey: str


class PasswordResetRequest(BaseModel):
    """パスワードリセットリクエスト"""

    loginId: str
    oldPassword: str
    newPassword: str


class AuthGroupResponse(BaseModel):
    """グループレスポンス"""

    id: str
    name: str


class AuthResponse(BaseModel):
    """認証レスポンス（ログイン・トークン取得・パスワードリセット）"""

    id: str
    name: str
    role: str
    token: str | None = None
    groups: list[AuthGroupResponse] = []
    loginStatus: str = "SUCCESS"
    reason: str | None = None

    class Config:
        from_attributes = True
