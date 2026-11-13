"""検索の失敗を例外にする（移植元 RetrievalFailureException）。"""

from generative_ai_core.failure import CoreFailure, sanitize

PGROONGA_CATEGORY = "RETRIEVAL_READINESS_PGROONGA"
DEFAULT_CATEGORY = "RETRIEVAL_CORE_FAILURE"


class RetrievalFailureException(RuntimeError):
    """core が返した検索の失敗。メッセージは `コード [分類]: 要約`。"""

    def __init__(self, failure: CoreFailure) -> None:
        """core の失敗から例外を作る。

        Parameters
        ----------
        failure : CoreFailure
            core の失敗。
        """
        code = failure.code
        category = (
            PGROONGA_CATEGORY if code.startswith("PGROONGA_") else DEFAULT_CATEGORY
        )
        super().__init__(f"{code} [{category}]: {sanitize(failure.summary)}")
        self.code = code
        self.category_token = category
