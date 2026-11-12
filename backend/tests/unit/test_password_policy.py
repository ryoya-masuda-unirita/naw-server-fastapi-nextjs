from itertools import product

import pytest
from fastapi import HTTPException

from app.core.password_policy import verify_password_strength
from app.models.tenant import Tenant

MIN_LENGTH = 8
VALID_SYMBOLS = "!@#$%^&*"
# どの文字種にも当たらない（使用可能な記号にも含まれない）埋め文字
FILLER = "~"

# 文字種ごとの代表文字と、欠けているときのメッセージ
CHAR_TYPES: dict[str, tuple[str, str]] = {
    "uppercase": ("A", "新パスワードには大文字を含めてください。"),
    "lowercase": ("a", "新パスワードには小文字を含めてください。"),
    "digits": ("1", "新パスワードには数字を含めてください。"),
    "symbols": (
        "!",
        f"新パスワードには次の記号のいずれかを含めてください: {VALID_SYMBOLS}",
    ),
}

# 大文字・小文字・数字・記号の有効/無効 16 通り
FLAG_COMBINATIONS: list[dict[str, bool]] = [
    dict(zip(CHAR_TYPES, flags)) for flags in product([True, False], repeat=4)
]


def _missing_type_cases() -> list[tuple[dict[str, bool], str]]:
    """有効な文字種のうち 1 つを欠いたケースを列挙する。

    Returns:
        (フラグの組み合わせ, 欠く文字種) のリスト（16 通り × 有効な文字種数 = 32 ケース）。
    """
    cases: list[tuple[dict[str, bool], str]] = []
    for flags in FLAG_COMBINATIONS:
        for char_type, enabled in flags.items():
            if enabled:
                cases.append((flags, char_type))
    return cases


MISSING_TYPE_CASES: list[tuple[dict[str, bool], str]] = _missing_type_cases()


def _flags_id(flags: dict[str, bool]) -> str:
    """parametrize の ID 用に、有効な文字種を "+" でつないだ文字列を返す。

    Args:
        flags: 文字種ごとの有効/無効。

    Returns:
        例: "uppercase+digits"。すべて無効なら "none"。
    """
    return "+".join(t for t, on in flags.items() if on) or "none"


def _make_tenant(
    *,
    uppercase: bool = True,
    lowercase: bool = True,
    digits: bool = True,
    symbols: bool = True,
    valid_symbols: str = VALID_SYMBOLS,
) -> Tenant:
    """パスワードポリシーを指定したテスト用テナントを生成する。

    Args:
        uppercase: 大文字必須にするか。
        lowercase: 小文字必須にするか。
        digits: 数字必須にするか。
        symbols: 記号必須にするか。
        valid_symbols: 使用可能な記号。

    Returns:
        テスト用テナント。
    """
    return Tenant(
        id="test-tenant",
        name="Test Tenant",
        owner="admin",
        pw_policy_min_length=MIN_LENGTH,
        pw_policy_use_uppercase=uppercase,
        pw_policy_use_lowercase=lowercase,
        pw_policy_use_digits=digits,
        pw_policy_use_symbols=symbols,
        pw_policy_valid_symbols=valid_symbols,
    )


def _build_password(char_types: list[str]) -> str:
    """指定した文字種の代表文字を含み、最小文字数まで埋め文字で埋めたパスワードを作る。

    Args:
        char_types: 含める文字種の名前。

    Returns:
        生成したパスワード。
    """
    return "".join(CHAR_TYPES[t][0] for t in char_types).ljust(MIN_LENGTH, FILLER)


def _assert_policy_error(password: str, tenant: Tenant, message: str) -> None:
    """ポリシー違反として 400 と期待するメッセージが返ることを確認する。

    Args:
        password: 検証するパスワード。
        tenant: パスワードポリシーを持つテナント。
        message: 期待するエラーメッセージ。
    """
    with pytest.raises(HTTPException) as exc_info:
        verify_password_strength(password, tenant)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == message


class TestVerifyPasswordStrength:
    """verify_password_strength のパスワードポリシー検証テスト"""

    def test_accepts_password_meeting_all_requirements(self):
        """全要件を満たすパスワードは受け付けること"""
        verify_password_strength("Abcdef1!", _make_tenant())

    def test_rejects_blank_password(self):
        """空白のみのパスワードは必須エラーになること"""
        _assert_policy_error(
            " " * MIN_LENGTH, _make_tenant(), "新パスワードの入力は必須です。"
        )

    def test_rejects_too_short_password(self):
        """最小文字数未満のパスワードは文字数エラーになること"""
        _assert_policy_error(
            "Ab1!", _make_tenant(), "新パスワードは8文字以上で入力してください。"
        )

    def test_rejects_password_without_uppercase(self):
        """大文字必須で大文字を含まないパスワードはエラーになること"""
        _assert_policy_error("abcdef1!", _make_tenant(), CHAR_TYPES["uppercase"][1])

    def test_rejects_password_without_lowercase(self):
        """小文字必須で小文字を含まないパスワードはエラーになること"""
        _assert_policy_error("ABCDEF1!", _make_tenant(), CHAR_TYPES["lowercase"][1])

    def test_rejects_password_without_digit(self):
        """数字必須で数字を含まないパスワードはエラーになること"""
        _assert_policy_error("Abcdefg!", _make_tenant(), CHAR_TYPES["digits"][1])

    def test_rejects_password_without_valid_symbol(self):
        """使用可能でない記号しか含まないパスワードは記号エラーになること"""
        _assert_policy_error("Abcdef1?", _make_tenant(), CHAR_TYPES["symbols"][1])

    def test_rejects_when_valid_symbols_empty(self):
        """記号必須で使用可能な記号が未設定なら記号要件エラーになること"""
        _assert_policy_error(
            "Abcdef1!",
            _make_tenant(valid_symbols=""),
            "新パスワードの記号要件を満たせません。",
        )

    def test_reports_first_violation_in_source_order(self):
        """複数の要件に違反する場合は移植元と同じ順序で最初の違反を返すこと"""
        _assert_policy_error("12345678", _make_tenant(), CHAR_TYPES["uppercase"][1])

    def test_rejects_non_ascii_digit_like_superscript(self):
        """上付き数字は数字として扱わないこと（Java の isDigit と同じ判定）"""
        _assert_policy_error("Abcdef²!", _make_tenant(), CHAR_TYPES["digits"][1])

    def test_accepts_digits_only_when_only_digits_required(self):
        """数字のみ必須のポリシーなら数字だけのパスワードを受け付けること"""
        tenant = _make_tenant(uppercase=False, lowercase=False, symbols=False)

        verify_password_strength("12345678", tenant)

    @pytest.mark.parametrize("flags", FLAG_COMBINATIONS, ids=_flags_id)
    def test_accepts_password_with_enabled_char_types(self, flags):
        """16 通りの組み合わせで、有効な文字種をすべて含むパスワードは受け付けること"""
        enabled = [t for t, on in flags.items() if on]

        verify_password_strength(_build_password(enabled), _make_tenant(**flags))

    @pytest.mark.parametrize(
        ("flags", "missing"),
        MISSING_TYPE_CASES,
        ids=[f"{_flags_id(f)}-missing-{m}" for f, m in MISSING_TYPE_CASES],
    )
    def test_rejects_password_missing_enabled_char_type(self, flags, missing):
        """16 通りの組み合わせで、有効な文字種を 1 つ欠いたパスワードはその文字種のエラーになること"""
        others = [t for t, on in flags.items() if on and t != missing]

        _assert_policy_error(
            _build_password(others), _make_tenant(**flags), CHAR_TYPES[missing][1]
        )
