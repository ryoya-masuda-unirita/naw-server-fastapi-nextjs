"""移植元 CoreProviderRuntimeTest・CoreProviderRuntimeFactoryTest・
CoreProviderRuntimeFactoryNetworkTest・CoreProviderNetworkApplicationTest・
CoreProviderFailureRedactionTest・CoreProviderCapabilityMatrixTest の移植。

移植元の CoreProviderNetworkAdapter（Apache HttpClient・Azure SDK の生成）は
Python では `network.transport.client_options` に当たる。Embedding の登録は
未移植のため、CoreProviderCapabilityMatrixTest の embedding の検証は対象外。
"""

from collections.abc import Callable

import httpx
import pytest
from generative_ai_core.chat.models import (
    CoreChatRequest,
    CoreChatRequestBuilder,
    CoreChatResult,
    CoreImageExplanationRequest,
    CoreMedia,
    CoreMessage,
    CoreRagContext,
    CoreRagRequest,
)
from generative_ai_core.chat.runtime import CoreChatRuntime
from generative_ai_core.network.setting import CoreNetworkSetting, CoreProxySetting
from generative_ai_core.network.transport import client_options, describe
from generative_ai_core.provider.clients.base import (
    CoreProviderChatClient,
    controlled,
)
from generative_ai_core.provider.clients.secuaigent import keys
from generative_ai_core.provider.clients.secuaigent.transport import (
    SecuAiGentCoreChatClient,
)
from generative_ai_core.provider.factory import CoreProviderRuntimeFactory
from generative_ai_core.provider.model import (
    Capability,
    CapabilityStatusKind,
    CoreCredential,
    CoreProviderCapabilityStatus,
    CoreProviderId,
    RuntimeProviderConfiguration,
)
from generative_ai_core.provider.runtime import (
    CoreProviderRuntime,
    ExecutionContext,
    ProviderExecutionError,
)

ALL_CHAT_CAPABILITIES = (
    Capability.CHAT,
    Capability.RAG,
    Capability.IMAGE_EXPLANATION,
)
ANTHROPIC_PROBE = "dependency-probe=spring-ai-starter-model-anthropic:1.1.7:pass"
GENAI_PROBE = "dependency-probe=spring-ai-starter-model-google-genai:1.1.7:pass"
MANUAL_PROXY = CoreProxySetting.manual("proxy.example", 8080, "proxyUser", "proxyPass")
DEFAULT_TIMEOUT = 180
SYSTEM_TIMEOUT = 120
MANUAL_TIMEOUT = 240
MIN_TIMEOUT = 60


def _chat_request(provider_name: str) -> CoreChatRequest:
    """`hello` だけを送る chat リクエストを作る。

    Parameters
    ----------
    provider_name : str
        プロバイダの名前。

    Returns
    -------
    CoreChatRequest
        chat リクエスト。
    """
    return (
        CoreChatRequestBuilder(provider_name)
        .add_message(CoreMessage.user("hello"))
        .build()
    )


def _rag_request(chat_request: CoreChatRequest) -> CoreRagRequest:
    """コンテキスト 1 件（doc.md）の RAG リクエストを作る。

    Parameters
    ----------
    chat_request : CoreChatRequest
        元になる chat リクエスト。

    Returns
    -------
    CoreRagRequest
        RAG リクエスト。
    """
    return CoreRagRequest(
        chat_request, (CoreRagContext("doc.md", "context", ("doc.md",)),)
    )


