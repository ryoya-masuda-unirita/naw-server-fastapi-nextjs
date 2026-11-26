"""プロパティ ID の表（各アダプタの `PropertyIds`）の共通の基底クラス。"""


class PropertyIdsBase:
    """プロパティ ID の定数（大文字の整数）を持つクラスの基底。"""

    @classmethod
    def by_name(cls) -> dict[str, int]:
        """名前から ID への対応を返す（エミュレーターの設定ファイルで名前を使うため）。

        Returns
        -------
        dict[str, int]
            定数名をキー、ID を値とする辞書。
        """
        return {
            name: value
            for name, value in vars(cls).items()
            if name.isupper() and isinstance(value, int)
        }
