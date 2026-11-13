from typing import Any

from pydantic import AliasChoices, BaseModel, Field, model_validator


class LoginRequest(BaseModel):
    """ログインリクエスト"""

    username: str
    password: str


class LoginKeyRequest(BaseModel):
    """ログインキー認証リクエスト"""

    # 移植元は null・空白でも 400 にせず、ユーザーが見つからない扱い（401）にする。
    loginKey: str | None = None


# 移植元`PasswordResetRequest`の`@NotBlank`の検査順とメッセージ。
# 各項目は（受け付けるキー名, メッセージ）。
_PASSWORD_RESET_REQUIRED_FIELDS: tuple[tuple[tuple[str, ...], str], ...] = (
    (("loginId", "username"), "ログインIDの入力は必須です。"),
    (("oldPassword",), "旧パスワードの入力は必須です。"),
    (("newPassword",), "新パスワードの入力は必須です。"),
)


class PasswordResetRequest(BaseModel):
    """パスワードリセットリクエスト"""

    # 移植元は @JsonAlias("username") で username キーも受け付ける。
    # 移植元クライアント(secuaigent/client) は username で送信するため、両方を許容する。
    loginId: str = Field(
        validation_alias=AliasChoices("loginId", "username"),
        description="ログインID (username も許容)",
    )
    oldPassword: str
    newPassword: str

    @model_validator(mode="before")
    @classmethod
    def _validate_not_blank(cls, data: Any) -> Any:
        """移植元`@NotBlank`と同じく、未指定・null・空白のみの項目を拒否する。

        `field_validator`は未指定の項目に対して実行されず、Pydantic標準の
        `Field required`になってしまうため、項目の型チェックより前に検査する。

        Args:
            data: リクエストボディ（JSONをデコードした値）。

        Returns:
            検査済みのリクエストボディ（そのまま返す）。

        Raises:
            ValueError: 必須項目が未指定・null・空白のみの場合。最初の1項目のメッセージ。
        """
        if not isinstance(data, dict):
            return data
        for keys, message in _PASSWORD_RESET_REQUIRED_FIELDS:
            # loginId と username の両方がある場合は AliasChoices と同じく loginId を見る
            value = next((data[key] for key in keys if key in data), None)
            if value is None or (isinstance(value, str) and not value.strip()):
                raise ValueError(message)
        return data


class AuthGroupResponse(BaseModel):
    """所属グループ1件分（移植元 `AuthGroupResponse`）。"""

    groupId: str
    groupAdmin: bool


class AuthResponse(BaseModel):
    """認証レスポンス（ログイン・トークン取得・パスワードリセット）。

    移植元 `AuthResponse` は `@JsonInclude(NON_NULL)` のため、ルーターは
    `response_model_exclude_none=True` で返し、None の項目は応答に出さない。
    `loginStatus` を返すのは `/auth/login` だけ。パスワード再設定が必要なときは
    `token`・`groups` も出さない。
    """

    id: str
    name: str
    role: str
    token: str | None = None
    groups: list[AuthGroupResponse] | None = None
    loginStatus: str | None = None
    reason: str | None = None

    class Config:
        from_attributes = True
