"""テーブル名から派生リソース名を決める（移植元 CoreDerivedResourceNameResolver）。"""

import hashlib
import re
import unicodedata

from generative_ai_core.resource.target_kind import CoreDerivedResourceTargetKind
from generative_ai_core.resource.validator import CoreDerivedResourceNameValidator

# 移植元と同じ予約語（そのまま名前にすると SQL の予約語と衝突する）
RESERVED = frozenset(
    {
        "all", "analyse", "analyze", "and", "any", "array", "as", "asc", "between",
        "by", "case", "check", "column", "constraint", "create", "current_user",
        "database", "default", "delete", "desc", "distinct", "drop", "else", "false",
        "from", "group", "having", "index", "insert", "into", "join", "limit", "not",
        "null", "or", "order", "primary", "references", "select", "table", "then",
        "true", "union", "unique", "update", "user", "using", "where",
    }
)  # fmt: skip
HASH_BYTES = 4
_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def _unsafe(name: str) -> ValueError:
    """安全でない派生名のエラーを作る。

    Parameters
    ----------
    name : str
        契約名。

    Returns
    -------
    ValueError
        `<名前> is unsafe-derived-name` のエラー。
    """
    return ValueError(f"{name} is unsafe-derived-name")


def _hash(source: str, kind_name: str) -> str:
    """名前の衝突を避けるための短いハッシュを作る。

    Parameters
    ----------
    source : str
        元のテーブル名。
    kind_name : str
        リソースの契約名。

    Returns
    -------
    str
        SHA-256 の先頭 4 バイトの 16 進文字列。
    """
    digest = hashlib.sha256(f"{source}:{kind_name}".encode()).digest()
    return digest[:HASH_BYTES].hex()


def _with_hash(value: str, source: str, kind: CoreDerivedResourceTargetKind) -> str:
    """最大長に収まるよう、末尾にハッシュを付けた名前にする。

    Parameters
    ----------
    value : str
        正規化した名前。
    source : str
        元のテーブル名。
    kind : CoreDerivedResourceTargetKind
        リソースの種類。

    Returns
    -------
    str
        ハッシュ付きの名前。

    Raises
    ------
    ValueError
        接頭辞が残らないとき。
    """
    suffix = kind.separator + _hash(source, kind.contract_name)
    length = kind.max_length - len(suffix)
    prefix = value[: min(length, len(value))].rstrip(kind.separator)
    if not prefix.strip():
        raise _unsafe(kind.contract_name)
    return prefix + suffix


class CoreDerivedResourceNameResolver:
    """テーブル名から AGE グラフ・インデックスなどの名前を決める。"""

    def resolve(
        self,
        table_name: str | None,
        kind: CoreDerivedResourceTargetKind | None,
        explicit_name: str | None,
    ) -> str:
        """明示された名前、なければテーブル名から派生した名前を返す。

        Parameters
        ----------
        table_name : str | None
            元のテーブル名。
        kind : CoreDerivedResourceTargetKind | None
            リソースの種類。
        explicit_name : str | None
            明示された名前。空なら派生させる。

        Returns
        -------
        str
            リソース名。

        Raises
        ------
        ValueError
            種類が None、テーブル名が空、名前が規則に合わない、
            または派生できないとき。
        """
        if kind is None:
            raise ValueError("targetKind must not be null")
        CoreDerivedResourceNameValidator.validate_table_name(table_name)
        if table_name is None:  # validate_table_name が保証済み（型の絞り込み用）
            raise ValueError("tableName is missing")
        if explicit_name is not None and explicit_name.strip():
            explicit = explicit_name.strip()
            CoreDerivedResourceNameValidator.validate_explicit_name(explicit, kind)
            return explicit
        source = table_name.strip()
        separator = kind.separator
        decomposed = unicodedata.normalize("NFKD", source)
        stripped = "".join(
            c for c in decomposed if not unicodedata.category(c).startswith("M")
        )
        value = _NON_ALNUM.sub(separator, stripped.lower()).strip(separator)
        if not value.strip():
            raise _unsafe("tableName")
        if value[0].isdigit():
            value = "t" + separator + value
        if value in RESERVED:
            value = _with_hash(value, source, kind)
        if len(value) > kind.max_length:
            value = _with_hash(value, source, kind)
        CoreDerivedResourceNameValidator.validate_resolved_name(value, kind)
        return value
