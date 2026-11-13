"""検索の失敗を、クエリや秘密を伏せた `CoreFailure` にする（移植元 CoreRetrievalFailureSanitizer）。"""

import re

from generative_ai_core.failure import CoreFailure, sanitize

_QUERY_ASSIGNMENT = re.compile(r"(?i)(query|prompt|input)\s*[:=]\s*[^\s,;]+")
_SECRET_ASSIGNMENT = re.compile(
    r"(?i)(password|pass|api[_-]?key|login[_-]?key|token|tenant|providerPayload)"
    r"\s*[:=]\s*[^\s,;]+"
)
RETRIEVAL_RUNTIME_FAILURE = "retrieval runtime failure"


def _failure(code: str, error: BaseException | None) -> CoreFailure:
    """例外（原因があれば原因）のメッセージを伏せて失敗にする。

    Parameters
    ----------
    code : str
        失敗コード。
    error : BaseException | None
        例外。

    Returns
    -------
    CoreFailure
        失敗。
    """
    source = error.__cause__ if error is not None and error.__cause__ else error
    message = str(source) if source is not None and str(source) else ""
    if not message:
        message = RETRIEVAL_RUNTIME_FAILURE
    redacted = _QUERY_ASSIGNMENT.sub(r"\1=[REDACTED]", message)
    redacted = _SECRET_ASSIGNMENT.sub(r"\1=[REDACTED]", redacted)
    redacted = redacted.replace("providerPayload", "payload")
    return CoreFailure.of(code, sanitize(redacted))


class CoreRetrievalFailureSanitizer:
    """検索の失敗コードごとに、安全な `CoreFailure` を作る。"""

    def provider_failure(self, error: BaseException | None) -> CoreFailure:
        """プロバイダの失敗にする。

        Parameters
        ----------
        error : BaseException | None
            例外。

        Returns
        -------
        CoreFailure
            `RETRIEVAL_PROVIDER_FAILURE`。
        """
        return _failure("RETRIEVAL_PROVIDER_FAILURE", error)

    def graph_unavailable(self, error: BaseException | None) -> CoreFailure:
        """Graph が使えない失敗にする。

        Parameters
        ----------
        error : BaseException | None
            例外。

        Returns
        -------
        CoreFailure
            `GRAPH_UNAVAILABLE`。
        """
        return _failure("GRAPH_UNAVAILABLE", error)

    def graph_query_failure(self, error: BaseException | None) -> CoreFailure:
        """Graph の問い合わせの失敗にする。

        Parameters
        ----------
        error : BaseException | None
            例外。

        Returns
        -------
        CoreFailure
            `GRAPH_QUERY_FAILURE`。
        """
        return _failure("GRAPH_QUERY_FAILURE", error)

    def malformed_result(self, summary: str) -> CoreFailure:
        """結果が不正な失敗にする。

        Parameters
        ----------
        summary : str
            要約。

        Returns
        -------
        CoreFailure
            `MALFORMED_RESULT`。
        """
        return CoreFailure.of("MALFORMED_RESULT", summary)

    def unsupported_provider(self, provider_id: str) -> CoreFailure:
        """プロバイダ未対応の失敗にする。

        Parameters
        ----------
        provider_id : str
            プロバイダ（要約には出さない）。

        Returns
        -------
        CoreFailure
            `UNSUPPORTED_PROVIDER`。
        """
        return CoreFailure.of(
            "UNSUPPORTED_PROVIDER",
            "retrieval provider is unsupported for this graph setting",
        )
