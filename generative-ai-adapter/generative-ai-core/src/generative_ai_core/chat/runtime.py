"""chat・RAG・画像説明の入口（移植元 CoreChatRuntime）。

プロバイダの例外はここで失敗の結果に変え、呼び出し元へ例外を出さない。
"""

import logging

from generative_ai_core.chat.models import (
    CoreChatRequest,
    CoreChatResult,
    CoreImageExplanationRequest,
    CoreImageExplanationResult,
    CoreRagRequest,
)
from generative_ai_core.failure import CoreFailure
from generative_ai_core.provider.model import Capability
from generative_ai_core.provider.runtime import CoreProviderRuntime

logger = logging.getLogger(__name__)


class CoreChatRuntime:
    """chat・RAG・画像説明をプロバイダに振り分ける。"""

    def __init__(self, provider_runtime: CoreProviderRuntime) -> None:
        """プロバイダのランタイムを受け取る。

        Parameters
        ----------
        provider_runtime : CoreProviderRuntime
            プロバイダを実行するランタイム。
        """
        self._provider_runtime = provider_runtime

    def chat(self, request: CoreChatRequest) -> CoreChatResult:
        """chat を実行する。

        Parameters
        ----------
        request : CoreChatRequest
            chat のリクエスト。

        Returns
        -------
        CoreChatResult
            chat の結果。プロバイダの例外は失敗の結果にする。
        """
        logger.info(
            "core chat: provider=%s, messages=%d, tools=%d, outputMode=%s",
            request.provider_id,
            len(request.messages),
            len(request.tools()),
            request.output_mode_hint,
        )
        try:
            result = self._provider_runtime.execute(
                request.provider_id,
                Capability.CHAT,
                request,
                request.network_setting,
                CoreChatResult,
            )
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            result = CoreChatResult.from_failure(
                CoreFailure.from_exception("CHAT_PROVIDER_FAILURE", e),
                request.output_mode_hint,
            )
        _log_result("chat", result)
        return result

    def rag(self, request: CoreRagRequest) -> CoreChatResult:
        """RAG を実行する。

        Parameters
        ----------
        request : CoreRagRequest
            RAG のリクエスト。

        Returns
        -------
        CoreChatResult
            RAG の結果。プロバイダの例外は失敗の結果にする。
        """
        chat_request = request.chat_request
        logger.info(
            "core rag: provider=%s, messages=%d, contexts=%d",
            chat_request.provider_id,
            len(chat_request.messages),
            len(request.contexts),
        )
        try:
            result = self._provider_runtime.execute(
                chat_request.provider_id,
                Capability.RAG,
                request,
                chat_request.network_setting,
                CoreChatResult,
            )
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            result = CoreChatResult.from_failure(
                CoreFailure.from_exception("RAG_PROVIDER_FAILURE", e),
                chat_request.output_mode_hint,
            )
        _log_result("rag", result)
        return result

    def explain_image(
        self, request: CoreImageExplanationRequest
    ) -> CoreImageExplanationResult:
        """画像説明を実行する。

        Parameters
        ----------
        request : CoreImageExplanationRequest
            画像説明のリクエスト。

        Returns
        -------
        CoreImageExplanationResult
            画像説明の結果。プロバイダの例外は失敗の結果にする。
        """
        logger.info(
            "core image explanation: provider=%s, media=%d",
            request.provider_id,
            len(request.media),
        )
        try:
            return self._provider_runtime.execute(
                request.provider_id,
                Capability.IMAGE_EXPLANATION,
                request,
                request.network_setting,
                CoreImageExplanationResult,
            )
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            return CoreImageExplanationResult.from_failure(
                CoreFailure.from_exception("IMAGE_EXPLANATION_PROVIDER_FAILURE", e)
            )


def _log_result(route: str, result: CoreChatResult) -> None:
    """結果をログに出す。

    Parameters
    ----------
    route : str
        経路名（chat・rag）。
    result : CoreChatResult
        ログに出す結果。
    """
    if result.failure is not None:
        logger.warning(
            "core %s failed: code=%s, summary=%s",
            route,
            result.failure.code,
            result.failure.summary,
        )
        return
    logger.info(
        "core %s finished: answerPresent=%s, answerChars=%d, referenceIds=%s",
        route,
        result.answer_present,
        len(result.answer),
        list(result.reference_ids),
    )
