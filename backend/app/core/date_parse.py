"""日時のクエリパラメータの解釈（移植元`util/DateParseUtil`相当）。"""

import re
from collections.abc import Callable
from datetime import datetime, timezone

from fastapi import HTTPException, Query, status

# 移植元`Instant.parse`が受け付ける形（日付・時刻・オフセットがそろったISO 8601）。
# `datetime.fromisoformat`は日付だけ・空白区切り・オフセットなしも受け付けるため、
# 先にこの形かを確かめて移植元と同じ値だけを通す。
_ISO_INSTANT_PATTERN = re.compile(
    r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2}(:\d{2})?)"
)


def _invalid_iso_instant(parameter_name: str) -> HTTPException:
    """日時として解釈できない値の400を作る（移植元と同じ文言）。

    Parameters
    ----------
    parameter_name : str
        エラーメッセージに出すパラメータ名。

    Returns
    -------
    HTTPException
        400の`HTTPException`。
    """
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=(
            f"{parameter_name} は 2026-10-08T15:00:00Z のような"
            " ISO 8601 の日時で指定してください"
        ),
    )


def parse_iso_instant(value: str | None, parameter_name: str) -> datetime | None:
    """ISO 8601の日時（末尾が`Z`、または`+09:00`のようなオフセット付き）をUTCの日時に変換する。

    時刻やオフセットを持たない値は、どのタイムゾーンの時刻か決まらないため受け付けない
    （移植元`DateParseUtil.parseIsoInstant`と同じ）。

    Parameters
    ----------
    value : str | None
        変換する文字列。`None`・空文字（空白だけを含む）は「指定なし」として`None`を返す。
    parameter_name : str
        エラーメッセージに出すパラメータ名。

    Returns
    -------
    datetime | None
        UTCの日時。指定なしなら`None`。

    Raises
    ------
    HTTPException
        400。日時として解釈できない場合。
    """
    if value is None or not value.strip():
        return None
    if _ISO_INSTANT_PATTERN.fullmatch(value) is None:
        raise _invalid_iso_instant(parameter_name)
    try:
        # 移植元は`Instant`（絶対時刻）で比較するため、オフセットの違いをここで吸収する
        return datetime.fromisoformat(value).astimezone(timezone.utc)
    except (ValueError, OverflowError) as e:
        # 形は合っていても、13月のように存在しない日時や、UTCに直すと
        # `datetime`の範囲（1〜9999年）を外れる日時は解釈できない
        raise _invalid_iso_instant(parameter_name) from e


def iso_instant_query(
    parameter_name: str, description: str
) -> Callable[..., datetime | None]:
    """日時のクエリパラメータを`parse_iso_instant`で解釈するFastAPIの依存関数を作る。

    Parameters
    ----------
    parameter_name : str
        クエリパラメータ名（エラーメッセージにも出す）。
    description : str
        OpenAPIに載せるパラメータの説明。

    Returns
    -------
    Callable[..., datetime | None]
        `Depends`に渡す依存関数。
    """

    def dependency(
        value: str | None = Query(None, alias=parameter_name, description=description),
    ) -> datetime | None:
        """クエリパラメータのISO 8601文字列を日時に変換する。

        Parameters
        ----------
        value : str | None
            クエリパラメータの値。指定がない場合は None。

        Returns
        -------
        datetime | None
            変換した日時。指定がなければ None。
        """
        return parse_iso_instant(value, parameter_name)

    return dependency
