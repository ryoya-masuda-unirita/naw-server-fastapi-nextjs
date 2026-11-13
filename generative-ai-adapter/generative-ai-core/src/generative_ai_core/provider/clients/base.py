"""プロバイダクライアントの共通部分（移植元 CoreProviderChatClient・
GenericCoreProviderChatClient・UnsupportedCoreProviderChatClient）。"""

import logging
from collections.abc import Callable, Mapping
from typing import Protocol

from generative_ai_core import failure as failures
from generative_ai_core.chat.models import (
    NO_STREAM_CALLBACKS,
    CoreChatRequest,
    CoreChatResult,
    CoreImageExplanationRequest,
    CoreImageExplanationResult,
    CoreRagRequest,
    CoreStreamCallbacks,
)
from generative_ai_core.failure import CoreFailure
from generative_ai_core.network.transport import describe
from generative_ai_core.provider.model import (
    Capability,
    CoreCredential,
    CoreProviderCapabilityStatus,
    CoreProviderId,
    RuntimeProviderConfiguration,
    unsupported_capability_failure,
)
from generative_ai_core.provider.runtime import ExecutionContext

logger = logging.getLogger(__name__)

CONTROLLED_ENDPOINT = "https://provider.example.invalid"


class CoreProviderChatClient(Protocol):
    """プロバイダのクライアントが備えるインターフェース。"""

    @property
    def provider_id(self) -> CoreProviderId:
        """プロバイダを返す。

        Returns
        -------
        CoreProviderId
            このクライアントのプロバイダ。
        """
        ...

    def supported_capabilities(self) -> set[Capability]:
        """対応している機能を返す。

        Returns
        -------
        set[Capability]
            対応している機能。
        """
        ...

    def capability_statuses(
        self,
    ) -> Mapping[Capability, CoreProviderCapabilityStatus]:
        """機能ごとの対応状況を返す。

        Returns
        -------
        Mapping[Capability, CoreProviderCapabilityStatus]
            機能ごとの対応状況。
        """
        ...

    def chat(
        self, request: CoreChatRequest, context: ExecutionContext
    ) -> CoreChatResult:
        """チャットを実行する。

        Parameters
        ----------
        request : CoreChatRequest
            チャットのリクエスト。
        context : ExecutionContext
            実行時の文脈。

        Returns
        -------
        CoreChatResult
            チャットの結果。
        """
        ...

    def rag(self, request: CoreRagRequest, context: ExecutionContext) -> CoreChatResult:
        """RAG を実行する。

        Parameters
        ----------
        request : CoreRagRequest
            RAG のリクエスト。
        context : ExecutionContext
            実行時の文脈。

        Returns
        -------
        CoreChatResult
            RAG の結果。
        """
        ...

    def image_explanation(
        self, request: CoreImageExplanationRequest, context: ExecutionContext
    ) -> CoreImageExplanationResult:
        """画像説明を実行する。

        Parameters
        ----------
        request : CoreImageExplanationRequest
            画像説明のリクエスト。
        context : ExecutionContext
            実行時の文脈。

        Returns
        -------
        CoreImageExplanationResult
            画像説明の結果。
        """
        ...


class Transport(Protocol):
    """プロバイダへの実際の送信（移植元 CoreProviderChatClient.Transport）。"""

    def chat(
        self,
        configuration: RuntimeProviderConfiguration,
        request: CoreChatRequest,
        context: ExecutionContext,
    ) -> CoreChatResult:
        """チャットをプロバイダへ送信する。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定。
        request : CoreChatRequest
            チャットのリクエスト。
        context : ExecutionContext
            実行時の文脈。

        Returns
        -------
        CoreChatResult
            チャットの結果。
        """
        ...

    def rag(
        self,
        configuration: RuntimeProviderConfiguration,
        request: CoreRagRequest,
        context: ExecutionContext,
    ) -> CoreChatResult:
        """RAG をプロバイダへ送信する。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定。
        request : CoreRagRequest
            RAG のリクエスト。
        context : ExecutionContext
            実行時の文脈。

        Returns
        -------
        CoreChatResult
            RAG の結果。
        """
        ...

    def image_explanation(
        self,
        configuration: RuntimeProviderConfiguration,
        request: CoreImageExplanationRequest,
        context: ExecutionContext,
    ) -> CoreImageExplanationResult:
        """画像説明をプロバイダへ送信する。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定。
        request : CoreImageExplanationRequest
            画像説明のリクエスト。
        context : ExecutionContext
            実行時の文脈。

        Returns
        -------
        CoreImageExplanationResult
            画像説明の結果。
        """
        ...


