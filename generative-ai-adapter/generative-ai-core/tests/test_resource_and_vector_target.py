"""導出するリソース名と、ベクトルDB の接続先のテスト。

移植元 `CoreDerivedResourceNameResolver`・`CoreVectorDbTarget`・`PgVectorPgroongaReadinessResources`
の挙動（テーブル名からの導出、予約語・長さのハッシュ、`host[:port]` の分解）を確かめる。
"""

import pytest
from generative_ai_core.resource import (
    CoreDerivedResourceNameResolver,
    CoreDerivedResourceTargetKind,
)
from generative_ai_core.vector.target import (
    CoreVectorDbTarget,
    parse_endpoint,
    pgroonga_content_index_name,
    safe_identifier,
)

RESOLVER = CoreDerivedResourceNameResolver()
AGE = CoreDerivedResourceTargetKind.AGE_GRAPH


def test_resolver_uses_explicit_name_when_valid() -> None:
    """明示された名前が規則に合えば、そのまま使うこと"""
    assert RESOLVER.resolve("any table", AGE, " my_graph ") == "my_graph"


def test_resolver_rejects_unsafe_explicit_name() -> None:
    """明示された名前が規則に合わなければ unsafe-derived-name で失敗すること"""
    with pytest.raises(ValueError, match="age-graph is unsafe-derived-name"):
        RESOLVER.resolve("t", AGE, "Bad-Name")


def test_resolver_derives_name_from_table() -> None:
    """テーブル名を小文字・区切り文字に正規化して導出すること"""
    assert RESOLVER.resolve("Vector Table-01", AGE, None) == "vector_table_01"
    assert (
        RESOLVER.resolve(
            "Vector Table", CoreDerivedResourceTargetKind.AZURE_SEARCH_INDEX, None
        )
        == "vector-table"
    )


def test_resolver_prefixes_digit_start_and_hashes_reserved_word() -> None:
    """数字で始まる名前には接頭辞を、予約語には末尾にハッシュを付けること"""
    assert RESOLVER.resolve("2024data", AGE, None) == "t_2024data"
    reserved = RESOLVER.resolve("select", AGE, None)
    assert reserved.startswith("select_")
    assert len(reserved) == len("select_") + 8


def test_resolver_hashes_overlong_name_within_limit() -> None:
    """長すぎる名前は最大長に収まるようハッシュ付きになること"""
    name = RESOLVER.resolve("a" * 100, AGE, None)

    assert len(name) <= 63
    assert AGE.is_valid(name)


@pytest.mark.parametrize("table", [None, "", "  "])
def test_resolver_requires_table_name(table: str | None) -> None:
    """テーブル名がなければ失敗すること"""
    with pytest.raises(ValueError, match="tableName is missing"):
        RESOLVER.resolve(table, AGE, None)


def test_resolver_rejects_table_with_no_ascii_alnum() -> None:
    """英数字がまったくないテーブル名は安全な名前にできず失敗すること"""
    with pytest.raises(ValueError, match="tableName is unsafe-derived-name"):
        RESOLVER.resolve("日本語", AGE, None)


@pytest.mark.parametrize(
    ("value", "host", "port"),
    [
        ("db.example", "db.example", None),
        ("db.example:5433", "db.example", 5433),
        ("[::1]:5432", "::1", 5432),
        ("[::1]", "[::1]", None),
        ("a:b:5432", "a:b:5432", None),
    ],
)
def test_parse_endpoint(value: str, host: str, port: int | None) -> None:
    """host・host:port・[ipv6]:port を分けること"""
    endpoint = parse_endpoint(value)

    assert (endpoint.host, endpoint.port) == (host, port)
    assert endpoint.port_or_default(5432) == (port or 5432)


def test_parse_endpoint_rejects_out_of_range_port() -> None:
    """ポートが 1〜65535 の範囲外なら失敗すること"""
    with pytest.raises(ValueError, match="between 1 and 65535"):
        parse_endpoint("db:70000")


def test_target_normalizes_and_hides_secrets() -> None:
    """接続先は空白を除き、文字列表現では API キーとパスワードを伏せること"""
    target = CoreVectorDbTarget.pg_vector(
        " db:5432 ", " user ", " pw secret ", " d ", " t ", False
    )

    assert target.endpoint == "db:5432"
    assert target.password == " pw secret "
    assert "pw secret" not in str(target)
    assert "pw secret" not in repr(target)
    assert target.required_table_name() == "t"


def test_target_required_fields_fail_when_blank() -> None:
    """必須項目が空なら must not be blank で失敗すること"""
    target = CoreVectorDbTarget.azure_ai_search("https://x", "", "idx")

    assert target.required_endpoint() == "https://x"
    with pytest.raises(ValueError, match="apiKey must not be blank"):
        target.required_api_key()
    with pytest.raises(ValueError, match="userName must not be blank"):
        target.required_user_name()


def test_safe_identifier_lowercases_and_rejects_unsafe() -> None:
    """識別子は小文字にし、英数字と _ 以外・先頭が数字のものは拒否すること"""
    assert safe_identifier(" My_Table ") == "my_table"
    for bad in ("1abc", "a-b", "a b", "", None, "x" * 64):
        with pytest.raises(ValueError, match="must match"):
            safe_identifier(bad)


def test_pgroonga_index_name_truncates_long_table() -> None:
    """PGroonga のインデックス名は 63 文字に収め、接尾辞は残すこと"""
    assert pgroonga_content_index_name("vectors") == "vectors_pgroonga_content_idx"
    long_name = pgroonga_content_index_name("a" * 63)
    assert len(long_name) == 63
    assert long_name.endswith("_pgroonga_content_idx")
