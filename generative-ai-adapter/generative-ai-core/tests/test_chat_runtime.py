"""移植元 CoreChatAndRagRuntimeTest・CoreImageExplanationRuntimeTest の移植。"""

from collections.abc import Callable

from generative_ai_core.chat.models import (
    CoreChatRequest,
    CoreChatRequestBuilder,
    CoreChatResult,
    CoreImageExplanationRequest,
    CoreImageExplanationResult,
    CoreMedia,
    CoreMessage,
    CoreRagContext,
    CoreRagRequest,
    OutputModeHint,
    Role,
)
from generative_ai_core.chat.runtime import CoreChatRuntime
from generative_ai_core.network.setting import CoreNetworkSetting
from generative_ai_core.provider.model import (
    Capability,
    CoreCredential,
    CoreProviderId,
    RuntimeProviderConfiguration,
)
from generative_ai_core.provider.runtime import CoreProviderRuntime, ExecutionContext


def _runtime(
    provider_id: str,
    capability: Capability,
    request_type: type,
    executor: Callable[[object, ExecutionContext], object],
) -> CoreChatRuntime:
    """1 つの実行器だけを登録した chat runtime を作る。

    Parameters
    ----------
    provider_id : str
        登録するプロバイダ。
    capability : Capability
        登録する能力。
    request_type : type
        実行器が受け取るリクエストの型。
    executor : Callable[[object, ExecutionContext], object]
        実行器。

    Returns
    -------
    CoreChatRuntime
        作った runtime。
    """
    return CoreChatRuntime(
        CoreProviderRuntime.builder()
        .register(provider_id, capability, request_type, executor)
        .build()
    )


def _rag_request() -> CoreRagRequest:
    """質問 1 件とコンテキスト 1 件の RAG リクエストを作る。

    Returns
    -------
    CoreRagRequest
        RAG のリクエスト。
    """
    chat_request = (
        CoreChatRequestBuilder("openai")
        .messages([CoreMessage.user("question")])
        .build()
    )
    return CoreRagRequest(
        chat_request, (CoreRagContext("doc-1.txt", "content", ("ref-1",)),)
    )


def _image_request() -> CoreImageExplanationRequest:
    """diagram.png 1 枚の画像説明リクエストを作る。

    Returns
    -------
    CoreImageExplanationRequest
        画像説明のリクエスト。
    """
    return CoreImageExplanationRequest(
        "OpenAI",
        CoreNetworkSetting.defaults(),
        "画像を説明してください",
        "",
        (CoreMedia("image/png", "diagram.png", b"\x01"),),
    )


def test_executes_chat_through_provider_boundary_with_output_mode_and_refs() -> None:
    """chat がプロバイダの境界を通り、出力モードと参照を返すこと"""

    def handle(request: object, context: ExecutionContext) -> CoreChatResult:
        """最後のユーザーの発言を回答にする。

        Parameters
        ----------
        request : object
            chat のリクエスト。
        context : ExecutionContext
            実行の文脈。

        Returns
        -------
        CoreChatResult
            回答。
        """
        assert isinstance(request, CoreChatRequest)
        return CoreChatResult.success(
            "answer:" + request.last_user_text(),
            ["context-a"],
            request.output_mode_hint,
        )

    runtime = _runtime("openai", Capability.CHAT, CoreChatRequest, handle)
    request = (
        CoreChatRequestBuilder("openai")
        .network_setting(CoreNetworkSetting.defaults())
        .output_mode_hint(OutputModeHint.RETRIEVAL_ANSWER_JSON)
        .messages([CoreMessage.user("hello"), CoreMessage.system("be concise")])
        .build()
    )

    result = runtime.chat(request)

    assert result.answer == "answer:hello"
    assert result.references == ("context-a",)
    assert result.output_mode_hint == OutputModeHint.RETRIEVAL_ANSWER_JSON
    assert result.failure is None


