"""移植元（Java / Jackson）と同じ文字列表現を作るための補助関数。"""

import base64
import json
from datetime import UTC, datetime
from typing import Any

STRING_LIST_SEPARATOR = ","


def to_compact_json(value: Any) -> str:
    """値を Jackson の既定出力と同じ形の JSON 文字列にする。

    Jackson の既定出力と同じく空白なし・非 ASCII をそのまま出力する。
    DB に保存する JSON や応答の文字列が移植元と同じになるようにするため。

    Parameters
    ----------
    value : Any
        JSON にする値。

    Returns
    -------
    str
        区切りの空白がなく、日本語などをエスケープしない JSON 文字列。
    """
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def format_instant(value: datetime | None) -> str | None:
    """Jackson の Instant 形式（ISO-8601、UTC の `Z`）に変換する。

    Java の DateTimeFormatter.ISO_INSTANT は小数秒を 0/3/6 桁で出すため、
    同じ桁数に揃える（呼び出し側が文字列比較してもずれないようにする）。

    Parameters
    ----------
    value : datetime | None
        変換する日時。タイムゾーンのない値は UTC とみなす。

    Returns
    -------
    str | None
        ``2026-11-13T01:02:03.123Z`` の形の文字列。``value`` が None なら None。
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
    """バイト列を、Jackson と同じく Base64 文字列にする。

    Jackson は byte[] を Base64 文字列で出力するため、応答の形を移植元にそろえる。

    Parameters
    ----------
    data : bytes | None
        変換するバイト列。

    Returns
    -------
    str | None
        Base64（標準・パディングあり）の文字列。``data`` が None なら None。
    """
    if data is None:
        return None
    return base64.b64encode(data).decode("ascii")


def java_split(value: str, separator: str) -> list[str]:
    """Java の String.split と同じ結果を返す（区切りは正規表現でなく文字列として扱う）。

    - 区切りが見つからなければ元の文字列 1 要素
    - 末尾の空要素は取り除く（全要素が空なら空リスト）
    移植元の TSV 解析で、末尾改行の有無による行数の違いを再現するため。

    Parameters
    ----------
    value : str
        分割する文字列。
    separator : str
        区切り文字列。

    Returns
    -------
    list[str]
        分割した要素のリスト。
    """
    if separator not in value:
        return [value]
    parts = value.split(separator)
    while parts and parts[-1] == "":
        parts.pop()
    return parts


def string_list_to_column(values: list[str] | None) -> str:
    """文字列のリストを、DB の列に保存するカンマ区切りの文字列にする。

    移植元 StringListConverter.convertToDatabaseColumn と同じく、None や空のリストは
    空文字にする。

    Parameters
    ----------
    values : list[str] | None
        保存する文字列のリスト。

    Returns
    -------
    str
        カンマで連結した文字列。
    """
    if not values:
        return ""
    return STRING_LIST_SEPARATOR.join(values)


def column_to_string_list(value: str | None) -> list[str] | None:
    """DB の列のカンマ区切りの文字列を、文字列のリストに戻す。

    移植元 StringListConverter.convertToEntityAttribute と同じく、空なら null（None）を
    返し、各要素の前後の空白を取り除く。分割は Java の String.split にそろえる。

    Parameters
    ----------
    value : str | None
        DB の列の値。

    Returns
    -------
    list[str] | None
        分割した文字列のリスト。``value`` が None か空文字なら None。
    """
    if not value:
        return None
    return [part.strip() for part in java_split(value, STRING_LIST_SEPARATOR)]


def utcnow() -> datetime:
    """DB に保存する現在時刻（UTC、タイムゾーンなし）を返す。

    SQLite はタイムゾーンを保持しないため、保存済みの値と比較できるよう naive に揃える。

    Returns
    -------
    datetime
        UTC の現在時刻（``tzinfo`` なし）。
    """
    return datetime.now(UTC).replace(tzinfo=None)
