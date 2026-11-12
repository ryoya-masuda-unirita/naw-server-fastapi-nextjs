import pytest
from pydantic import ValidationError

from app.schemas.auth import PasswordResetRequest

FIXTURE_PASSWORDS = {"oldPassword": "OldPassword1!", "newPassword": "NewPassword1!"}


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
        with pytest.raises(ValidationError):
            PasswordResetRequest.model_validate(FIXTURE_PASSWORDS)
