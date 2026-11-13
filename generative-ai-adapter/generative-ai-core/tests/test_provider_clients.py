"""移植元 OpenAiCoreChatClientTest・AzureOpenAiCoreChatClientTest・
OpenAiResponsesToolsRequestMapperTest・AzureOpenAiResponsesToolsRequestMapperTest・
UnavailableToolsMappingTest・UnsupportedCoreProviderChatClientTest・
CoreProviderToolsDirectEndpointGuardTest の移植。

移植元はクライアントに Transport を渡して送信回数を数える。Python の OpenAI・Azure
クライアントは送信を自分で組み立てるため、送信回数は respx の呼び出し回数で確かめる。
Transport を差し替えて結果だけを確かめるテストは GenericCoreProviderChatClient で行う。
"""

from collections.abc import Callable, Iterator
from pathlib import Path

import httpx
import pytest
import respx
from generative_ai_core import failure as failures
from generative_ai_core.chat.models import (
    CoreChatRequest,
    CoreChatRequestBuilder,
    CoreChatResult,
    CoreChatTool,
    CoreImageExplanationRequest,
    CoreMessage,
    CoreRagContext,
    CoreRagRequest,
)
from generative_ai_core.provider.clients.base import (
    ChatTransportBase,
    GenericCoreProviderChatClient,
    UnsupportedCoreProviderChatClient,
)
from generative_ai_core.provider.clients.openai_compatible import (
    AzureOpenAiCoreChatClient,
    OpenAiCoreChatClient,
)
from generative_ai_core.provider.clients.unsupported import (
    AnthropicCoreChatClient,
    GoogleAiStudioCoreChatClient,
    VertexAiCoreChatClient,
)
from generative_ai_core.provider.model import (
    UNSUPPORTED_PROVIDER_CAPABILITY,
    Capability,
    CoreCredential,
    CoreProviderId,
    RuntimeProviderConfiguration,
)
from generative_ai_core.provider.runtime import ExecutionContext

ENDPOINT = "https://provider.example.invalid"
FORBIDDEN_TERMS = (
    "McpClient",
    "mcp.server",
    "web_search_endpoint",
    "WebSearchClient",
    "server_url.openConnection",
)
SOURCE_ROOT = Path(__file__).resolve().parents[1] / "src" / "generative_ai_core"


class RecordingTransport(ChatTransportBase):
    """移植元 RecordingTransport。接頭辞付きで質問・コンテキストのパスを答えにする。"""

    def __init__(self, prefix: str) -> None:
        """接頭辞を受け取る。

        Parameters
        ----------
        prefix : str
            答えの先頭に付ける文字列。
        """
        self._prefix = prefix

    def chat(
        self,
        configuration: RuntimeProviderConfiguration,
        request: CoreChatRequest,
        context: ExecutionContext,
    ) -> CoreChatResult:
        """`接頭辞:chat:最後の発言` を答えにする。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            設定。
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
            f"{self._prefix}:chat:{request.last_user_text()}",
            [],
            request.output_mode_hint,
        )

    def rag(
        self,
        configuration: RuntimeProviderConfiguration,
        request: CoreRagRequest,
        context: ExecutionContext,
    ) -> CoreChatResult:
        """`接頭辞:rag:最初のコンテキストのパス` を答えにする。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            設定。
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
            f"{self._prefix}:rag:{request.contexts[0].path}",
            ["doc.md"],
            request.chat_request.output_mode_hint,
            [0],
        )


@pytest.fixture
def router() -> Iterator[respx.MockRouter]:
    """呼ばれなくてもよい respx のルーターを返す（送信しないことの確認用）。

    Yields
    ------
    respx.MockRouter
        すべての HTTP をモックするルーター。
    """
    with respx.mock(assert_all_called=False) as mock:
        yield mock


def _completion(text: str) -> httpx.Response:
    """chat completions の応答を作る。

    Parameters
    ----------
    text : str
        回答の本文。

    Returns
    -------
    httpx.Response
        1 件の回答を持つ応答。
    """
    return httpx.Response(
        200, json={"choices": [{"message": {"role": "assistant", "content": text}}]}
    )


