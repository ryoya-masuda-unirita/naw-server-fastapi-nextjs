"""一覧APIの並べ替え指定（移植元 Spring Data `Pageable` の `sort`）を扱う共通処理。

移植元は Spring Data の既定の `SortHandlerMethodArgumentResolver` で `sort` を解釈しており、
独自設定（`@PageableDefault` 等）はない。ここではその解釈規則を再現する。

- `sort` は複数指定でき、指定した順に優先する
- 1つの値は「キー[,キー...][,方向]」。方向は `asc`/`desc` を大文字小文字を区別せずに解釈し、
  直前のすべてのキーに掛かる。最後の要素が方向でなければ、すべてキー・昇順として扱う
- 空の要素は無視する

キーから列への対応づけ（移植元 `PageableSortUtil.remapSort` のエイリアス相当）は API ごとに
異なるため、各リポジトリが対応表を `build_order_by` に渡す。
"""

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from fastapi import Query

SORT_DELIMITER = ","
_DESCENDING_BY_DIRECTION = {"asc": False, "desc": True}


@dataclass(frozen=True)
class SortOrder:
    """並べ替えの1キー分の指定（Spring Data の `Sort.Order` 相当）。"""

    property: str
    descending: bool = False


def parse_sort(sort: str | Sequence[str]) -> list[SortOrder]:
    """`sort` クエリパラメータの値を並べ替え指定の並びに変換する。

    Args:
        sort: `sort` の値。複数指定された場合はその並び。

    Returns:
        指定順の並べ替え指定。キーが1つもなければ空リスト。
    """
    # str も Sequence[str] なので、1文字ずつに分解されないよう先に包む
    values = [sort] if isinstance(sort, str) else sort
    orders: list[SortOrder] = []
    for value in values:
        elements = [e.strip() for e in value.split(SORT_DELIMITER) if e.strip()]
        if not elements:
            continue
        descending = _DESCENDING_BY_DIRECTION.get(elements[-1].lower())
        if descending is None:
            properties = elements
            descending = False
        else:
            properties = elements[:-1]
        orders.extend(SortOrder(prop, descending) for prop in properties)
    return orders


def sort_query(default: str) -> Callable[..., list[SortOrder]]:
    """`sort` クエリパラメータを解釈する FastAPI の依存関数を作る。

    `sort=`（空文字）のようにキーが1つも残らない指定は、その API の既定の並び順にする。
    FastAPI は空文字を既定値に置き換えないため、ここで補う。

    Args:
        default: その API の既定の並び順（例: "updatedAt,desc"）。

    Returns:
        `Depends` に渡す依存関数。
    """
    default_orders = parse_sort(default)

    def dependency(sort: list[str] = Query([default])) -> list[SortOrder]:
        return parse_sort(sort) or list(default_orders)

    return dependency


def find_order(orders: Sequence[SortOrder], property_name: str) -> SortOrder | None:
    """指定したキーの最初の並べ替え指定を返す。

    Args:
        orders: 並べ替え指定の並び。
        property_name: 探すキー。

    Returns:
        最初に見つかった並べ替え指定。なければ None。
    """
    return next((o for o in orders if o.property == property_name), None)


def _directed(column: Any, descending: bool) -> Any:
    return column.desc() if descending else column.asc()


def build_order_by(
    orders: Sequence[SortOrder],
    columns: Mapping[str, Any],
    *,
    fallback: Any,
    tie_breaker: Any,
    tie_breaker_ascending: bool = False,
) -> list[Any]:
    """並べ替え指定から ORDER BY 句の並びを組み立てる。

    対応表にないキーは、エラーにせず `fallback` の列で並べる（各 API の従来の挙動）。
    最後に一意な列（`tie_breaker`）を加え、同値の行の並びを確定させる。移植元は同値の行の
    並びを DB 任せにしているが、ページ境界で行が重複・欠落しないようにするため加える。

    Args:
        orders: 並べ替え指定の並び。
        columns: キーから列式への対応表。
        fallback: 対応表にないキーのときに使う列式。
        tie_breaker: 行を一意に決める列式（主キー等）。
        tie_breaker_ascending: True なら最終キーを常に昇順にする。False なら先頭の
            並べ替え指定と同じ方向にし、降順が昇順の完全な逆順になるようにする。

    Returns:
        `order_by()` に渡す句の並び。
    """
    clauses = [
        _directed(columns.get(o.property, fallback), o.descending) for o in orders
    ]
    tie_breaker_descending = (
        not tie_breaker_ascending and bool(orders) and orders[0].descending
    )
    clauses.append(_directed(tie_breaker, tie_breaker_descending))
    return clauses
