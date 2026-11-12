from pydantic import AliasChoices, BaseModel, Field


class LoginRequest(BaseModel):
    """ログインリクエスト"""

    username: str
    password: str


class LoginKeyRequest(BaseModel):
    """ログインキー認証リクエスト"""

    loginKey: str


class PasswordResetRequest(BaseModel):
    """パスワードリセットリクエスト"""

    # 移植元は @JsonAlias("username") で username キーも受け付ける。
    # frontend-angular は username で送信するため、両方を許容する。
    loginId: str = Field(
        validation_alias=AliasChoices("loginId", "username"),
        description="ログインID (username も許容)",
    )
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
