"""移植元 CoreDerivedResourceNameResolverTest の移植。"""

import pytest
from generative_ai_core.resource import (
    CoreDerivedResourceNameResolver,
    CoreDerivedResourceNameValidator,
    CoreDerivedResourceTargetKind,
)

AGE = CoreDerivedResourceTargetKind.AGE_GRAPH
PG_INDEX = CoreDerivedResourceTargetKind.POSTGRES_INDEX
AZURE_INDEX = CoreDerivedResourceTargetKind.AZURE_SEARCH_INDEX


def test_resolve_returns_trimmed_explicit_name() -> None:
    """明示された名前は前後の空白を除いてそのまま使うこと"""
    assert CoreDerivedResourceNameResolver().resolve("table", AGE, " explicit ") == (
        "explicit"
    )


def test_resolve_normalizes_accents_case_and_symbols() -> None:
    """アクセントを外し、小文字にして記号を区切り文字にすること"""
    resolver = CoreDerivedResourceNameResolver()
    assert resolver.resolve("Café Table", PG_INDEX, None) == "cafe_table"
    assert resolver.resolve("Café Table", AZURE_INDEX, None) == "cafe-table"


def test_resolve_prefixes_names_starting_with_digit() -> None:
    """数字で始まる名前には t と区切り文字を前置すること"""
    assert (
        CoreDerivedResourceNameResolver().resolve("123 table", AGE, "").startswith("t_")
    )


def test_resolve_adds_hash_to_reserved_word() -> None:
    """予約語はハッシュを付けて衝突を避けること"""
    resolved = CoreDerivedResourceNameResolver().resolve("select", AGE, None)
    assert resolved.startswith("select_")
    assert resolved != "select"


def test_resolve_hash_is_stable_for_same_input() -> None:
    """同じ入力からは同じ名前が決まること"""
    resolver = CoreDerivedResourceNameResolver()
    assert resolver.resolve("select", AGE, None) == resolver.resolve(
        "select", AGE, None
    )


def test_resolve_limits_long_names_to_max_length() -> None:
    """長すぎる名前は最大長に収まるようにハッシュ付きで切り詰めること"""
    resolver = CoreDerivedResourceNameResolver()
    assert len(resolver.resolve("x" * 200, AZURE_INDEX, None)) <= 128
    assert len(resolver.resolve("x" * 200, AGE, None)) <= 63


def test_resolve_rejects_missing_table_name() -> None:
    """テーブル名がないとエラーになること"""
    with pytest.raises(ValueError, match="tableName is missing"):
        CoreDerivedResourceNameResolver().resolve(None, AGE, None)


def test_resolve_rejects_missing_kind() -> None:
    """種類がないとエラーになること"""
    with pytest.raises(ValueError, match="targetKind"):
        CoreDerivedResourceNameResolver().resolve("table", None, None)


def test_resolve_rejects_invalid_explicit_name() -> None:
    """規則に合わない明示名はエラーになること"""
    with pytest.raises(ValueError, match="age-graph is unsafe-derived-name"):
        CoreDerivedResourceNameResolver().resolve("table", AGE, "bad-name")


def test_resolve_rejects_name_without_ascii_letters_or_digits() -> None:
    """英数字が残らない名前（日本語のみ）はエラーになること"""
    with pytest.raises(ValueError, match="tableName is unsafe-derived-name"):
        CoreDerivedResourceNameResolver().resolve("日本語", AGE, None)


def test_validator_accepts_blank_explicit_name() -> None:
    """空の明示名は検証を通ること"""
    CoreDerivedResourceNameValidator.validate_explicit_name(None, AGE)
    CoreDerivedResourceNameValidator.validate_explicit_name(" ", AGE)


def test_validator_rejects_invalid_resolved_name() -> None:
    """規則に合わない決定済みの名前はエラーになること"""
    with pytest.raises(ValueError, match="unsafe-derived-name"):
        CoreDerivedResourceNameValidator.validate_resolved_name("bad-name", AGE)


def test_target_kind_exposes_contract() -> None:
    """種類が契約名・最大長・区切り文字を持つこと"""
    assert AGE.contract_name == "age-graph"
    assert AGE.max_length == 63
    assert AGE.separator == "_"
    assert AZURE_INDEX.max_length == 128
    assert AZURE_INDEX.separator == "-"
