"""generative-ai-adapter のテストで共有する fixture。

移植元の CoreRuntimeTestFixtures（controller）・ReasoningSseTestSupport（support）・
SecuAiGentTextDataFixtureSupport（textdata）に当たる。pytest は `--import-mode=importlib`
で動くため、テストから conftest を import できない。補助は fixture（関数を返す）で渡す。

- AtomicReference・AtomicInteger は `list` で置き換える（受け取った値を `append` する）
- テストでの型注釈は `Callable[..., 戻り値の型]` を使う
"""

import json
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

import pytest
from generative_ai_adapter.controller import GenerativeAiController
from generative_ai_adapter.domain import AccessCredential, ProxySetting
from generative_ai_core.chat.models import (
    CoreChatRequest,
    CoreChatResult,
    CoreChatTool,
    CoreRagRequest,
    OutputModeHint,
)
from generative_ai_core.chat.runtime import CoreChatRuntime
from generative_ai_core.provider.model import Capability, RuntimeProviderConfiguration
from generative_ai_core.provider.runtime import CoreProviderRuntime, ExecutionContext

# 移植元 CoreRuntimeTestFixtures.PROVIDER_ID
PROVIDER_ID = "OpenAI"
CONTROLLED_URL = "https://provider.example.invalid"
CONTROLLED_TEST_URL = "https://provider.example.invalid/test"
CONTROLLED_API_KEY = "controlled-credential"
CONTROLLED_MODEL = "controlled-model"

# 移植元 SecuAiGentTextDataFixtureSupport の JSON
VALID_GENERATIVE_JSON = """
{
  "accessToken": "access-token-fixture",
  "credential": {
    "url": "https://json-provider.invalid",
    "tenantId": "tenant-fixture"
  },
  "deployName": "json-deploy",
  "messageId": "msg-fixture",
  "additionalPrompt": "prompt-fixture",
  "temperature": 0.2,
  "maxTokens": 1024,
  "reasoning_effort": "high",
  "verbosity": "low",
  "createLibrary": true
}
"""
CREDENTIAL_ONLY_JSON = """
{
  "accessToken": "access-token-fixture",
  "credential": {
    "url": "https://json-provider.invalid",
    "tenantId": "tenant-fixture"
  },
  "deployName": "json-deploy"
}
"""
WEB_SEARCH_TOOLS_JSON = '{"tools":[{"name":"web_search"}]}'
MCP_TOOLS_JSON = """
{"tools":[{"name":"mcp","server_label":"redacted-label","server_url":"redacted-url",
"authorization":"auth-body-fixture","headers":{"X-Trace-Fixture":"header-value-fixture"}}]}
"""


def _credential() -> AccessCredential:
    """移植元 CoreRuntimeTestFixtures.credential と同じ資格情報を作る。

    Returns
    -------
    AccessCredential
        OpenAI・controlled-model の資格情報。
    """
    return AccessCredential(
        url=CONTROLLED_URL,
        test_url=CONTROLLED_TEST_URL,
        api_key=CONTROLLED_API_KEY,
        model_name=CONTROLLED_MODEL,
        vendor_name=PROVIDER_ID,
    )


def _runtime_factory(
    runtime: CoreChatRuntime,
) -> Callable[[RuntimeProviderConfiguration], CoreChatRuntime]:
    """設定によらず決まった runtime を返す工場を作る。

    Parameters
    ----------
    runtime : CoreChatRuntime
        返す runtime。

    Returns
    -------
    Callable[[RuntimeProviderConfiguration], CoreChatRuntime]
        controller に渡す工場。
    """

    def factory(configuration: RuntimeProviderConfiguration) -> CoreChatRuntime:
        """受け取った設定を無視して runtime を返す。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定（使わない）。

        Returns
        -------
        CoreChatRuntime
            決まった runtime。
        """
        return runtime

    return factory


def _controller(
    runtime: CoreChatRuntime,
    output_type: int,
    chat_tools: Sequence[CoreChatTool] = (),
) -> GenerativeAiController:
    """移植元 CoreRuntimeTestFixtures.controller と同じ controller を作る。

    Parameters
    ----------
    runtime : CoreChatRuntime
        core の chat（テスト用に処理を差し替えたもの）。
    output_type : int
        出力モード（0・2=通常 chat、1=RAG）。
    chat_tools : Sequence[CoreChatTool], optional
        通常 chat の tools。

    Returns
    -------
    GenerativeAiController
        作った controller。
    """
    return GenerativeAiController(
        _credential(),
        ProxySetting(),
        output_type,
        chat_tools,
        _runtime_factory(runtime),
    )