def _controlled_client(
    contexts: list[ExecutionContext],
) -> Callable[[CoreProviderId], CoreProviderChatClient]:
    """受け取った実行コンテキストを記録する差し替えクライアントの工場を返す。

    Parameters
    ----------
    contexts : list[ExecutionContext]
        実行コンテキストの記録先。

    Returns
    -------
    Callable[[CoreProviderId], CoreProviderChatClient]
        プロバイダを受け取り、差し替えクライアントを返す関数。
    """

    def build(provider_id: CoreProviderId) -> CoreProviderChatClient:
        """差し替えクライアントを作る。

        Parameters
        ----------
        provider_id : CoreProviderId
            プロバイダ。

        Returns
        -------
        CoreProviderChatClient
            実行コンテキストを記録するクライアント。
        """

        def chat_handler(
            request: CoreChatRequest, context: ExecutionContext
        ) -> CoreChatResult:
            """chat の呼び出しを記録して成功を返す。

            Parameters
            ----------
            request : CoreChatRequest
                chat リクエスト。
            context : ExecutionContext
                実行コンテキスト。

            Returns
            -------
            CoreChatResult
                成功の結果。
            """
            contexts.append(context)
            return CoreChatResult.success("chat-ok", [], request.output_mode_hint)

        def rag_handler(
            request: CoreRagRequest, context: ExecutionContext
        ) -> CoreChatResult:
            """RAG の呼び出しを記録して成功を返す。

            Parameters
            ----------
            request : CoreRagRequest
                RAG リクエスト。
            context : ExecutionContext
                実行コンテキスト。

            Returns
            -------
            CoreChatResult
                成功の結果。
            """
            contexts.append(context)
            return CoreChatResult.success(
                "rag-ok", ["doc.md"], request.chat_request.output_mode_hint, [0]
            )

        return controlled(
            provider_id, chat_handler=chat_handler, rag_handler=rag_handler
        )

    return build


def _status_for(
    matrix: dict[CoreProviderId, list[CoreProviderCapabilityStatus]],
    provider_id: CoreProviderId,
    capability: Capability,
) -> CoreProviderCapabilityStatus:
    """行列から、プロバイダと能力に当たる状態を取り出す。

    Parameters
    ----------
    matrix : dict[CoreProviderId, list[CoreProviderCapabilityStatus]]
        能力の行列。
    provider_id : CoreProviderId
        プロバイダ。
    capability : Capability
        能力。

    Returns
    -------
    CoreProviderCapabilityStatus
        当たる状態。

    Raises
    ------
    StopIteration
        当たる状態がないとき。
    """
    return next(s for s in matrix[provider_id] if s.capability == capability)


def _assert_unsupported_attempt(
    status: CoreProviderCapabilityStatus, dependency_probe: str, scope_boundary: str
) -> None:
    """未対応の状態が、試行の証跡・理由・後続対応を持つことを確かめる。

    Parameters
    ----------
    status : CoreProviderCapabilityStatus
        確かめる状態。
    dependency_probe : str
        証跡に含まれるべき依存の確認。
    scope_boundary : str
        証跡に含まれるべき範囲の境界。
    """
    assert status.status == CapabilityStatusKind.UNSUPPORTED
    assert dependency_probe in status.evidence
    assert scope_boundary in status.evidence
    assert "SDK limitation" in status.reason or "scope violation" in status.reason
    assert status.follow_up.strip()
    for secret in ("sk-", "Bearer ", "proxyPassword"):
        assert secret not in status.evidence


def test_routes_execution_through_vendor_id_neutral_provider_registration() -> None:
    """登録した実行器にプロバイダ・能力・タイムアウトを渡して実行できること"""

    def executor(request: object, context: ExecutionContext) -> str:
        """渡された値を文字列にまとめて返す。

        Parameters
        ----------
        request : object
            リクエスト。
        context : ExecutionContext
            実行コンテキスト。

        Returns
        -------
        str
            プロバイダ・能力・リクエスト・タイムアウトをまとめた文字列。
        """
        return (
            f"provider={context.provider_id} capability={context.capability.value} "
            f"request={request} timeout={context.network_setting.timeout_seconds}"
        )

    runtime = (
        CoreProviderRuntime.builder()
        .register("openai", Capability.CHAT, str, executor)
        .build()
    )

    result = runtime.execute(
        "openai", Capability.CHAT, "hello", CoreNetworkSetting.defaults(), str
    )

    assert result == "provider=openai capability=CHAT request=hello timeout=180"
    assert runtime.supports("openai", Capability.CHAT)
    assert runtime.providers() == ["openai"]


def test_rejects_missing_provider_boundary_instead_of_falling_through() -> None:
    """未登録のプロバイダは黙って流さず、実行時エラーにすること"""
    runtime = CoreProviderRuntime.builder().build()

    with pytest.raises(ProviderExecutionError, match="No provider executor"):
        runtime.execute(
            "0", Capability.CHAT, "hello", CoreNetworkSetting.defaults(), str
        )