def test_core_message_carries_media_without_losing_text() -> None:
    """メッセージが本文を失わずにメディアを運ぶこと"""
    media = CoreMedia("image/png", "embedded-image-1", b"\x01\x02\x03")
    message = CoreMessage(Role.USER, "describe this", ("embedded-image-1",), (media,))

    assert message.content == "describe this"
    assert message.media_references == ("embedded-image-1",)
    assert message.media == (media,)

    def handle(request: object, context: ExecutionContext) -> CoreChatResult:
        """プロバイダに届いたメッセージを確かめる。

        Parameters
        ----------
        request : object
            chat のリクエスト。
        context : ExecutionContext
            実行の文脈。

        Returns
        -------
        CoreChatResult
            固定の回答。
        """
        assert isinstance(request, CoreChatRequest)
        assert request.messages[0].content == "describe this"
        assert request.messages[0].media == (media,)
        return CoreChatResult.success("media preserved", [], request.output_mode_hint)

    runtime = _runtime("openai", Capability.CHAT, CoreChatRequest, handle)

    result = runtime.chat(CoreChatRequestBuilder("openai").add_message(message).build())

    assert result.answer == "media preserved"
    assert result.failure is None


def test_executes_rag_request_with_contexts_and_sanitizes_failure_summary() -> None:
    """RAG の例外は秘密情報を伏せた失敗になること"""

    def handle(request: object, context: ExecutionContext) -> CoreChatResult:
        """コンテキストのパスを含む例外を投げる。

        Parameters
        ----------
        request : object
            RAG のリクエスト。
        context : ExecutionContext
            実行の文脈。

        Returns
        -------
        CoreChatResult
            返さない。

        Raises
        ------
        RuntimeError
            常に投げる。
        """
        assert isinstance(request, CoreRagRequest)
        raise RuntimeError(
            "secretRef=placeholder failed for " + request.contexts[0].path
        )

    runtime = _runtime("openai", Capability.RAG, CoreRagRequest, handle)

    result = runtime.rag(_rag_request())

    assert result.failure is not None
    assert "[REDACTED]" in result.failure.summary
    assert "placeholder" not in result.failure.summary
    assert result.references == ()


def test_rag_result_can_carry_answer_reference_ids() -> None:
    """RAG の結果が参照 ID を運ぶこと"""

    def handle(request: object, context: ExecutionContext) -> CoreChatResult:
        """参照 ID 付きの回答を返す。

        Parameters
        ----------
        request : object
            RAG のリクエスト。
        context : ExecutionContext
            実行の文脈。

        Returns
        -------
        CoreChatResult
            参照 ID 2・4 の回答。
        """
        assert isinstance(request, CoreRagRequest)
        return CoreChatResult.success(
            "rag answer", ["title"], request.chat_request.output_mode_hint, [2, 4]
        )

    runtime = _runtime("openai", Capability.RAG, CoreRagRequest, handle)

    result = runtime.rag(_rag_request())

    assert result.answer == "rag answer"
    assert result.reference_ids == (2, 4)
    assert result.failure is None


def test_candidate_json_response_option_reaches_provider_boundary() -> None:
    """候補抽出の JSON 応答の指定がプロバイダまで届くこと"""
    captured: list[CoreChatRequest] = []

    def handle(request: object, context: ExecutionContext) -> CoreChatResult:
        """リクエストを記録する。

        Parameters
        ----------
        request : object
            chat のリクエスト。
        context : ExecutionContext
            実行の文脈。

        Returns
        -------
        CoreChatResult
            空の JSON の回答。
        """
        assert isinstance(request, CoreChatRequest)
        captured.append(request)
        return CoreChatResult.success("{}", [], request.output_mode_hint)

    runtime = _runtime("OpenAI", Capability.CHAT, CoreChatRequest, handle)
    request = (
        CoreChatRequestBuilder("OpenAI")
        .candidate_json_response(True)
        .add_message(CoreMessage.user("Extract candidates."))
        .build()
    )

    runtime.chat(request)

    assert len(captured) == 1
    assert captured[0].candidate_json_response_requested()


