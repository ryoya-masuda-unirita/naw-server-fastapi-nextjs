import pytest
from sqlalchemy import Column, Enum, Integer, MetaData, String, Table, select
from sqlalchemy.dialects import postgresql

from app.core.sort import (
    SortOrder,
    build_order_by,
    enum_as_string,
    find_order,
    parse_sort,
    sort_query,
)
from typing import Any

_items = Table(
    "items",
    MetaData(),
    Column("id", Integer, primary_key=True),
    Column("name", String),
    Column("updated_at", String),
    Column("kind", Enum("SECURE", "SAAS_CHAT", name="itemkind")),
)
_COLUMNS = {"name": _items.c.name, "updatedAt": _items.c.updated_at}


def _order_by_sql(clauses: list) -> str:
    """ORDER BY 句の SQL 文字列を返す。

    Parameters
    ----------
    clauses : list
        ORDER BY に渡す句のリスト。

    Returns
    -------
    str
        PostgreSQL 向けにコンパイルした ORDER BY 以降の SQL。
    """
    sql = str(
        select(_items.c.id).order_by(*clauses).compile(dialect=postgresql.dialect())
    )
    return sql.split("ORDER BY ", 1)[1]


class TestParseSort:
    """parse_sort のテスト"""

    def test_parses_property_and_direction(self) -> None:
        """「キー,方向」をキーと方向に分けること"""
        assert parse_sort("name,desc") == [SortOrder("name", descending=True)]

    @pytest.mark.parametrize(
        ("value", "descending"),
        [("name,DESC", True), ("name,Desc", True), ("name,ASC", False)],
    )
    def test_direction_is_case_insensitive(self, value: str, descending: bool) -> None:
        """方向は大文字小文字を区別せずに解釈すること（Spring Data と同じ）"""
        assert parse_sort(value) == [SortOrder("name", descending=descending)]

    def test_direction_defaults_to_ascending(self) -> None:
        """方向を省略した場合は昇順になること"""
        assert parse_sort("name") == [SortOrder("name", descending=False)]

    def test_direction_applies_to_all_preceding_properties(self) -> None:
        """「キー1,キー2,方向」の方向が直前のすべてのキーに掛かること"""
        assert parse_sort("name,updatedAt,desc") == [
            SortOrder("name", descending=True),
            SortOrder("updatedAt", descending=True),
        ]

    def test_non_direction_last_element_is_treated_as_property(self) -> None:
        """最後の要素が方向でなければ、すべてキー・昇順として扱うこと"""
        assert parse_sort("name,foo") == [
            SortOrder("name", descending=False),
            SortOrder("foo", descending=False),
        ]

    def test_multiple_sort_params_keep_order(self) -> None:
        """複数の指定を指定した順に並べること"""
        assert parse_sort(["name,asc", "updatedAt,desc"]) == [
            SortOrder("name", descending=False),
            SortOrder("updatedAt", descending=True),
        ]

    def test_ignores_whitespace_and_blank_elements(self) -> None:
        """前後の空白・空の要素を無視すること"""
        assert parse_sort([" name , desc ,", ",,"]) == [
            SortOrder("name", descending=True)
        ]

    @pytest.mark.parametrize("value", ["", ",", "desc", " "])
    def test_returns_empty_when_no_property_remains(self, value: str) -> None:
        """キーが残らない指定は空になること"""
        assert parse_sort(value) == []

    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            ("name,desc,ignorecase", [SortOrder("name", descending=True)]),
            ("name,IgnoreCase", [SortOrder("name", descending=False)]),
            ("ignorecase", []),
        ],
    )
    def test_skips_trailing_ignorecase_option(
        self, value: str, expected: list[Any]
    ) -> None:
        """末尾の ignorecase は読み飛ばし、方向・キーと取り違えないこと"""
        assert parse_sort(value) == expected

    def test_accepts_single_string(self) -> None:
        """文字列1つを渡しても1文字ずつに分解しないこと"""
        assert parse_sort("updatedAt") == [SortOrder("updatedAt")]