def test_registers_open_ai_and_azure_chat_rag_without_consumer_executor(
    make_configuration: Callable[..., RuntimeProviderConfiguration],
) -> None:
    """利用側が実行器を登録しなくても OpenAI・Azure の 3 能力が使えること"""
    for provider in (CoreProviderId.OpenAI, CoreProviderId.AzureOpenAI):
        runtime = CoreProviderRuntimeFactory.create_provider_runtime(
            make_configuration(provider)
        )

        for capability in ALL_CHAT_CAPABILITIES:
            assert runtime.supports(provider.canonical_name, capability)


def test_factory_owned_runtime_executes_controlled_client_without_registration(
    make_configuration: Callable[..., RuntimeProviderConfiguration],
) -> None:
    """差し替えたクライアントを工場の runtime が chat・RAG・画像説明で呼ぶこと"""
    configuration = make_configuration(CoreProviderId.OpenAI)

    def chat_handler(
        request: CoreChatRequest, context: ExecutionContext
    ) -> CoreChatResult:
        """プロバイダ名と最後の発言を答えにする。

        Parameters
        ----------
        request : CoreChatRequest
            chat リクエスト。
        context : ExecutionContext
            実行コンテキスト。

        Returns
        -------
        CoreChatResult
            成功の結果。
        """
        return CoreChatResult.success(
            f"chat:{context.provider_id}:{request.last_user_text()}",
            [],
            request.output_mode_hint,
        )

    def rag_handler(
        request: CoreRagRequest, context: ExecutionContext
    ) -> CoreChatResult:
        """プロバイダ名と最初のコンテキストのパスを答えにする。

        Parameters
        ----------
        request : CoreRagRequest
            RAG リクエスト。
        context : ExecutionContext
            実行コンテキスト。

        Returns
        -------
        CoreChatResult
            成功の結果。
        """
        return CoreChatResult.success(
            f"rag:{context.provider_id}:{request.contexts[0].path}",
            ["doc.md"],
            request.chat_request.output_mode_hint,
            [0],
        )

    factory = CoreProviderRuntimeFactory.with_clients(
        {
            CoreProviderId.OpenAI: controlled(
                CoreProviderId.OpenAI,
                chat_handler=chat_handler,
                rag_handler=rag_handler,
            )
        }
    )
    runtime = factory.create_runtime(configuration)
    chat_request = _chat_request("OpenAI")
    image_request = CoreImageExplanationRequest(
        "OpenAI",
        instruction="describe",
        media=(CoreMedia("image/png", "diagram.png", b"\x01"),),
    )

    chat_result = runtime.chat(chat_request)
    rag_result = runtime.rag(_rag_request(chat_request))
    image_result = runtime.explain_image(image_request)

    assert chat_result.answer == "chat:OpenAI:hello"
    assert rag_result.answer == "rag:OpenAI:doc.md"
    assert rag_result.references == ("doc.md",)
    assert rag_result.reference_ids == (0,)
    assert image_result.explanation == "chat:OpenAI:describe"


def test_supported_provider_factory_evidence_includes_ssl_proxy_and_timeout(
    make_configuration: Callable[..., RuntimeProviderConfiguration],
) -> None:
    """工場の runtime が 3 能力を持ち、ネットワーク設定の適用内容を証跡にできること"""
    network_setting = CoreNetworkSetting(MANUAL_PROXY, True, MIN_TIMEOUT)
    configuration = make_configuration(
        CoreProviderId.OpenAI,
        endpoint="https://provider.example.invalid/v1",
        network_setting=network_setting,
    )

    runtime = CoreProviderRuntimeFactory.create_provider_runtime(configuration)
    options = client_options(network_setting)
    evidence = describe(network_setting)

    for capability in ALL_CHAT_CAPABILITIES:
        assert runtime.supports("OpenAI", capability)
    assert "manual-proxy" in evidence
    assert "proxy-credentials=present" in evidence
    assert "insecure-ssl=true" in evidence
    assert "timeout=60" in evidence
    assert options["proxy"] == "http://proxyUser:proxyPass@proxy.example:8080"
    assert options["verify"] is False
    assert options["timeout"] == httpx.Timeout(60.0)