def _configuration(
    provider_id: CoreProviderId, model_name: str = "model-fixture"
) -> RuntimeProviderConfiguration:
    """プロバイダごとの設定を作る。

    Parameters
    ----------
    provider_id : CoreProviderId
        プロバイダ。
    model_name : str, optional
        モデル名。

    Returns
    -------
    RuntimeProviderConfiguration
        設定。
    """
    return RuntimeProviderConfiguration(
        provider_id,
        model_name,
        ENDPOINT,
        CoreCredential.api_key("credential-fixture"),
    )


def _context(provider_id: CoreProviderId, capability: Capability) -> ExecutionContext:
    """実行コンテキストを作る。

    Parameters
    ----------
    provider_id : CoreProviderId
        プロバイダ。
    capability : Capability
        能力。

    Returns
    -------
    ExecutionContext
        実行コンテキスト。
    """
    return ExecutionContext(provider_id.canonical_name, capability)


def _tools_request(provider_name: str, tool: CoreChatTool) -> CoreChatRequest:
    """`hello` と tools 1 件を持つ chat リクエストを作る。

    Parameters
    ----------
    provider_name : str
        プロバイダの名前。
    tool : CoreChatTool
        付ける tool。

    Returns
    -------
    CoreChatRequest
        chat リクエスト。
    """
    return (
        CoreChatRequestBuilder(provider_name)
        .add_message(CoreMessage.user("hello"))
        .tools([tool])
        .build()
    )


def _client_for(provider_id: CoreProviderId) -> GenericCoreProviderChatClient:
    """プロバイダに当たる OpenAI・Azure のクライアントを作る。

    Parameters
    ----------
    provider_id : CoreProviderId
        OpenAI か Azure OpenAI。

    Returns
    -------
    GenericCoreProviderChatClient
        クライアント。
    """
    configuration = _configuration(provider_id)
    if provider_id == CoreProviderId.OpenAI:
        return OpenAiCoreChatClient(configuration)
    return AzureOpenAiCoreChatClient(configuration)


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


def _rag_request(provider_name: str) -> CoreRagRequest:
    """コンテキスト 1 件（doc.md）の RAG リクエストを作る。

    Parameters
    ----------
    provider_name : str
        プロバイダの名前。

    Returns
    -------
    CoreRagRequest
        RAG リクエスト。
    """
    return CoreRagRequest(
        _chat_request(provider_name),
        (CoreRagContext("doc.md", "context", ("doc.md",)),),
    )


def _image_request(provider_name: str) -> CoreImageExplanationRequest:
    """メディアなしの画像説明リクエスト（指示 describe）を作る。

    Parameters
    ----------
    provider_name : str
        プロバイダの名前。

    Returns
    -------
    CoreImageExplanationRequest
        画像説明リクエスト。
    """
    return CoreImageExplanationRequest(provider_name, instruction="describe")


def test_returns_chat_and_rag_results_through_controlled_client_seam() -> None:
    """Transport を差し替えたクライアントが chat・RAG・画像説明の結果を返すこと"""
    configuration = _configuration(CoreProviderId.OpenAI, "gpt-4o-mini")
    client = GenericCoreProviderChatClient(
        CoreProviderId.OpenAI,
        configuration,
        RecordingTransport("openai-controlled"),
        "controlled test",
    )

    chat = client.chat(
        _chat_request("OpenAI"), _context(CoreProviderId.OpenAI, Capability.CHAT)
    )
    rag = client.rag(
        _rag_request("OpenAI"), _context(CoreProviderId.OpenAI, Capability.RAG)
    )
    image = client.image_explanation(
        _image_request("OpenAI"),
        _context(CoreProviderId.OpenAI, Capability.IMAGE_EXPLANATION),
    )

    assert chat.answer == "openai-controlled:chat:hello"
    assert rag.answer == "openai-controlled:rag:doc.md"
    assert image.explanation == "openai-controlled:chat:describe"
    assert rag.references == ("doc.md",)
    assert rag.reference_ids == (0,)


def test_open_ai_client_declares_provider_and_all_chat_capabilities() -> None:
    """OpenAI クライアントが OpenAI を名乗り、3 能力だけを持つこと"""
    client = OpenAiCoreChatClient(_configuration(CoreProviderId.OpenAI))

    assert client.provider_id == CoreProviderId.OpenAI
    assert client.supported_capabilities() == {
        Capability.CHAT,
        Capability.RAG,
        Capability.IMAGE_EXPLANATION,
    }


