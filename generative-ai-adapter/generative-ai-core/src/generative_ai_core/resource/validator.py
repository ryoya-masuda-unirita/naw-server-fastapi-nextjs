"""派生リソース名の検証（移植元 CoreDerivedResourceNameValidator）。"""

from generative_ai_core.resource.target_kind import CoreDerivedResourceTargetKind


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


class CoreDerivedResourceNameValidator:
    """派生リソース名の検証。"""

    @staticmethod
    def validate_table_name(table_name: str | None) -> None:
        """テーブル名が空でないことを検証する。

        Parameters
        ----------
        table_name : str | None
            テーブル名。

        Raises
        ------
        ValueError
            None または空白だけのとき。
        """
        if table_name is None or not table_name.strip():
            raise ValueError("tableName is missing")

    @staticmethod
    def validate_explicit_name(
        value: str | None, kind: CoreDerivedResourceTargetKind
    ) -> None:
        """明示された名前が規則に合うことを検証する。空なら何もしない。

        Parameters
        ----------
        value : str | None
            明示された名前。
        kind : CoreDerivedResourceTargetKind
            リソースの種類。

        Raises
        ------
        ValueError
            空でなく、規則に合わないとき。
        """
        if value is not None and value.strip() and not kind.is_valid(value.strip()):
            raise _unsafe(kind.contract_name)

    @staticmethod
    def validate_resolved_name(
        value: str | None, kind: CoreDerivedResourceTargetKind
    ) -> None:
        """決まった名前が規則に合うことを検証する。

        Parameters
        ----------
        value : str | None
            決まった名前。
        kind : CoreDerivedResourceTargetKind
            リソースの種類。

        Raises
        ------
        ValueError
            規則に合わないとき。
        """
        if not kind.is_valid(value):
            raise _unsafe(kind.contract_name)