class ChatTransportBase:
    """画像説明を chat 1 回で行う既定実装（移植元 Transport の既定実装）。"""

    def chat(
        self,
        configuration: RuntimeProviderConfiguration,
        request: CoreChatRequest,
        context: ExecutionContext,
    ) -> CoreChatResult:
        """チャットを送信する。サブクラスで実装する。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定。
        request : CoreChatRequest
            チャットのリクエスト。
        context : ExecutionContext
            実行時の文脈。

        Returns
        -------
        CoreChatResult
            チャットの結果。

        Raises
        ------
        NotImplementedError
            サブクラスが実装していない場合。
        """
        raise NotImplementedError

    def image_explanation(
        self,
        configuration: RuntimeProviderConfiguration,
        request: CoreImageExplanationRequest,
        context: ExecutionContext,
    ) -> CoreImageExplanationResult:
        """画像説明を chat 1 回で行う。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定。
        request : CoreImageExplanationRequest
            画像説明のリクエスト。
        context : ExecutionContext
            実行時の文脈。

        Returns
        -------
        CoreImageExplanationResult
            画像説明の結果。
        """
        return CoreImageExplanationResult.from_chat_result(
            self.chat(configuration, request.to_chat_request(), context)
        )


def stream_callbacks(request: CoreChatRequest | None) -> CoreStreamCallbacks:
    """リクエストのストリームコールバックを返す。

    Parameters
    ----------
    request : CoreChatRequest | None
        チャットのリクエスト。

    Returns
    -------
    CoreStreamCallbacks
        リクエストのコールバック。リクエストがなければ何もしないコールバック。
    """
    return NO_STREAM_CALLBACKS if request is None else request.stream_callbacks()


def _supported_statuses(
    provider_id: CoreProviderId, evidence: str, network_evidence: str
) -> dict[Capability, CoreProviderCapabilityStatus]:
    """chat・RAG・画像説明がすべて対応済みの状況を作る。

    Parameters
    ----------
    provider_id : CoreProviderId
        プロバイダ。
    evidence : str
        根拠。
    network_evidence : str
        ネットワーク設定の根拠。

    Returns
    -------
    dict[Capability, CoreProviderCapabilityStatus]
        機能ごとの対応状況。
    """
    return {
        capability: CoreProviderCapabilityStatus.supported(
            provider_id, capability, evidence, network_evidence
        )
        for capability in (
            Capability.CHAT,
            Capability.RAG,
            Capability.IMAGE_EXPLANATION,
        )
    }


class GenericCoreProviderChatClient:
    """送信（Transport）に委ね、例外を失敗の結果にする。

    通常 chat の tools はこのクライアントでは扱えない（SecuAiGent だけが対応）。
    """

    def __init__(
        self,
        provider_id: CoreProviderId,
        configuration: RuntimeProviderConfiguration,
        transport: Transport,
        evidence: str,
    ) -> None:
        """プロバイダ・設定・送信を受け取る。

        Parameters
        ----------
        provider_id : CoreProviderId
            プロバイダ。
        configuration : RuntimeProviderConfiguration
            プロバイダの設定。
        transport : Transport
            プロバイダへの送信。
        evidence : str
            対応状況の根拠。
        """
        self._provider_id = provider_id
        self._configuration = configuration
        self._transport = transport
        self._statuses = _supported_statuses(
            provider_id, evidence, describe(configuration.network_setting)
        )

    @property
    def provider_id(self) -> CoreProviderId:
        """プロバイダを返す。

        Returns
        -------
        CoreProviderId
            このクライアントのプロバイダ。
        """
        return self._provider_id

    def supported_capabilities(self) -> set[Capability]:
        """対応している機能を返す。

        Returns
        -------
        set[Capability]
            対応している機能。
        """
        return set(self._statuses)

    def capability_statuses(self) -> Mapping[Capability, CoreProviderCapabilityStatus]:
        """機能ごとの対応状況を返す。

        Returns
        -------
        Mapping[Capability, CoreProviderCapabilityStatus]
            機能ごとの対応状況のコピー。
        """
        return dict(self._statuses)

    def chat(
        self, request: CoreChatRequest, context: ExecutionContext
    ) -> CoreChatResult:
        """チャットを送信し、例外は失敗の結果にする。

        Parameters
        ----------
        request : CoreChatRequest
            チャットのリクエスト。
        context : ExecutionContext
            実行時の文脈。

        Returns
        -------
        CoreChatResult
            チャットの結果。tools を指定した場合や送信に失敗した場合は失敗の結果。
        """
        if request.tools():
            return CoreChatResult.from_failure(
                _tools_unavailable_failure(request), request.output_mode_hint
            )
        try:
            return self._transport.chat(self._configuration, request, context)
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            logger.warning(
                "provider chat failed: provider=%s, error=%s",
                self._provider_id,
                type(e).__name__,
            )
            return CoreChatResult.from_failure(
                CoreFailure.from_exception("CHAT_PROVIDER_FAILURE", e),
                request.output_mode_hint,
            )

    def rag(self, request: CoreRagRequest, context: ExecutionContext) -> CoreChatResult:
        """RAG を送信し、例外は失敗の結果にする。

        Parameters
        ----------
        request : CoreRagRequest
            RAG のリクエスト。
        context : ExecutionContext
            実行時の文脈。

        Returns
        -------
        CoreChatResult
            RAG の結果。送信に失敗した場合は失敗の結果。
        """
        try:
            return self._transport.rag(self._configuration, request, context)
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            logger.warning(
                "provider rag failed: provider=%s, error=%s",
                self._provider_id,
                type(e).__name__,
            )
            return CoreChatResult.from_failure(
                CoreFailure.from_exception("RAG_PROVIDER_FAILURE", e),
                request.chat_request.output_mode_hint,
            )

    def image_explanation(
        self, request: CoreImageExplanationRequest, context: ExecutionContext
    ) -> CoreImageExplanationResult:
        """画像説明を送信し、例外は失敗の結果にする。

        Parameters
        ----------
        request : CoreImageExplanationRequest
            画像説明のリクエスト。
        context : ExecutionContext
            実行時の文脈。

        Returns
        -------
        CoreImageExplanationResult
            画像説明の結果。送信に失敗した場合は失敗の結果。
        """
        try:
            return self._transport.image_explanation(
                self._configuration, request, context
            )
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            return CoreImageExplanationResult.from_failure(
                CoreFailure.from_exception("IMAGE_EXPLANATION_PROVIDER_FAILURE", e)
            )


