"""プロパティ ID と列挙値（移植元 constants パッケージ）。"""

from enum import Enum


class PropertyIds:
    """Waha! の接続プロパティの ID（移植元 PropertyIds・properties.xml）。"""

    URL = 0
    API_KEY = 1
    MODEL_NAME = 2
    TENANT_ID = 3
    USE_PROXY = 4
    PROXY_HOST = 5
    PROXY_PORT = 6
    USE_PROXY_CRED = 7
    PROXY_ID = 8
    PROXY_PASS = 9
    INSECURE_SSL = 10
    OUTPUT_DIR = 11
    MAX_TOKENS = 17
    TEMPERATURE = 18
    FREQUENCY_PENALTY = 19
    PRESENCE_PENALTY = 20
    TOP_P = 21
    STOP = 22
    TIMEOUT_SECONDS = 23
    VENDOR = 30
    IMAGE_EXPLANATION_MODE = 31
    REASONING_EFFORT = 40
    VERBOSITY = 41
    REASONING_OUTPUT_PATH = 42
    TEXT_DATA_JSON_FILE_PATH = 43
    CHAT_TOOLS_NAME = 44
    CHAT_MCP_SERVER_LABEL = 45
    CHAT_MCP_SERVER_URL = 46
    CHAT_MCP_REQUIRE_APPROVAL = 47
    CHAT_TOOLS_JSON_FILE_PATH = 48
    SECUAIGENT_LIBRARY_GENERATION = 49
    CONTEXT_CHECK = 50
    RAG_CONTEXT_JSON_ALLOW_ROOT = 62

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


class ImageExplanationMode(Enum):
    """画像説明の生成モード。"""

    DISABLED = 0
    EMBED_ONLY = 1
    FULL_PAGE = 2

    @property
    def code(self) -> int:
        """モードの数値コード。

        Returns
        -------
        int
            モードに対応する数値。
        """
        code: int = self.value
        return code

    @classmethod
    def from_string(cls, value: str | None) -> "ImageExplanationMode":
        """文字列からモードを求める。

        空なら DISABLED。未知の数値も DISABLED とする。

        Parameters
        ----------
        value : str | None
            モードの数値を表す文字列。

        Returns
        -------
        ImageExplanationMode
            対応するモード。

        Raises
        ------
        ValueError
            数字でない文字列のとき（移植元は NumberFormatException）。
        """
        if value is None or value == "":
            return cls.DISABLED
        code = int(value)
        for mode in cls:
            if mode.value == code:
                return mode
        return cls.DISABLED


class ReasoningEffort(Enum):
    """推論の深さ（reasoning_effort）。"""

    AUTO = ""
    MINIMAL = "minimal"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    NONE = "none"

    @classmethod
    def from_string(cls, value: str | None) -> "ReasoningEffort":
        """プロパティの値（番号の文字列）から推論の深さを求める。

        Parameters
        ----------
        value : str | None
            プロパティの値。

        Returns
        -------
        ReasoningEffort
            対応する値。未知なら MEDIUM。
        """
        return {
            "0": cls.AUTO,
            "1": cls.MINIMAL,
            "2": cls.LOW,
            "3": cls.MEDIUM,
            "4": cls.HIGH,
            "5": cls.NONE,
        }.get(value or "", cls.MEDIUM)

    def wire_value(self) -> str:
        """API に送る文字列を返す。

        Returns
        -------
        str
            API 用の値。
        """
        wire: str = self.value
        return wire


class Verbosity(Enum):
    """出力の詳細度（verbosity）。"""

    NONE = ""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

    @classmethod
    def from_string(cls, value: str | None) -> "Verbosity":
        """プロパティの値（番号の文字列）から詳細度を求める。

        Parameters
        ----------
        value : str | None
            プロパティの値。

        Returns
        -------
        Verbosity
            対応する値。未知なら MEDIUM。
        """
        return {
            "0": cls.NONE,
            "1": cls.LOW,
            "2": cls.MEDIUM,
            "3": cls.HIGH,
        }.get(value or "", cls.MEDIUM)

    def wire_value(self) -> str:
        """API に送る文字列を返す。

        Returns
        -------
        str
            API 用の値。
        """
        wire: str = self.value
        return wire