def test_open_ai_client_returns_chat_and_image_answers_from_completions(
    router: respx.MockRouter,
) -> None:
    """OpenAI クライアントが chat completions の回答を chat・画像説明の結果にすること"""
    route = router.post(f"{ENDPOINT}/v1/chat/completions").mock(
        return_value=_completion("openai-answer")
    )
    client = OpenAiCoreChatClient(_configuration(CoreProviderId.OpenAI))

    chat = client.chat(
        _chat_request("OpenAI"), _context(CoreProviderId.OpenAI, Capability.CHAT)
    )
    image = client.image_explanation(
        _image_request("OpenAI"),
        _context(CoreProviderId.OpenAI, Capability.IMAGE_EXPLANATION),
    )

    assert chat.answer == "openai-answer"
    assert image.explanation == "openai-answer"
    assert route.call_count == 2


def test_keeps_canonical_azure_provider_id_and_returns_controlled_results() -> None:
    """Azure クライアントが正式名を保ち、差し替えた Transport の結果を返すこと"""
    configuration = _configuration(CoreProviderId.AzureOpenAI, "deployment-a")
    azure_client = AzureOpenAiCoreChatClient(configuration)
    client = GenericCoreProviderChatClient(
        CoreProviderId.AzureOpenAI,
        configuration,
        RecordingTransport("azure-controlled"),
        "controlled test",
    )

    chat = client.chat(
        _chat_request("AzureOpenAI"),
        _context(CoreProviderId.AzureOpenAI, Capability.CHAT),
    )
    rag = client.rag(
        _rag_request("AzureOpenAI"),
        _context(CoreProviderId.AzureOpenAI, Capability.RAG),
    )
    image = client.image_explanation(
        _image_request("AzureOpenAI"),
        _context(CoreProviderId.AzureOpenAI, Capability.IMAGE_EXPLANATION),
    )

    assert azure_client.provider_id == CoreProviderId.AzureOpenAI
    assert azure_client.provider_id.canonical_name == "AzureOpenAI"
    assert Capability.IMAGE_EXPLANATION in azure_client.supported_capabilities()
    assert chat.answer == "azure-controlled:chat:hello"
    assert rag.answer == "azure-controlled:rag:doc.md"
    assert image.explanation == "azure-controlled:chat:describe"


@pytest.mark.parametrize(
    ("provider_id", "url"),
    [
        (CoreProviderId.OpenAI, f"{ENDPOINT}/v1/chat/completions"),
        (
            CoreProviderId.AzureOpenAI,
            f"{ENDPOINT}/openai/deployments/model-fixture/chat/completions",
        ),
    ],
)
def test_no_tools_path_keeps_existing_transport(
    router: respx.MockRouter, provider_id: CoreProviderId, url: str
) -> None:
    """tools がなければ従来どおり 1 回送信し、失敗にならないこと"""
    route = router.post(url).mock(return_value=_completion("transport-called"))
    client = _client_for(provider_id)

    result = client.chat(
        _chat_request(provider_id.canonical_name),
        _context(provider_id, Capability.CHAT),
    )

    assert route.call_count == 1
    assert result.failure is None
    assert result.answer == "transport-called"


@pytest.mark.parametrize(
    "provider_id", [CoreProviderId.OpenAI, CoreProviderId.AzureOpenAI]
)
def test_web_search_tools_fail_closed_before_transport(
    router: respx.MockRouter, provider_id: CoreProviderId
) -> None:
    """web_search の tools は送信せずに UNAVAILABLE_TOOLS_MAPPING で失敗すること"""
    route = router.route().mock(return_value=_completion("transport-called"))
    client = _client_for(provider_id)

    result = client.chat(
        _tools_request(provider_id.canonical_name, CoreChatTool.web_search()),
        _context(provider_id, Capability.CHAT),
    )

    assert route.call_count == 0
    assert result.failure is not None
    assert result.failure.code == failures.UNAVAILABLE_TOOLS_MAPPING


