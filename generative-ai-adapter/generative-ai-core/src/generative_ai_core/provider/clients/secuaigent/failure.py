"""SecuAiGent の失敗の分類（移植元 SecuAiGentFailureClassifier・SecuAiGentFailureSanitizer）。

例外の種類とメッセージから固定の分類コードを選び、要約は固定文にする
（URL・トークン・パスなどを出さない）。
"""

import ssl

import httpx

from generative_ai_core.failure import CoreFailure

SSL_FAILURE = "SECUAIGENT_SSL_FAILURE"
VALIDATION_FAILURE = "SECUAIGENT_VALIDATION_FAILURE"
TIMEOUT = "SECUAIGENT_TIMEOUT"
PROXY_AUTH_FAILURE = "SECUAIGENT_PROXY_AUTH_FAILURE"
AUTH_FAILURE = "SECUAIGENT_AUTH_FAILURE"
NETWORK_FAILURE = "SECUAIGENT_NETWORK_FAILURE"

_SSL_MARKERS = ("ssl", "handshake", "certificate", "certification", "certpath", "pkix")


class SecuAiGentIOError(OSError):
    """移植元の IOException（分類済みの失敗を運ぶ）。"""


def summary(failure_class: str) -> str:
    """分類コードから固定の要約文を作る。

    Parameters
    ----------
    failure_class : str
        失敗の分類コード。

    Returns
    -------
    str
        URL・トークンなどを含まない要約。
    """
    return f"{failure_class}: SecuAiGent runtime failure. See sanitized classification."


def _chain(error: BaseException) -> list[BaseException]:
    """原因（`__cause__`）をたどった例外の列。循環は打ち切る。

    Parameters
    ----------
    error : BaseException
        起点の例外。

    Returns
    -------
    list[BaseException]
        起点から原因へたどった例外の列。
    """
    chain: list[BaseException] = []
    current: BaseException | None = error
    while current is not None and current not in chain:
        chain.append(current)
        current = current.__cause__
    return chain


def _is_ssl_failure(error: BaseException) -> bool:
    """例外 1 つが SSL の失敗か判定する。

    Parameters
    ----------
    error : BaseException
        例外。

    Returns
    -------
    bool
        SSL の失敗なら True。
    """
    message = str(error).lower()
    return isinstance(error, ssl.SSLError) or any(m in message for m in _SSL_MARKERS)


def _contains_ssl_failure(error: BaseException) -> bool:
    """原因の連鎖や ExceptionGroup の中に SSL の失敗があるか判定する。

    Parameters
    ----------
    error : BaseException
        起点の例外。

    Returns
    -------
    bool
        SSL の失敗を含めば True。
    """
    for current in _chain(error):
        if _is_ssl_failure(current):
            return True
        # 移植元は suppressed もたどる。Python では ExceptionGroup の中身が相当する
        if isinstance(current, BaseExceptionGroup) and any(
            _contains_ssl_failure(inner) for inner in current.exceptions
        ):
            return True
    return False


def classify(error: BaseException | None) -> str:
    """例外を固定の分類コードにする。

    Parameters
    ----------
    error : BaseException | None
        分類する例外。None なら一般的な失敗として扱う。

    Returns
    -------
    str
        失敗の分類コード。
    """
    if error is None:
        error = SecuAiGentIOError("SecuAiGent runtime failure")
    if _contains_ssl_failure(error):
        return SSL_FAILURE
    source = _chain(error)[-1]
    message = str(source).lower()
    # 移植元の IllegalArgumentException に当たるのは ValueError
    if isinstance(source, ValueError) or "validation" in message:
        return VALIDATION_FAILURE
    if isinstance(source, ssl.SSLError) or "ssl" in message or "certificate" in message:
        return SSL_FAILURE
    if (
        isinstance(source, (TimeoutError, httpx.TimeoutException))
        or "timeout" in message
        or "timed out" in message
    ):
        return TIMEOUT
    if "407" in message or "proxy auth" in message:
        return PROXY_AUTH_FAILURE
    if "auth" in message or "401" in message or "403" in message:
        return AUTH_FAILURE
    return NETWORK_FAILURE


def to_failure(error: BaseException | None) -> CoreFailure:
    """例外を分類した固定の失敗にする。

    Parameters
    ----------
    error : BaseException | None
        分類する例外。

    Returns
    -------
    CoreFailure
        core の失敗。
    """
    code = classify(error)
    return CoreFailure.of(code, summary(code))


def to_io_error(error: BaseException) -> SecuAiGentIOError:
    """例外を分類済みの失敗を運ぶ IO エラーにする。

    Parameters
    ----------
    error : BaseException
        分類する例外。

    Returns
    -------
    SecuAiGentIOError
        分類コードと要約を持つ IO エラー。
    """
    failure = to_failure(error)
    return SecuAiGentIOError(f"{failure.code}: {failure.summary}")
