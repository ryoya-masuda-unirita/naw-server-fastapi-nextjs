"""core の各 facade が返すサニタイズ済みの失敗（移植元 CoreFailure・CoreFailureSanitizer）。"""

import re
from dataclasses import dataclass

INVALID_TOOLS_INPUT = "invalid_tools_input"
UNSUPPORTED_TOOLS_PROVIDER = "unsupported_tools_provider"
UNSUPPORTED_TOOLS_ROUTE = "unsupported_tools_route"
UNSUPPORTED_APPROVAL_CONTINUATION = "unsupported_approval_continuation"
UNAVAILABLE_TOOLS_MAPPING = "unavailable_tools_mapping"
UNSUPPORTED_PROVIDER_TOOL_MATRIX = "unsupported_provider_tool_matrix"

DEFAULT_FAILURE_CODE = "CORE_RUNTIME_FAILURE"
BLANK_SUMMARY = "Runtime failure."

# 移植元の正規表現と同じ順序で置き換える（順序を変えると結果が変わる）
_BEARER_TOKEN = re.compile(r"Bearer\s+\S+", re.IGNORECASE)
_OPENAI_LIKE_KEY = re.compile(r"(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]+")
_URL_CREDENTIALS = re.compile(r"(?i)(https?://)[^\s/@:]+:[^\s/@]+@")
_JDBC_URL = re.compile(r"jdbc:postgresql://[^\s'\"<>]+", re.IGNORECASE)
_URL = re.compile(r"https?://[^\s'\"<>]+", re.IGNORECASE)
_SECRET_ASSIGNMENT = re.compile(
    r"(?i)(password|passwd|proxy[_-]?pass|api[_-]?key|token|secret|secret[_-]?ref|"
    r"credential[_-]?ref|credential)\s*[:=]\s*['\"]?[^\s,;'\"\]]+['\"]?"
)
_ENDPOINT_ASSIGNMENT = re.compile(
    r"(?i)(endpoint|base[_-]?url|url)\s*[:=]\s*https?://[^\s,;]+"
)
_TOOL_RAW_ASSIGNMENT = re.compile(
    r"(?i)(server[_-]?label|server[_-]?url|require[_-]?approval|tool[_-]?name)"
    r"\s*[:=]\s*['\"]?[^\s,;'\"\]]+['\"]?"
)


def sanitize(value: str | None) -> str:
    """秘密情報・URL を伏せた文字列にする。

    Parameters
    ----------
    value : str | None
        元の文字列。

    Returns
    -------
    str
        伏せ字にした文字列。空なら固定の要約文。
    """
    if value is None or not value.strip():
        return BLANK_SUMMARY
    sanitized = _BEARER_TOKEN.sub("Bearer [REDACTED]", value)
    sanitized = _OPENAI_LIKE_KEY.sub("[REDACTED]", sanitized)
    sanitized = _URL_CREDENTIALS.sub(r"\1[REDACTED]@", sanitized)
    sanitized = _SECRET_ASSIGNMENT.sub(r"\1=[REDACTED]", sanitized)
    sanitized = _ENDPOINT_ASSIGNMENT.sub(r"\1=[REDACTED]", sanitized)
    sanitized = _TOOL_RAW_ASSIGNMENT.sub(r"\1=[REDACTED]", sanitized)
    sanitized = _JDBC_URL.sub("[REDACTED_JDBC_URL]", sanitized)
    return _URL.sub("[REDACTED_URL]", sanitized)


@dataclass(frozen=True)
class CoreFailure:
    """core の各 facade が返すサニタイズ済みの失敗。"""

    code: str
    summary: str

    def __post_init__(self) -> None:
        """code が空なら既定値にし、summary をサニタイズする。"""
        code = self.code.strip() if self.code and self.code.strip() else ""
        object.__setattr__(self, "code", code or DEFAULT_FAILURE_CODE)
        object.__setattr__(self, "summary", sanitize(self.summary))

    @classmethod
    def of(cls, code: str | None, summary: str | None) -> "CoreFailure":
        """None を許して失敗を作る。

        Parameters
        ----------
        code : str | None
            失敗コード。
        summary : str | None
            要約。

        Returns
        -------
        CoreFailure
            作った失敗。
        """
        return cls(code or "", summary or "")

    @classmethod
    def from_exception(cls, code: str, error: BaseException) -> "CoreFailure":
        """例外から失敗を作る。

        Parameters
        ----------
        code : str
            失敗コード。
        error : BaseException
            元の例外。`__cause__` があればそちらを使う。

        Returns
        -------
        CoreFailure
            作った失敗。
        """
        source = error.__cause__ if error.__cause__ is not None else error
        message = str(source) or type(source).__name__
        return cls.of(code, message)
