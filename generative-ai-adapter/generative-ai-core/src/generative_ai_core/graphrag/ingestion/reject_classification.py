"""取り込み（ingestion）の拒否コードの分類（移植元 IngestionRejectClassification）。"""

NON_CRITICAL_LLM_CANDIDATE_OUTPUT_REJECTED = "LLM_CANDIDATE_OUTPUT_REJECTED"


class IngestionRejectClassification:
    """拒否コードが致命的か（取り込み全体を失敗にするか）を分類する。"""

    @staticmethod
    def is_non_critical(failure_code: str | None) -> bool:
        """致命的でない拒否コードか判定する。

        Parameters
        ----------
        failure_code : str | None
            拒否コード。

        Returns
        -------
        bool
            LLM 候補出力の拒否（学習可能な拒否）なら True。
        """
        return failure_code == NON_CRITICAL_LLM_CANDIDATE_OUTPUT_REJECTED

    @staticmethod
    def is_critical(failure_code: str | None) -> bool:
        """致命的な拒否コードか判定する。

        Parameters
        ----------
        failure_code : str | None
            拒否コード。

        Returns
        -------
        bool
            致命的でないものを除いたすべて。
        """
        return not IngestionRejectClassification.is_non_critical(failure_code)
