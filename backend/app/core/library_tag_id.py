"""ライブラリタグIDの表記を保存形式に揃える。

ライブラリタグのIDは保存形式（ハイフンなし32桁の小文字hex）で保存しているが、
移植元はIDをUUIDとして読み取るため、UUID標準形式（ハイフン付き）でも受け付ける。
ライブラリタグAPIとライブラリAPIの両方がタグIDを受け取るため、ここで共通化する。

`uuid.UUID()`は`urn:uuid:`・波括弧・`0x`等も受け付け、1つのタグを指すIDの表記が
増えてしまうため、保存形式とUUID標準形式の2つだけを正規表現で受け付ける。
"""

import re
from collections.abc import Iterable

from fastapi import HTTPException, status

# 保存形式（ハイフンなし32桁）と、移植元が受け付けるUUID標準形式（8-4-4-4-12）。
_LIBRARY_TAG_ID_PATTERN = re.compile(
    r"[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
    re.IGNORECASE,
)


def normalize_library_tag_id(tag_id: str) -> str | None:
    """ライブラリタグIDを保存形式（ハイフンなし32桁の小文字）に揃える。

    Args:
        tag_id: ハイフンなし32桁またはUUID標準形式のタグID。大文字小文字は問わない。

    Returns:
        保存形式のタグID。どちらの形式でもない場合はNone。
    """
    if not _LIBRARY_TAG_ID_PATTERN.fullmatch(tag_id):
        return None
    return tag_id.replace("-", "").lower()


def normalize_library_tag_ids(tag_ids: Iterable[str]) -> list[str]:
    """ライブラリタグID一覧を保存形式に揃える。順序は保ち、重複は除かない。

    Args:
        tag_ids: ハイフンなし32桁またはUUID標準形式のタグID一覧。

    Returns:
        保存形式のタグID一覧。

    Raises:
        HTTPException: どちらの形式でもないIDを含む場合400を返す。移植元は
            `UUID.fromString`の失敗を400にするため合わせる。メッセージは移植元で
            最もよく出る`UUID.fromString`の文言に揃える。
    """
    normalized: list[str] = []
    for tag_id in tag_ids:
        normalized_id = normalize_library_tag_id(tag_id)
        if normalized_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid UUID string: {tag_id}",
            )
        normalized.append(normalized_id)
    return normalized
