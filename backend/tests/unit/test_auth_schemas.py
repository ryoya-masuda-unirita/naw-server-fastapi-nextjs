import pytest
from pydantic import ValidationError

from app.schemas.auth import PasswordResetRequest

FIXTURE_PASSWORDS = {"oldPassword": "OldPassword1!", "newPassword": "NewPassword1!"}
LOGIN_ID_REQUIRED_MESSAGE = "ログインIDの入力は必須です。"
# 項目自体を送らない場合を表す目印
_MISSING = object()


class TestPasswordResetRequest:
    """PasswordResetRequest のキー名受け付けテスト"""

    def test_accepts_login_id_key(self):
        """loginId キーでログインIDを受け取れること"""
        request = PasswordResetRequest.model_validate(
            {"loginId": "user01", **FIXTURE_PASSWORDS}
        )

        assert request.loginId == "user01"

    def test_accepts_username_key(self):
        """username キーでもログインIDを受け取れること（移植元の @JsonAlias 相当）"""
        request = PasswordResetRequest.model_validate(
            {"username": "user01", **FIXTURE_PASSWORDS}
        )

        assert request.loginId == "user01"

    def test_prefers_login_id_when_both_keys_given(self):
        """loginId と username の両方がある場合は loginId を優先すること"""
        request = PasswordResetRequest.model_validate(
            {
                "loginId": "from-login-id",
                "username": "from-username",
                **FIXTURE_PASSWORDS,
            }
        )

        assert request.loginId == "from-login-id"

    def test_raises_when_login_id_missing(self):
        """loginId・username のどちらもない場合は入力エラーになること"""
        with pytest.raises(ValidationError, match=LOGIN_ID_REQUIRED_MESSAGE):
            PasswordResetRequest.model_validate(FIXTURE_PASSWORDS)

    @pytest.mark.parametrize(
        ("field", "message"),
        [
            ("loginId", LOGIN_ID_REQUIRED_MESSAGE),
            ("oldPassword", "旧パスワードの入力は必須です。"),
            ("newPassword", "新パスワードの入力は必須です。"),
        ],
    )
    @pytest.mark.parametrize("blank_value", [_MISSING, None, "", "   "])
    def test_raises_not_blank_message(self, field, message, blank_value):
        """各項目が未指定・null・空文字・空白のみなら移植元の @NotBlank のメッセージになること"""
        data: dict[str, object] = {"loginId": "user01", **FIXTURE_PASSWORDS}
        if blank_value is _MISSING:
            del data[field]
        else:
            data[field] = blank_value

        with pytest.raises(ValidationError, match=message):
            PasswordResetRequest.model_validate(data)

    def test_raises_login_id_message_when_username_blank(self):
        """username キーで空のログインIDを送るとログインIDの必須エラーになること"""
        with pytest.raises(ValidationError, match=LOGIN_ID_REQUIRED_MESSAGE):
            PasswordResetRequest.model_validate({"username": "", **FIXTURE_PASSWORDS})

    def test_reports_login_id_first_when_all_blank(self):
        """全項目が空ならログインIDのエラーだけを返すこと"""
        with pytest.raises(ValidationError) as exc_info:
            PasswordResetRequest.model_validate(
                {"loginId": "", "oldPassword": "", "newPassword": ""}
            )

        errors = exc_info.value.errors()
        assert len(errors) == 1
        assert LOGIN_ID_REQUIRED_MESSAGE in errors[0]["msg"]