class TestSortQuery:
    """sort_query のテスト"""

    def test_returns_parsed_orders(self) -> None:
        """指定があれば解釈結果を返すこと"""
        dependency = sort_query("updatedAt,desc")

        assert dependency(sort=["name,asc", "updatedAt"]) == [
            SortOrder("name"),
            SortOrder("updatedAt"),
        ]

    @pytest.mark.parametrize("value", [[""], [","], []])
    def test_returns_default_when_no_property_remains(self, value: list[Any]) -> None:
        """キーが残らない指定（sort= など）は既定の並び順になること"""
        dependency = sort_query("updatedAt,desc")

        assert dependency(sort=value) == [SortOrder("updatedAt", descending=True)]


class TestFindOrder:
    """find_order のテスト"""

    def test_returns_first_matching_order(self) -> None:
        """指定したキーの最初の指定を返すこと"""
        orders = parse_sort(["name,asc", "totalCredits,desc", "totalCredits,asc"])

        assert find_order(orders, "totalCredits") == SortOrder(
            "totalCredits", descending=True
        )

    def test_returns_none_when_absent(self) -> None:
        """指定したキーがなければ None を返すこと"""
        assert find_order(parse_sort("name,asc"), "totalCredits") is None


class TestBuildOrderBy:
    """build_order_by のテスト"""

    def test_skips_unknown_properties_when_known_exists(self) -> None:
        """未知のキーは読み飛ばし、後ろの既知のキーの優先度を下げないこと（移植元と同じ）"""
        clauses = build_order_by(
            parse_sort(["unknown,asc", "name,desc"]),
            _COLUMNS,
            fallback=_items.c.updated_at,
            tie_breaker=_items.c.id,
        )

        assert _order_by_sql(clauses) == "items.name DESC, items.id DESC"

    @pytest.mark.parametrize(
        ("sort", "expected"),
        [
            ("unknown,desc", "items.updated_at DESC, items.id DESC"),
            ("unknown", "items.updated_at ASC, items.id ASC"),
        ],
    )
    def test_falls_back_when_no_known_property(self, sort: str, expected: str) -> None:
        """既知のキーが1つもなければ、先頭の指定の方向で読み替え先の列で並べること（従来の挙動）"""
        clauses = build_order_by(
            parse_sort(sort),
            _COLUMNS,
            fallback=_items.c.updated_at,
            tie_breaker=_items.c.id,
        )

        assert _order_by_sql(clauses) == expected

    def test_tie_breaker_follows_first_order_direction(self) -> None:
        """最終キーは先頭の並べ替え指定と同じ方向になること"""
        clauses = build_order_by(
            parse_sort(["name,asc", "updatedAt,desc"]),
            _COLUMNS,
            fallback=_items.c.updated_at,
            tie_breaker=_items.c.id,
        )

        assert _order_by_sql(clauses) == (
            "items.name ASC, items.updated_at DESC, items.id ASC"
        )

    def test_tie_breaker_can_be_fixed_ascending(self) -> None:
        """tie_breaker_ascending=True なら先頭が降順でも最終キーは昇順になること"""
        clauses = build_order_by(
            parse_sort("name,desc"),
            _COLUMNS,
            fallback=_items.c.updated_at,
            tie_breaker=_items.c.id,
            tie_breaker_ascending=True,
        )

        assert _order_by_sql(clauses) == "items.name DESC, items.id ASC"

    def test_tie_breaker_is_ascending_when_orders_empty(self) -> None:
        """並べ替え指定が空なら最終キーの昇順だけになること"""
        clauses = build_order_by(
            [], _COLUMNS, fallback=_items.c.updated_at, tie_breaker=_items.c.id
        )

        assert _order_by_sql(clauses) == "items.id ASC"


class TestEnumAsString:
    """enum_as_string のテスト"""

    def test_casts_column_to_varchar_on_postgresql(self) -> None:
        """ネイティブENUM列をPostgreSQL上で文字列にキャストした列式にすること"""
        sql = str(enum_as_string(_items.c.kind).compile(dialect=postgresql.dialect()))

        assert sql == "CAST(items.kind AS VARCHAR)"

    def test_order_by_uses_casted_column(self) -> None:
        """並べ替えに使うと文字列にキャストした列で並べること"""
        clauses = build_order_by(
            [SortOrder("kind", descending=True)],
            {"kind": enum_as_string(_items.c.kind)},
            fallback=_items.c.updated_at,
            tie_breaker=_items.c.id,
        )

        assert (
            _order_by_sql(clauses) == "CAST(items.kind AS VARCHAR) DESC, items.id DESC"
        )
