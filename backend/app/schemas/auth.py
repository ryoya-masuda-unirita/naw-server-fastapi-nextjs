from typing import Annotated

from pydantic import AliasChoices, BaseModel, Field

from app.core.validation_messages import RequestModel, ValidationMessages


class LoginRequest(BaseModel):
    """ログインリクエスト"""

    username: str
    password: str


class LoginKeyRequest(BaseModel):
    """ログインキー認証リクエスト"""

    loginKey: str


class PasswordResetRequest(RequestModel):
    """パスワードリセットリクエスト"""

    # 移植元は @JsonAlias("username") で username キーも受け付ける。
    # 移植元クライアント(secuaigent/client) は username で送信するため、両方を許容する。
    loginId: Annotated[
        str,
        Field(
            validation_alias=AliasChoices("loginId", "username"),
            description="ログインID (username も許容)",
        ),
        ValidationMessages(not_blank="ログインIDの入力は必須です。"),
    ]
    oldPassword: Annotated[
        str, ValidationMessages(not_blank="旧パスワードの入力は必須です。")
    ]
    newPassword: Annotated[
        str, ValidationMessages(not_blank="新パスワードの入力は必須です。")
    ]


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