def _chat_runtime(
    captured: list[CoreChatRequest], result: CoreChatResult
) -> CoreChatRuntime:
    """chat のリクエストを記録し、決まった結果を返す runtime を作る。

    Parameters
    ----------
    captured : list[CoreChatRequest]
        受け取ったリクエストを追加するリスト。
    result : CoreChatResult
        返す結果。

    Returns
    -------
    CoreChatRuntime
        CHAT だけを登録した runtime。
    """

    def handle(request: CoreChatRequest, context: ExecutionContext) -> CoreChatResult:
        """リクエストを記録して結果を返す。

        Parameters
        ----------
        request : CoreChatRequest
            chat のリクエスト。
        context : ExecutionContext
            実行の文脈（使わない）。

        Returns
        -------
        CoreChatResult
            決まった結果。
        """
        captured.append(request)
        return result

    return CoreChatRuntime(
        CoreProviderRuntime.builder()
        .register(PROVIDER_ID, Capability.CHAT, CoreChatRequest, handle)
        .build()
    )


def _rag_runtime(
    captured: list[CoreRagRequest], result: CoreChatResult
) -> CoreChatRuntime:
    """RAG のリクエストを記録し、決まった結果を返す runtime を作る。

    呼び出し回数は `len(captured)` で数える（移植元の AtomicInteger の代わり）。

    Parameters
    ----------
    captured : list[CoreRagRequest]
        受け取ったリクエストを追加するリスト。
    result : CoreChatResult
        返す結果。

    Returns
    -------
    CoreChatRuntime
        RAG だけを登録した runtime。
    """

    def handle(request: CoreRagRequest, context: ExecutionContext) -> CoreChatResult:
        """リクエストを記録して結果を返す。

        Parameters
        ----------
        request : CoreRagRequest
            RAG のリクエスト。
        context : ExecutionContext
            実行の文脈（使わない）。

        Returns
        -------
        CoreChatResult
            決まった結果。
        """
        captured.append(request)
        return result

    return CoreChatRuntime(
        CoreProviderRuntime.builder()
        .register(PROVIDER_ID, Capability.RAG, CoreRagRequest, handle)
        .build()
    )


def _failing_runtime(capability: Capability, failure: Exception) -> CoreChatRuntime:
    """指定の能力で例外を投げる runtime を作る。

    Parameters
    ----------
    capability : Capability
        例外を投げる能力（CHAT なら chat、それ以外は RAG）。
    failure : Exception
        投げる例外。

    Returns
    -------
    CoreChatRuntime
        例外を投げる処理を登録した runtime。
    """

    def handle(request: Any, context: ExecutionContext) -> CoreChatResult:
        """常に例外を投げる。

        Parameters
        ----------
        request : Any
            リクエスト（使わない）。
        context : ExecutionContext
            実行の文脈（使わない）。

        Returns
        -------
        CoreChatResult
            返さない。

        Raises
        ------
        Exception
            受け取った例外。
        """
        raise failure

    builder = CoreProviderRuntime.builder()
    if capability == Capability.CHAT:
        builder.register(PROVIDER_ID, Capability.CHAT, CoreChatRequest, handle)
    else:
        builder.register(PROVIDER_ID, Capability.RAG, CoreRagRequest, handle)
    return CoreChatRuntime(builder.build())


def _json_answer(answer: str) -> CoreChatResult:
    """RetrievalAnswer JSON 向けの成功結果を作る。

    Parameters
    ----------
    answer : str
        回答。

    Returns
    -------
    CoreChatResult
        参照なしの成功結果。
    """
    return CoreChatResult.success(answer, [], OutputModeHint.RETRIEVAL_ANSWER_JSON)


def _sse_line(delta_text: str) -> str:
    """reasoning_delta の SSE の 1 行を作る（移植元 ReasoningSseTestSupport.sseLine）。

    Parameters
    ----------
    delta_text : str
        差分のテキスト。

    Returns
    -------
    str
        `data:{...}\\n` の行。
    """
    event = {"type": "reasoning_delta", "text": delta_text}
    return "data:" + json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n"


