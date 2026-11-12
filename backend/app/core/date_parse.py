"""日時のクエリパラメータの解釈（移植元`util/DateParseUtil`相当）。"""

import re
from datetime import datetime, timezone

from fastapi import HTTPException, status

# 移植元`Instant.parse`が受け付ける形（日付・時刻・オフセットがそろったISO 8601）。
# `datetime.fromisoformat`は日付だけ・空白区切り・オフセットなしも受け付けるため、
# 先にこの形かを確かめて移植元と同じ値だけを通す。
_ISO_INSTANT_PATTERN = re.compile(
    r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2}(:\d{2})?)"
)


def parse_iso_instant(value: str | None, parameter_name: str) -> datetime | None:
    """ISO 8601の日時（末尾が`Z`、または`+09:00`のようなオフセット付き）をUTCの日時に変換する。

    時刻やオフセットを持たない値は、どのタイムゾーンの時刻か決まらないため受け付けない
    （移植元`DateParseUtil.parseIsoInstant`と同じ）。

    Args:
        value: 変換する文字列。`None`・空文字（空白だけを含む）は「指定なし」として`None`を返す。
        parameter_name: エラーメッセージに出すパラメータ名。

    Returns:
        UTCの日時。指定なしなら`None`。

    Raises:
        HTTPException: 400。日時として解釈できない場合。
    """
    if value is None or not value.strip():
        return None
    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=(
            f"{parameter_name} は 2026-10-08T15:00:00Z のような"
            " ISO 8601 の日時で指定してください"
        ),
    )
    if _ISO_INSTANT_PATTERN.fullmatch(value) is None:
        raise invalid
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as e:
        # 形は合っていても、13月のように存在しない日時は解釈できない
        raise invalid from e
    # 移植元は`Instant`（絶対時刻）で比較するため、オフセットの違いをここで吸収する
    return parsed.astimezone(timezone.utc)