def _tools_unavailable_failure(request: CoreChatRequest) -> CoreFailure:
    """tools を扱えないときの失敗を作る。

    Parameters
    ----------
    request : CoreChatRequest
        tools を含むチャットのリクエスト。

    Returns
    -------
    CoreFailure
        承認の継続が必要な場合はその失敗、それ以外は tools 変換不可の失敗。
    """
    unsupported_approval = any(
        tool.require_approval is None or tool.require_approval != "never"
        for tool in request.tools()
        if tool.is_mcp
    )
    if unsupported_approval:
        return CoreFailure.of(
            failures.UNSUPPORTED_APPROVAL_CONTINUATION,
            "unsupported_approval_continuation: provider tools require approval "
            "continuation support unavailable.",
        )
    return CoreFailure.of(
        failures.UNAVAILABLE_TOOLS_MAPPING,
        "unavailable_tools_mapping: Responses tools mapping is unavailable for this "
        "provider.",
    )


class UnsupportedCoreProviderChatClient:
    """移植元で未対応のプロバイダ。理由付きの失敗を返す。"""

    def __init__(
        self, provider_id: CoreProviderId, reason: str, evidence: str, follow_up: str
    ) -> None:
        """未対応の理由・根拠・今後の対応を受け取る。

        Parameters
        ----------
        provider_id : CoreProviderId
            プロバイダ。
        reason : str
            未対応の理由。
        evidence : str
            根拠。
        follow_up : str
            今後の対応。
        """
        self._provider_id = provider_id
        network_evidence = f"{evidence}; network=network-unverified"
        self._statuses = {
            capability: CoreProviderCapabilityStatus.unsupported(
                provider_id, capability, reason, network_evidence, follow_up
            )
            for capability in (
                Capability.CHAT,
                Capability.RAG,
                Capability.IMAGE_EXPLANATION,
            )
        }

    @property
    def provider_id(self) -> CoreProviderId:
        """プロバイダを返す。

        Returns
        -------
        CoreProviderId
            このクライアントのプロバイダ。
        """
        return self._provider_id

    def supported_capabilities(self) -> set[Capability]:
        """対応している機能を返す。

        Returns
        -------
        set[Capability]
            常に空の集合。
        """
        return set()

    def capability_statuses(self) -> Mapping[Capability, CoreProviderCapabilityStatus]:
        """機能ごとの対応状況を返す。

        Returns
        -------
        Mapping[Capability, CoreProviderCapabilityStatus]
            機能ごとの未対応の状況のコピー。
        """
        return dict(self._statuses)

    def chat(
        self, request: CoreChatRequest, context: ExecutionContext
    ) -> CoreChatResult:
        """チャットは未対応の失敗を返す。

        Parameters
        ----------
        request : CoreChatRequest
            チャットのリクエスト。
        context : ExecutionContext
            実行時の文脈（使わない）。

        Returns
        -------
        CoreChatResult
            未対応を表す失敗の結果。
        """
        if request.tools():
            return CoreChatResult.from_failure(
                CoreFailure.of(
                    failures.UNSUPPORTED_TOOLS_PROVIDER,
                    "unsupported_tools_provider: tools are supported only for "
                    "configured normal chat providers.",
                ),
                request.output_mode_hint,
            )
        return CoreChatResult.from_failure(
            unsupported_capability_failure(self._statuses[Capability.CHAT]),
            request.output_mode_hint,
        )

    def rag(self, request: CoreRagRequest, context: ExecutionContext) -> CoreChatResult:
        """RAG は未対応の失敗を返す。

        Parameters
        ----------
        request : CoreRagRequest
            RAG のリクエスト。
        context : ExecutionContext
            実行時の文脈（使わない）。

        Returns
        -------
        CoreChatResult
            未対応を表す失敗の結果。
        """
        return CoreChatResult.from_failure(
            unsupported_capability_failure(self._statuses[Capability.RAG]),
            request.chat_request.output_mode_hint,
        )

    def image_explanation(
        self, request: CoreImageExplanationRequest, context: ExecutionContext
    ) -> CoreImageExplanationResult:
        """画像説明は未対応の失敗を返す。

        Parameters
        ----------
        request : CoreImageExplanationRequest
            画像説明のリクエスト。
        context : ExecutionContext
            実行時の文脈（使わない）。

        Returns
        -------
        CoreImageExplanationResult
            未対応を表す失敗の結果。
        """
        return CoreImageExplanationResult.from_failure(
            unsupported_capability_failure(self._statuses[Capability.IMAGE_EXPLANATION])
        )