def _sse_lines(*delta_texts: str) -> str:
    """reasoning_delta の SSE の行をつなげる（移植元 ReasoningSseTestSupport.sseLines）。

    Parameters
    ----------
    *delta_texts : str
        差分のテキスト。

    Returns
    -------
    str
        つなげた行。
    """
    return "".join(_sse_line(text) for text in delta_texts)


def _write_text_data_fixture(directory: Path, content: str) -> Path:
    """textData の JSON を一時ファイルに書く（移植元 writeFixture）。

    Parameters
    ----------
    directory : Path
        書く先のディレクトリ。
    content : str
        JSON の文字列。

    Returns
    -------
    Path
        書いたファイル。
    """
    index = len(list(directory.glob("secuaigent-textdata-*.json")))
    fixture = directory / f"secuaigent-textdata-{index}.json"
    fixture.write_text(content, encoding="utf-8")
    return fixture


@pytest.fixture
def core_credential() -> AccessCredential:
    """移植元 CoreRuntimeTestFixtures.credential の資格情報を返す。

    Returns
    -------
    AccessCredential
        OpenAI・controlled-model の資格情報。
    """
    return _credential()


@pytest.fixture
def make_controller() -> Callable[..., GenerativeAiController]:
    """`(runtime, output_type, chat_tools=())` から controller を作る関数を返す。

    Returns
    -------
    Callable[..., GenerativeAiController]
        移植元 CoreRuntimeTestFixtures.controller に当たる関数。
    """
    return _controller


@pytest.fixture
def make_runtime_factory() -> Callable[..., Any]:
    """runtime から controller・App に渡す工場を作る関数を返す。

    Returns
    -------
    Callable[..., Any]
        `runtime -> (configuration -> runtime)` の関数。
    """
    return _runtime_factory


@pytest.fixture
def chat_runtime() -> Callable[..., CoreChatRuntime]:
    """`(captured, result)` から chat の runtime を作る関数を返す。

    Returns
    -------
    Callable[..., CoreChatRuntime]
        移植元 CoreRuntimeTestFixtures.chatRuntime に当たる関数。
    """
    return _chat_runtime


@pytest.fixture
def rag_runtime() -> Callable[..., CoreChatRuntime]:
    """`(captured, result)` から RAG の runtime を作る関数を返す。

    Returns
    -------
    Callable[..., CoreChatRuntime]
        移植元 CoreRuntimeTestFixtures.ragRuntime に当たる関数。
    """
    return _rag_runtime


@pytest.fixture
def failing_runtime() -> Callable[..., CoreChatRuntime]:
    """`(capability, failure)` から例外を投げる runtime を作る関数を返す。

    Returns
    -------
    Callable[..., CoreChatRuntime]
        移植元 CoreRuntimeTestFixtures.failingRuntime に当たる関数。
    """
    return _failing_runtime


@pytest.fixture
def json_answer() -> Callable[[str], CoreChatResult]:
    """回答から RetrievalAnswer JSON 向けの成功結果を作る関数を返す。

    Returns
    -------
    Callable[[str], CoreChatResult]
        移植元 CoreRuntimeTestFixtures.jsonAnswer に当たる関数。
    """
    return _json_answer


@pytest.fixture
def sse_lines() -> Callable[..., str]:
    """reasoning_delta の SSE の行を作る関数を返す。

    Returns
    -------
    Callable[..., str]
        移植元 ReasoningSseTestSupport.sseLines に当たる関数。
    """
    return _sse_lines


@pytest.fixture
def write_text_data_fixture() -> Callable[[Path, str], Path]:
    """textData の JSON を一時ファイルに書く関数を返す。

    Returns
    -------
    Callable[[Path, str], Path]
        移植元 SecuAiGentTextDataFixtureSupport.writeFixture に当たる関数。
    """
    return _write_text_data_fixture


@pytest.fixture
def text_data_json() -> dict[str, str]:
    """移植元 SecuAiGentTextDataFixtureSupport の JSON を返す。

    Returns
    -------
    dict[str, str]
        キーは `valid_generative`・`credential_only`・`web_search_tools`・`mcp_tools`。
    """
    return {
        "valid_generative": VALID_GENERATIVE_JSON,
        "credential_only": CREDENTIAL_ONLY_JSON,
        "web_search_tools": WEB_SEARCH_TOOLS_JSON,
        "mcp_tools": MCP_TOOLS_JSON,
    }