@pytest.mark.parametrize(
    "provider_id", [CoreProviderId.OpenAI, CoreProviderId.AzureOpenAI]
)
def test_mcp_tools_require_never_approval_before_unavailable_mapping(
    router: respx.MockRouter, provider_id: CoreProviderId
) -> None:
    """MCP の承認が never 以外（未指定・always）なら送信せずに承認未対応で失敗すること"""
    route = router.route().mock(return_value=_completion("transport-called"))
    client = _client_for(provider_id)
    context = _context(provider_id, Capability.CHAT)
    name = provider_id.canonical_name

    missing = client.chat(
        _tools_request(name, CoreChatTool.mcp("redacted-label", "redacted-url")),
        context,
    )
    always = client.chat(
        _tools_request(
            name, CoreChatTool.mcp("redacted-label", "redacted-url", "always")
        ),
        context,
    )

    assert route.call_count == 0
    for result in (missing, always):
        assert result.failure is not None
        assert result.failure.code == failures.UNSUPPORTED_APPROVAL_CONTINUATION


def test_unsupported_transport_evidence_is_sanitized_and_asks_for_no_executor(
    make_configuration: Callable[..., RuntimeProviderConfiguration],
) -> None:
    """未対応クライアントの失敗に、試行の証跡が含まれ、実装の案内や秘密情報は出ないこと"""
    client = AnthropicCoreChatClient(
        make_configuration(
            CoreProviderId.Anthropic, credential=CoreCredential.api_key("sk-secret")
        )
    )

    result = client.chat(
        _chat_request("Anthropic"), _context(CoreProviderId.Anthropic, Capability.CHAT)
    )
    image_result = client.image_explanation(
        _image_request("Anthropic"),
        _context(CoreProviderId.Anthropic, Capability.IMAGE_EXPLANATION),
    )

    assert result.failure is not None
    assert result.failure.code == UNSUPPORTED_PROVIDER_CAPABILITY
    summary = result.failure.summary
    assert "dependency-probe=spring-ai-starter-model-anthropic:1.1.7:pass" in summary
    assert "scope-boundary=network-option-parity-unverified" in summary
    for forbidden in ("register an executor", "implement provider communication"):
        assert forbidden not in summary
    assert "sk-secret" not in summary
    assert image_result.failure is not None
    assert image_result.failure.code == UNSUPPORTED_PROVIDER_CAPABILITY
    assert "IMAGE_EXPLANATION" in image_result.failure.summary
    assert "sk-secret" not in image_result.failure.summary


@pytest.mark.parametrize(
    ("provider_id", "client_type"),
    [
        (CoreProviderId.Anthropic, AnthropicCoreChatClient),
        (CoreProviderId.VertexAI, VertexAiCoreChatClient),
        (CoreProviderId.GoogleAIStudio, GoogleAiStudioCoreChatClient),
    ],
)
def test_unsupported_image_explanation_failure_is_secret_safe_for_deferred_providers(
    make_configuration: Callable[..., RuntimeProviderConfiguration],
    provider_id: CoreProviderId,
    client_type: Callable[
        [RuntimeProviderConfiguration], UnsupportedCoreProviderChatClient
    ],
) -> None:
    """未対応プロバイダの画像説明の失敗が、秘密情報・接続先を含まないこと"""
    configuration = make_configuration(
        provider_id,
        model_name="model",
        credential=CoreCredential.api_key("sk-secret"),
    )
    client = client_type(configuration)

    result = client.image_explanation(
        _image_request(provider_id.canonical_name),
        _context(provider_id, Capability.IMAGE_EXPLANATION),
    )

    assert result.failure is not None
    summary = result.failure.summary
    for expected in (provider_id.canonical_name, "IMAGE_EXPLANATION", "unsupported"):
        assert expected in summary
    for forbidden in ("sk-secret", "Bearer ", "proxyPassword", "provider.example"):
        assert forbidden not in summary


def test_core_does_not_introduce_direct_mcp_or_web_search_endpoint_clients() -> None:
    """core のソースが MCP・web search の直接接続クライアントを持たないこと"""
    source = "".join(
        path.read_text(encoding="utf-8") for path in SOURCE_ROOT.rglob("*.py")
    )

    assert source
    for term in FORBIDDEN_TERMS:
        assert term not in source