def test_provider_client_receives_core_network_setting_through_context(
    make_configuration: Callable[..., RuntimeProviderConfiguration],
) -> None:
    """chat・RAG の実行コンテキストでネットワーク設定が渡ること"""
    network_setting = CoreNetworkSetting(MANUAL_PROXY, True, MANUAL_TIMEOUT)
    configuration = make_configuration(
        CoreProviderId.OpenAI,
        endpoint="https://provider.example.invalid/v1",
        network_setting=network_setting,
    )
    contexts: list[ExecutionContext] = []
    client = _controlled_client(contexts)(CoreProviderId.OpenAI)
    runtime = CoreProviderRuntimeFactory.with_clients(
        {CoreProviderId.OpenAI: client}
    ).create_runtime(configuration)
    chat_request = CoreChatRequestBuilder("OpenAI").network_setting(network_setting)
    chat_request.add_message(CoreMessage.user("hello"))
    request = chat_request.build()

    runtime.chat(request)
    runtime.rag(_rag_request(request))

    assert [c.network_setting for c in contexts] == [network_setting, network_setting]
    evidence = describe(network_setting)
    for expected in (
        "manual-proxy",
        "proxy-credentials=present",
        "insecure-ssl=true",
        "timeout=240",
    ):
        assert expected in evidence


def test_network_description_covers_each_proxy_mode_without_leaking_credentials() -> (
    None
):
    """プロキシの種類ごとに証跡を作り、ホスト名・認証情報を出さないこと"""
    assert (
        describe(None)
        == "no-proxy,proxy-credentials=absent,insecure-ssl=false,timeout=180"
    )

    manual = describe(
        CoreNetworkSetting(
            CoreProxySetting.manual(" proxy.example ", 8080), False, MIN_TIMEOUT
        )
    )
    assert "manual-proxy" in manual
    assert "proxy-credentials=absent" in manual
    assert "timeout=60" in manual
    assert "proxy.example" not in manual

    system = describe(CoreNetworkSetting(CoreProxySetting.system(), True, 120))
    assert (
        system == "system-proxy,proxy-credentials=absent,insecure-ssl=true,timeout=120"
    )


def test_client_options_cover_each_proxy_and_ssl_boundary_without_network_calls() -> (
    None
):
    """プロキシ・SSL の組み合わせごとに httpx.Client を作れること"""
    settings = [
        CoreNetworkSetting.defaults(),
        CoreNetworkSetting(CoreProxySetting.manual("proxy.example", 8080, "", "pw")),
        CoreNetworkSetting(MANUAL_PROXY, True, MIN_TIMEOUT),
        CoreNetworkSetting(CoreProxySetting.system(), False, MIN_TIMEOUT),
    ]

    for setting in settings:
        options = client_options(setting)
        with httpx.Client(**options) as client:
            assert client is not None
        assert options["timeout"] == httpx.Timeout(float(setting.timeout_seconds))
    assert "proxy" not in client_options(settings[0])
    assert client_options(settings[0])["trust_env"] is False
    assert client_options(settings[3])["trust_env"] is True
    assert client_options(settings[2])["verify"] is False


def test_provider_communication_failure_does_not_expose_credential_values() -> None:
    """プロバイダの例外メッセージの秘密情報が失敗の要約に出ないこと"""

    def executor(request: object, context: ExecutionContext) -> object:
        """秘密情報を含むメッセージで例外を投げる。

        Parameters
        ----------
        request : object
            リクエスト。
        context : ExecutionContext
            実行コンテキスト。

        Raises
        ------
        RuntimeError
            常に。
        """
        raise RuntimeError(
            "Authorization: Bearer secret-token api_key=sk-test-secret "
            "credentialRef=prod/provider/ref "
            "endpoint=https://user:proxy-secret@provider.example.invalid/v1"
        )

    provider_runtime = (
        CoreProviderRuntime.builder()
        .register("OpenAI", Capability.CHAT, CoreChatRequest, executor)
        .build()
    )
    runtime = CoreChatRuntime(provider_runtime)

    result = runtime.chat(_chat_request("OpenAI"))

    assert result.failure is not None
    summary = result.failure.summary
    for secret in ("secret-token", "sk-test-secret", "prod/provider/ref"):
        assert secret not in summary
    assert "proxy-secret" not in summary
    assert "[REDACTED]" in summary


