"""テーブル名から AGE graph・インデックスなどの名前を導出する。

移植元 `CoreDerivedResourceNameResolver`・`CoreDerivedResourceNameValidator`・
`CoreDerivedResourceTargetKind` をまとめて移した。
"""

import hashlib
import re
import unicodedata
from enum import Enum

HASH_BYTES = 4
UNSAFE_SUFFIX = "is unsafe-derived-name"
_RESERVED = frozenset(
    {
        "all", "analyse", "analyze", "and", "any", "array", "as", "asc", "between",
        "by", "case", "check", "column", "constraint", "create", "current_user",
        "database", "default", "delete", "desc", "distinct", "drop", "else",
        "false", "from", "group", "having", "index", "insert", "into", "join",
        "limit", "not", "null", "or", "order", "primary", "references", "select",
        "table", "then", "true", "union", "unique", "update", "user", "using",
        "where",
    }
)  # fmt: skip


class CoreDerivedResourceTargetKind(Enum):
    """導出する名前の種類。値は (契約名, 最大長, 区切り文字, 妥当な名前の正規表現)。"""

    AGE_GRAPH = ("age-graph", 63, "_", re.compile(r"[a-z_][a-z0-9_]{0,62}"))
    POSTGRES_INDEX = (
        "postgres-index",
        63,
        "_",
        re.compile(r"[a-z_][a-z0-9_]{0,62}"),
    )
    AZURE_SEARCH_INDEX = (
        "azure-search-index",
        128,
        "-",
        re.compile(r"[a-z0-9][a-z0-9-]{0,126}[a-z0-9]"),
    )

    @property
    def contract_name(self) -> str:
        """契約名を返す。

        Returns
        -------
        str
            エラーメッセージに使う契約名。
        """
        name: str = self.value[0]
        return name

    @property
    def max_length(self) -> int:
        """名前の最大長を返す。

        Returns
        -------
        int
            最大長。
        """
        length: int = self.value[1]
        return length

    @property
    def separator(self) -> str:
        """区切り文字を返す。

        Returns
        -------
        str
            区切り文字。
        """
        separator: str = self.value[2]
        return separator

    def is_valid(self, value: str | None) -> bool:
        """名前がこの種類の規則に合うかを返す。

        Parameters
        ----------
        value : str | None
            確かめる名前。

        Returns
        -------
        bool
            合っていれば True。
        """
        return value is not None and self.value[3].fullmatch(value) is not None


def _unsafe(name: str) -> ValueError:
    """安全でない導出名のエラーを作る。

    Parameters
    ----------
    name : str
        契約名またはフィールド名。

    Returns
    -------
    ValueError
        エラー。
    """
    return ValueError(f"{name} {UNSAFE_SUFFIX}")


def _hash(source: str, kind: str) -> str:
    """元の名前と種類から 4 バイト（16 進 8 文字）のハッシュを作る。

    Parameters
    ----------
    source : str
        元のテーブル名。
    kind : str
        契約名。

    Returns
    -------
    str
        SHA-256 の先頭 4 バイトの 16 進表記。
    """
    digest = hashlib.sha256(f"{source}:{kind}".encode()).digest()
    return digest[:HASH_BYTES].hex()


def _with_hash(value: str, source: str, kind: CoreDerivedResourceTargetKind) -> str:
    """長さの上限に収まるよう、末尾にハッシュを付ける。

    Parameters
    ----------
    value : str
        正規化した名前。
    source : str
        元のテーブル名。
    kind : CoreDerivedResourceTargetKind
        名前の種類。

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
    prefix = value[: min(length, len(value))]
    prefix = re.sub(f"{re.escape(kind.separator)}+$", "", prefix)
    if not prefix.strip():
        raise _unsafe(kind.contract_name)
    return prefix + suffix


def _slug(source: str, separator: str) -> str:
    """テーブル名を、英小文字・数字と区切り文字だけの名前にする。

    Parameters
    ----------
    source : str
        元のテーブル名。
    separator : str
        区切り文字。

    Returns
    -------
    str
        正規化した名前（空になることがある）。
    """
    # 移植元は NFKD 正規化の後に結合文字を除き、英小文字・数字以外を区切り文字にする
    decomposed = unicodedata.normalize("NFKD", source)
    stripped = "".join(
        ch for ch in decomposed if not unicodedata.category(ch).startswith("M")
    )
    value = re.sub(r"[^a-z0-9]+", separator, stripped.lower())
    escaped = re.escape(separator)
    value = re.sub(f"(?:{escaped}){{2,}}", separator, value)
    return re.sub(f"^{escaped}+|{escaped}+$", "", value)


class CoreDerivedResourceNameResolver:
    """テーブル名から導出する名前を決める。"""

    def resolve(
        self,
        table_name: str | None,
        kind: CoreDerivedResourceTargetKind,
        explicit_name: str | None,
    ) -> str:
        """明示された名前、なければテーブル名から導出した名前を返す。

        Parameters
        ----------
        table_name : str | None
            テーブル名。
        kind : CoreDerivedResourceTargetKind
            名前の種類。
        explicit_name : str | None
            明示された名前。あればそれを検証して使う。

        Returns
        -------
        str
            リソース名。

        Raises
        ------
        ValueError
            種類・テーブル名がない、または名前が安全でないとき。
        """
        if kind is None:
            raise ValueError("targetKind must not be null")
        if table_name is None or not table_name.strip():
            raise ValueError("tableName is missing")
        if explicit_name is not None and explicit_name.strip():
            explicit = explicit_name.strip()
            if not kind.is_valid(explicit):
                raise _unsafe(kind.contract_name)
            return explicit
        source = table_name.strip()
        value = _slug(source, kind.separator)
        if not value.strip():
            raise _unsafe("tableName")
        if value[0].isdigit():
            value = f"t{kind.separator}{value}"
        if value in _RESERVED:
            value = _with_hash(value, source, kind)
        if len(value) > kind.max_length:
            value = _with_hash(value, source, kind)
        if not kind.is_valid(value):
            raise _unsafe(kind.contract_name)
        return value