ChatHandler = Callable[[CoreChatRequest, ExecutionContext], CoreChatResult]
RagHandler = Callable[[CoreRagRequest, ExecutionContext], CoreChatResult]


class _HandlerTransport(ChatTransportBase):
    """ハンドラ関数に処理を渡す送信（テスト用）。"""

    def __init__(self, chat_handler: ChatHandler, rag_handler: RagHandler) -> None:
        """chat と RAG のハンドラを受け取る。

        Parameters
        ----------
        chat_handler : ChatHandler
            chat を処理するハンドラ。
        rag_handler : RagHandler
            RAG を処理するハンドラ。
        """
        self._chat_handler = chat_handler
        self._rag_handler = rag_handler

    def chat(
        self,
        configuration: RuntimeProviderConfiguration,
        request: CoreChatRequest,
        context: ExecutionContext,
    ) -> CoreChatResult:
        """chat をハンドラに渡す。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定（使わない）。
        request : CoreChatRequest
            チャットのリクエスト。
        context : ExecutionContext
            実行時の文脈。

        Returns
        -------
        CoreChatResult
            ハンドラの結果。
        """
        return self._chat_handler(request, context)

    def rag(
        self,
        configuration: RuntimeProviderConfiguration,
        request: CoreRagRequest,
        context: ExecutionContext,
    ) -> CoreChatResult:
        """RAG をハンドラに渡す。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定（使わない）。
        request : CoreRagRequest
            RAG のリクエスト。
        context : ExecutionContext
            実行時の文脈。

        Returns
        -------
        CoreChatResult
            ハンドラの結果。
        """
        return self._rag_handler(request, context)


def controlled(
    provider_id: CoreProviderId,
    transport: Transport | None = None,
    *,
    chat_handler: ChatHandler | None = None,
    rag_handler: RagHandler | None = None,
) -> GenericCoreProviderChatClient:
    """テスト用に送信を差し替えたクライアントを作る（移植元 controlled）。

    Parameters
    ----------
    provider_id : CoreProviderId
        プロバイダ。
    transport : Transport | None, default None
        差し替える送信。None なら chat_handler と rag_handler から作る。
    chat_handler : ChatHandler | None, default None
        chat のハンドラ。
    rag_handler : RagHandler | None, default None
        RAG のハンドラ。

    Returns
    -------
    GenericCoreProviderChatClient
        送信を差し替えたクライアント。

    Raises
    ------
    ValueError
        送信もハンドラ 2 つも指定されていない場合。
    """
    if transport is None:
        if chat_handler is None or rag_handler is None:
            raise ValueError("transport or both handlers are required")
        transport = _HandlerTransport(chat_handler, rag_handler)
    configuration = RuntimeProviderConfiguration(
        provider_id,
        "controlled",
        CONTROLLED_ENDPOINT,
        CoreCredential.api_key("controlled-secret"),
    )
    return GenericCoreProviderChatClient(
        provider_id, configuration, transport, "controlled provider test"
    )