def test_azure_open_ai_candidate_runtime_keeps_endpoint_and_deployment_separate() -> (
    None
):
    """Azure の接続先とデプロイ名が別々に保たれること"""
    configuration = RuntimeProviderConfiguration(
        CoreProviderId.AzureOpenAI,
        "candidate-deployment",
        "https://resource.openai.azure.com",
        CoreCredential.api_key("candidate-key", "AzureOpenAI"),
        CoreNetworkSetting.defaults(),
    )
    request = (
        CoreChatRequestBuilder(configuration.provider_id.canonical_name)
        .candidate_json_response(True)
        .build()
    )

    assert configuration.provider_id == CoreProviderId.AzureOpenAI
    assert configuration.endpoint == "https://resource.openai.azure.com"
    assert "/openai/deployments/" not in configuration.endpoint
    assert "api-version" not in configuration.endpoint
    assert configuration.model_name == "candidate-deployment"
    assert request.provider_id == "AzureOpenAI"
    assert request.candidate_json_response_requested()


def test_executes_image_explanation_through_core_provider_boundary() -> None:
    """画像説明がプロバイダの境界を通ること"""

    def handle(
        request: object, context: ExecutionContext
    ) -> CoreImageExplanationResult:
        """能力とメディアを確かめて説明を返す。

        Parameters
        ----------
        request : object
            画像説明のリクエスト。
        context : ExecutionContext
            実行の文脈。

        Returns
        -------
        CoreImageExplanationResult
            固定の説明。
        """
        assert isinstance(request, CoreImageExplanationRequest)
        assert context.capability == Capability.IMAGE_EXPLANATION
        assert [m.source_hint for m in request.media] == ["diagram.png"]
        return CoreImageExplanationResult.success("図の説明")

    runtime = _runtime(
        "OpenAI", Capability.IMAGE_EXPLANATION, CoreImageExplanationRequest, handle
    )

    result = runtime.explain_image(_image_request())

    assert result.explanation == "図の説明"
    assert result.failure is None
    assert result.explanation_present


def test_sanitizes_image_provider_failure_without_adapter_fallback() -> None:
    """画像説明の例外は秘密情報を伏せた失敗になること"""

    def handle(
        request: object, context: ExecutionContext
    ) -> CoreImageExplanationResult:
        """API キーを含む例外を投げる。

        Parameters
        ----------
        request : object
            画像説明のリクエスト。
        context : ExecutionContext
            実行の文脈。

        Returns
        -------
        CoreImageExplanationResult
            返さない。

        Raises
        ------
        RuntimeError
            常に投げる。
        """
        raise RuntimeError("apiKey=sk-secret failed for image")

    runtime = _runtime(
        "OpenAI", Capability.IMAGE_EXPLANATION, CoreImageExplanationRequest, handle
    )

    result = runtime.explain_image(_image_request())

    assert result.failure is not None
    assert result.failure.code == "IMAGE_EXPLANATION_PROVIDER_FAILURE"
    assert "[REDACTED]" in result.failure.summary
    assert "sk-secret" not in result.failure.summary
    assert not result.explanation_present


def test_passes_through_missing_explanation_result_for_adapter_fail_fast() -> None:
    """説明なしの結果はそのまま返ること"""
    runtime = _runtime(
        "OpenAI",
        Capability.IMAGE_EXPLANATION,
        CoreImageExplanationRequest,
        lambda request, context: CoreImageExplanationResult("", None, False),
    )

    result = runtime.explain_image(_image_request())

    assert result.failure is None
    assert not result.explanation_present
    assert result.explanation == ""


def test_passes_through_blank_explanation_result_for_adapter_fail_fast() -> None:
    """空白だけの説明はそのまま返ること"""
    runtime = _runtime(
        "OpenAI",
        Capability.IMAGE_EXPLANATION,
        CoreImageExplanationRequest,
        lambda request, context: CoreImageExplanationResult.success("   "),
    )

    result = runtime.explain_image(_image_request())

    assert result.failure is None
    assert result.explanation_present
    assert not result.explanation.strip()
