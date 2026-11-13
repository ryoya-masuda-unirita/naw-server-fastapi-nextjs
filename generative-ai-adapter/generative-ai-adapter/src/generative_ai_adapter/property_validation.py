"""プロパティの検証エラー（移植元 WahaPropertyValidationException・Messages）。"""


class WahaPropertyValidationError(ValueError):
    """プロパティが不正・不足（移植元では IllegalArgumentException の派生）。

    Attributes
    ----------
    property_id
        プロパティ ID。ID のない項目は None。
    property_name
        項目名。
    reason
        理由（missing・invalid・unsupported-provider など）。
    """

    def __init__(
        self, property_id: int | None, property_name: str, reason: str, message: str
    ) -> None:
        """エラーを作る。

        Parameters
        ----------
        property_id : int | None
            プロパティ ID。ID のない項目は None。
        property_name : str
            項目名。空は不可。
        reason : str
            理由。空は不可。
        message : str
            例外のメッセージ。

        Raises
        ------
        ValueError
            項目名・理由が空のとき。
        """
        super().__init__(message)
        self.property_id = property_id
        self.property_name = _require_text(property_name, "propertyName")
        self.reason = _require_text(reason, "reason")
        self.sanitized = True


def _require_text(value: str | None, field_name: str) -> str:
    """空でない文字列であることを確かめる。

    Parameters
    ----------
    value : str | None
        確かめる値。
    field_name : str
        エラーメッセージに出す項目名。

    Returns
    -------
    str
        受け取った値。

    Raises
    ------
    ValueError
        値が None・空白だけのとき。
    """
    if value is None or not value.strip():
        raise ValueError(f"{field_name} must not be blank")
    return value


def _label(property_id: int | None, property_name: str) -> str:
    """メッセージに出す項目の表記。

    Parameters
    ----------
    property_id : int | None
        プロパティ ID。None なら付けない。
    property_name : str
        項目名。

    Returns
    -------
    str
        `名前` または `名前 (propertyId=ID)`。
    """
    if property_id is None:
        return property_name
    return f"{property_name} (propertyId={property_id})"


def _validation(
    property_id: int | None, property_name: str, reason: str
) -> WahaPropertyValidationError:
    """`<項目> is <理由>` のエラーを作る。

    Parameters
    ----------
    property_id : int | None
        プロパティ ID。
    property_name : str
        項目名。
    reason : str
        理由。

    Returns
    -------
    WahaPropertyValidationError
        作ったエラー。
    """
    return WahaPropertyValidationError(
        property_id,
        property_name,
        reason,
        f"{_label(property_id, property_name)} is {reason}",
    )


def missing(property_id: int | None, property_name: str) -> WahaPropertyValidationError:
    """必須のプロパティがないエラーを作る。

    Parameters
    ----------
    property_id : int | None
        プロパティ ID。
    property_name : str
        項目名。

    Returns
    -------
    WahaPropertyValidationError
        作ったエラー。
    """
    return _validation(property_id, property_name, "missing")


def invalid(property_id: int | None, property_name: str) -> WahaPropertyValidationError:
    """プロパティの値が不正なエラーを作る。

    Parameters
    ----------
    property_id : int | None
        プロパティ ID。
    property_name : str
        項目名。

    Returns
    -------
    WahaPropertyValidationError
        作ったエラー。
    """
    return _validation(property_id, property_name, "invalid")


def unsupported_provider(
    property_id: int | None, property_name: str, supported_providers: str
) -> WahaPropertyValidationError:
    """実行できないプロバイダが選ばれたエラーを作る。

    Parameters
    ----------
    property_id : int | None
        プロパティ ID。
    property_name : str
        項目名。
    supported_providers : str
        実行できるプロバイダの一覧（カンマ区切り）。

    Returns
    -------
    WahaPropertyValidationError
        作ったエラー。
    """
    message = (
        f"{_label(property_id, property_name)} is unsupported-provider. "
        f"supported providers: {supported_providers}"
    )
    return WahaPropertyValidationError(
        property_id, property_name, "unsupported-provider", message
    )
