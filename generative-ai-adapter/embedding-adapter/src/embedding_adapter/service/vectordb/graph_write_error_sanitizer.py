"""Graph 書き込みエラーの秘密情報の除去（移植元 GraphWriteErrorSanitizer）。"""

import re

JDBC_URL = re.compile(r"jdbc:postgresql://[^\s'\"]+", re.IGNORECASE)
HTTP_URL = re.compile(r"https?://[^\s'\"]+", re.IGNORECASE)
KEY_VALUE_SECRET = re.compile(
    r"(password|passwd|pwd|api[_-]?key|token|proxy(?:Pass|Password)?|user)"
    r"\s*[:=]\s*[^\s,;]+",
    re.IGNORECASE,
)


class GraphWriteErrorSanitizer:
    """呼び出し元に見えるメッセージから資格情報らしい値を取り除く。"""

    @staticmethod
    def sanitize(value: BaseException | str | None) -> str:
        """例外またはメッセージから資格情報らしい値を伏せる。

        Parameters
        ----------
        value : BaseException | str | None
            例外またはメッセージ。例外はその文字列表現を使う。

        Returns
        -------
        str
            伏せ字にしたメッセージ。None は空文字。
        """
        if value is None:
            return ""
        message = str(value)
        sanitized = JDBC_URL.sub("<redacted-jdbc-url>", message)
        sanitized = HTTP_URL.sub("<redacted-url>", sanitized)
        return KEY_VALUE_SECRET.sub(r"\1=<redacted>", sanitized)