def test_declares_supported_or_explicit_unsupported_for_every_provider_capability() -> (
    None
):
    """全プロバイダが 3 能力を、対応済みか理由付きの未対応で宣言すること"""
    matrix = CoreProviderRuntimeFactory.default_capability_matrix()

    # Echo は Python 版だけのプロバイダ（移植元は 6 つ）
    assert set(matrix) == set(CoreProviderId)
    for provider_id in CoreProviderId:
        statuses = matrix[provider_id]
        assert {s.capability for s in statuses} >= set(ALL_CHAT_CAPABILITIES)
        for status in statuses:
            assert status.evidence.strip()
            assert "network=" in status.evidence
            if status.status != CapabilityStatusKind.SUPPORTED:
                assert status.reason.strip()
                assert status.follow_up.strip()
                assert "network-unverified" in status.evidence
    for provider_id in (CoreProviderId.OpenAI, CoreProviderId.AzureOpenAI):
        assert {s.status for s in matrix[provider_id]} == {
            CapabilityStatusKind.SUPPORTED
        }


def test_unsupported_providers_carry_concrete_attempt_evidence() -> None:
    """未対応のプロバイダが、試行の証跡と理由を持つこと"""
    matrix = CoreProviderRuntimeFactory.default_capability_matrix()
    expected = {
        CoreProviderId.Anthropic: (
            ANTHROPIC_PROBE,
            "scope-boundary=network-option-parity-unverified",
        ),
        CoreProviderId.VertexAI: (
            GENAI_PROBE,
            "scope-boundary=credentials-project-location-and-network-mapping",
        ),
        CoreProviderId.GoogleAIStudio: (
            GENAI_PROBE,
            "scope-boundary=proxy-timeout-parity-unverified",
        ),
    }

    for provider_id, (probe, boundary) in expected.items():
        for status in matrix[provider_id]:
            _assert_unsupported_attempt(status, probe, boundary)


def test_secuaigent_supports_chat_rag_and_image_explanation_for_runtime_parity(
    make_configuration: Callable[..., RuntimeProviderConfiguration],
) -> None:
    """SecuAiGent が chat・RAG・画像説明を対応済みとして宣言すること"""
    matrix = CoreProviderRuntimeFactory.default_capability_matrix()
    configuration = make_configuration(
        CoreProviderId.SecuAiGent,
        endpoint="https://secuaigent.example.invalid",
        credential=CoreCredential.api_key("login-key-fixture"),
        model_name="deploy-fixture",
        attributes={keys.TENANT_ID: "tenant-fixture"},
    )

    for capability in ALL_CHAT_CAPABILITIES:
        status = _status_for(matrix, CoreProviderId.SecuAiGent, capability)
        assert status.status == CapabilityStatusKind.SUPPORTED
    assert Capability.IMAGE_EXPLANATION in (
        SecuAiGentCoreChatClient(configuration).supported_capabilities()
    )


def test_image_explanation_capability_matrix_matches_provider_policy() -> None:
    """画像説明の能力が OpenAI・Azure は対応、ほかは理由付きの未対応であること"""
    matrix = CoreProviderRuntimeFactory.default_capability_matrix()

    for provider_id in (CoreProviderId.OpenAI, CoreProviderId.AzureOpenAI):
        status = _status_for(matrix, provider_id, Capability.IMAGE_EXPLANATION)
        assert status.status == CapabilityStatusKind.SUPPORTED
    _assert_unsupported_attempt(
        _status_for(matrix, CoreProviderId.Anthropic, Capability.IMAGE_EXPLANATION),
        ANTHROPIC_PROBE,
        "scope-boundary=network-option-parity-unverified",
    )
    _assert_unsupported_attempt(
        _status_for(matrix, CoreProviderId.VertexAI, Capability.IMAGE_EXPLANATION),
        GENAI_PROBE,
        "scope-boundary=credentials-project-location-and-network-mapping",
    )
    _assert_unsupported_attempt(
        _status_for(
            matrix, CoreProviderId.GoogleAIStudio, Capability.IMAGE_EXPLANATION
        ),
        GENAI_PROBE,
        "scope-boundary=proxy-timeout-parity-unverified",
    )
