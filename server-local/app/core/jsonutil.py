"""移植元（Java / Jackson）と同じ文字列表現を作るための補助関数。"""

import base64
import json
from datetime import UTC, datetime
from typing import Any

STRING_LIST_SEPARATOR = ","


def to_compact_json(value: Any) -> str:
    """Jackson の既定出力と同じく空白なし・非 ASCII をそのまま出力する。"""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def format_instant(value: datetime | None) -> str | None:
    """Jackson の Instant 形式（ISO-8601、UTC の `Z`）に変換する。

    Java の DateTimeFormatter.ISO_INSTANT は小数秒を 0/3/6 桁で出すため、
    同じ桁数に揃える（呼び出し側が文字列比較してもずれないようにする）。
    """
    if value is None:
        return None
    # SQLite は timezone を保持しないため、naive な値は保存時の UTC とみなす
    aware = value.replace(tzinfo=UTC) if value.tzinfo is None else value
    utc = aware.astimezone(UTC)
    base = utc.strftime("%Y-%m-%dT%H:%M:%S")
    micros = utc.microsecond
    if micros == 0:
        return f"{base}Z"
    if micros % 1000 == 0:
        return f"{base}.{micros // 1000:03d}Z"
    return f"{base}.{micros:06d}Z"


def encode_bytes(data: bytes | None) -> str | None:
    """Jackson は byte[] を Base64 文字列で出力する。"""
    if data is None:
        return None
    return base64.b64encode(data).decode("ascii")


def java_split(value: str, separator: str) -> list[str]:
    """Java の String.split と同じ結果を返す（区切りは正規表現でなく文字列として扱う）。

    - 区切りが見つからなければ元の文字列 1 要素
    - 末尾の空要素は取り除く（全要素が空なら空リスト）
    移植元の TSV 解析で、末尾改行の有無による行数の違いを再現するため。
    """
    if separator not in value:
        return [value]
    parts = value.split(separator)
    while parts and parts[-1] == "":
        parts.pop()
    return parts


def string_list_to_column(values: list[str] | None) -> str:
    """移植元 StringListConverter.convertToDatabaseColumn。"""
    if not values:
        return ""
    return STRING_LIST_SEPARATOR.join(values)


def column_to_string_list(value: str | None) -> list[str] | None:
    """移植元 StringListConverter.convertToEntityAttribute（空なら null）。"""
    if not value:
        return None
    return [part.strip() for part in java_split(value, STRING_LIST_SEPARATOR)]


def utcnow() -> datetime:
    """DB 保存用の現在時刻（UTC、naive）。SQLite で比較できるよう naive に揃える。"""
    return datetime.now(UTC).replace(tzinfo=None)
