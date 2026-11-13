"""移植元 SpringAiChatTransportTest・SpringAiChatPromptMapperTest の移植。

移植元は Spring AI の ChatModel を差し替え、Prompt・ChatOptions の中身を確かめる。
Python は Spring AI を使わず chat completions を httpx で直接送るため、
Spring のオブジェクトへの検証は「送信した HTTP リクエスト（URL・ヘッダー・JSON 本文）」
への検証に置き換える。メッセージ・オプション・RAG 回答の解釈は純粋関数でも確かめる。

Java との違い（意図的）:

- temperature 未指定は、Spring AI が既定値 0.7 を補うため、本文に 0.7 を送る
  （移植元は ChatOptions の temperature が null であることを確かめる）
- 移植元は ChatModel の呼び出しを差し替えるため、HTTP エラー・リトライは対象外
"""

import base64
import json
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
import respx
from generative_ai_core.chat.models import (
    GENERATION_OPTIONS_ATTRIBUTE,
    CoreChatRequest,
    CoreChatRequestBuilder,
    CoreChatResult,
    CoreGenerationOptions,
    CoreMedia,
    CoreMessage,
    CoreRagContext,
    CoreRagRequest,
    Role,
)
from generative_ai_core.chat.rag_prompt import RAG_VALIDATION_INSTRUCTION
from generative_ai_core.provider.clients.openai_compatible import (
    DEFAULT_TEMPERATURE,
    IMAGE_EXPLANATION_SYSTEM_PROMPT,
    OpenAiCompatibleTransport,
    ProviderFamily,
    RagAnswer,
    chat_options,
    parse_rag_answer,
    rag_options,
    to_provider_messages,
    to_rag_messages,
    validation_messages,
    validation_options,
)
from generative_ai_core.provider.model import (
    Capability,
    CoreCredential,
    CoreProviderId,
    RuntimeProviderConfiguration,
)
from generative_ai_core.provider.runtime import ExecutionContext

ENDPOINT = "https://provider.example.invalid"
OPENAI_URL = f"{ENDPOINT}/v1/chat/completions"
AZURE_URL = f"{ENDPOINT}/openai/deployments/deployment-a/chat/completions"
SUPPORTED = '{"answer":true,"reason":"supported"}'
RAG_ANSWER = '{"answer":"rag answer","id":[1]}'
OPENAI_MODEL = "gpt-4o-mini"
AZURE_DEPLOYMENT = "deployment-a"
GENERATION_FIELDS = (
    "max_completion_tokens",
    "top_p",
    "frequency_penalty",
    "presence_penalty",
    "stop",
)


class Provider:
    """respx に仕込んだ応答の順番と、送られたリクエストを持つ。"""

    def __init__(self, router: respx.MockRouter, url: str, texts: list[str]) -> None:
        """応答の本文を順番に返すルートを作る。

        Parameters
        ----------
        router : respx.MockRouter
            ルーター。
        url : str
            モックする URL。
        texts : list[str]
            呼び出しごとに返す回答の本文。足りなければ空の回答を返す。
        """
        self.requests: list[httpx.Request] = []
        self._texts = list(texts)
        router.post(url).mock(side_effect=self._respond)

    def _respond(self, request: httpx.Request) -> httpx.Response:
        """リクエストを記録し、次の本文を返す。

        Parameters
        ----------
        request : httpx.Request
            受け取ったリクエスト。

        Returns
        -------
        httpx.Response
            次の回答の本文を持つ応答。
        """
        self.requests.append(request)
        text = self._texts.pop(0) if self._texts else ""
        return httpx.Response(
            200, json={"choices": [{"message": {"role": "assistant", "content": text}}]}
        )

    def body(self, index: int) -> dict[str, Any]:
        """送られた JSON 本文を取り出す。

        Parameters
        ----------
        index : int
            何回目の呼び出しか（0 始まり）。

        Returns
        -------
        dict[str, Any]
            JSON 本文。
        """
        body: dict[str, Any] = json.loads(self.requests[index].content)
        return body


@pytest.fixture
def router() -> Iterator[respx.MockRouter]:
    """呼ばれなくてもよい respx のルーターを返す。

    Yields
    ------
    respx.MockRouter
        すべての HTTP をモックするルーター。
    """
    with respx.mock(assert_all_called=False) as mock:
        yield mock


def _configuration(family: ProviderFamily) -> RuntimeProviderConfiguration:
    """ファミリーに当たる設定を作る。

    Parameters
    ----------
    family : ProviderFamily
        OpenAI か Azure OpenAI。

    Returns
    -------
    RuntimeProviderConfiguration
        設定。
    """
    if family == ProviderFamily.AZURE_OPENAI:
        return RuntimeProviderConfiguration(
            CoreProviderId.AzureOpenAI,
            AZURE_DEPLOYMENT,
            ENDPOINT,
            CoreCredential.api_key("sk-test-secret"),
        )
    return RuntimeProviderConfiguration(
        CoreProviderId.OpenAI,
        OPENAI_MODEL,
        ENDPOINT,
        CoreCredential.api_key("sk-test-secret"),
    )


def _url(family: ProviderFamily) -> str:
    """ファミリーの chat completions の URL を返す。

    Parameters
    ----------
    family : ProviderFamily
        OpenAI か Azure OpenAI。

    Returns
    -------
    str
        URL（クエリなし）。
    """
    return AZURE_URL if family == ProviderFamily.AZURE_OPENAI else OPENAI_URL


def _transport(family: ProviderFamily) -> OpenAiCompatibleTransport:
    """ファミリーに当たる送信を作る。

    Parameters
    ----------
    family : ProviderFamily
        OpenAI か Azure OpenAI。

    Returns
    -------
    OpenAiCompatibleTransport
        送信。
    """
    configuration = _configuration(family)
    if family == ProviderFamily.AZURE_OPENAI:
        return OpenAiCompatibleTransport.azure_open_ai(configuration)
    return OpenAiCompatibleTransport.open_ai(configuration)


def _context() -> ExecutionContext:
    """chat 用の実行コンテキストを作る。

    Returns
    -------
    ExecutionContext
        実行コンテキスト。
    """
    return ExecutionContext("OpenAI", Capability.CHAT)


def _chat_request(*attributes: tuple[str, object]) -> CoreChatRequest:
    """`hello` を送る chat リクエストを作る。

    Parameters
    ----------
    *attributes : tuple[str, object]
        付ける属性（キーと値）。

    Returns
    -------
    CoreChatRequest
        chat リクエスト。
    """
    builder = CoreChatRequestBuilder("OpenAI").add_message(CoreMessage.user("hello"))
    for key, value in attributes:
        builder.attribute(key, value)
    return builder.build()


def _rag_request(
    contexts: int = 1, provider: str = "OpenAI", first_message: str | None = None
) -> CoreRagRequest:
    """質問と、指定件数のコンテキスト（path1…）を持つ RAG リクエストを作る。

    Parameters
    ----------
    contexts : int, optional
        コンテキストの件数。
    provider : str, optional
        プロバイダの名前。
    first_message : str | None, optional
        質問の前に足す user の発言。

    Returns
    -------
    CoreRagRequest
        RAG リクエスト。
    """
    builder = CoreChatRequestBuilder(provider).add_message(CoreMessage.system("system"))
    if first_message is not None:
        builder.add_message(CoreMessage.user(first_message))
    builder.add_message(CoreMessage.user("Question: question"))
    names = ["first", "second", "third"]
    return CoreRagRequest(
        builder.build(),
        tuple(
            CoreRagContext(f"path{i + 1}", f"{names[i]} context", (f"file{i + 1}",))
            for i in range(contexts)
        ),
    )


def _run_rag(
    router: respx.MockRouter,
    texts: list[str],
    request: CoreRagRequest | None = None,
    family: ProviderFamily = ProviderFamily.OPENAI,
) -> tuple[CoreChatResult, Provider]:
    """RAG を実行し、結果と送信の記録を返す。

    Parameters
    ----------
    router : respx.MockRouter
        ルーター。
    texts : list[str]
        呼び出しごとに返す回答の本文。
    request : CoreRagRequest | None, optional
        RAG リクエスト。省略時はコンテキスト 1 件。
    family : ProviderFamily, optional
        プロバイダのファミリー。

    Returns
    -------
    tuple[CoreChatResult, Provider]
        RAG の結果と、送信の記録。
    """
    # 同じ URL のルートが残っていると、先に登録したルートが応答してしまう
    router.routes.clear()
    provider = Provider(router, _url(family), texts)
    result = _transport(family).rag(
        _configuration(family), request or _rag_request(), _context()
    )
    return result, provider


def test_chat_uses_provider_specific_requests_without_live_provider_call(
    router: respx.MockRouter,
) -> None:
    """OpenAI と Azure で、接続先・認証ヘッダー・本文の形が違うこと"""
    openai = Provider(router, OPENAI_URL, ["openai answer"])
    azure = Provider(router, AZURE_URL, ["azure answer"])

    openai_result = _transport(ProviderFamily.OPENAI).chat(
        _configuration(ProviderFamily.OPENAI), _chat_request(), _context()
    )
    azure_result = _transport(ProviderFamily.AZURE_OPENAI).chat(
        _configuration(ProviderFamily.AZURE_OPENAI), _chat_request(), _context()
    )

    assert openai_result.answer == "openai answer"
    assert azure_result.answer == "azure answer"
    openai_request = openai.requests[0]
    assert openai_request.headers["Authorization"] == "Bearer sk-test-secret"
    assert "api-key" not in openai_request.headers
    assert openai.body(0)["model"] == OPENAI_MODEL
    assert openai.body(0)["stream"] is False
    azure_request = azure.requests[0]
    assert azure_request.headers["api-key"] == "sk-test-secret"
    assert "Authorization" not in azure_request.headers
    assert azure_request.url.params["api-version"]
    assert azure.body(0)["messages"] == [{"role": "user", "content": "hello"}]


def test_rag_uses_provider_specific_answer_and_validation_requests(
    router: respx.MockRouter,
) -> None:
    """RAG の回答・検証がそれぞれ 1 回ずつ、プロバイダごとの形式で送られること"""
    for family in (ProviderFamily.OPENAI, ProviderFamily.AZURE_OPENAI):
        provider = Provider(router, _url(family), [RAG_ANSWER, SUPPORTED])

        result = _transport(family).rag(
            _configuration(family), _rag_request(), _context()
        )

        assert result.answer_present
        assert len(provider.requests) == 2
        answer_format = provider.body(0)["response_format"]
        if family == ProviderFamily.OPENAI:
            assert answer_format["type"] == "json_schema"
        else:
            assert answer_format == {"type": "json_object"}
        assert provider.body(1)["response_format"] == {"type": "json_object"}
        router.routes.clear()


def test_rag_skips_validation_call_when_answer_does_not_reference_context(
    router: respx.MockRouter,
) -> None:
    """回答がコンテキストを参照していなければ、検証を呼ばずに回答なしにすること"""
    result, provider = _run_rag(router, ['{"answer":"none","id":[]}'])

    assert not result.answer_present
    assert len(provider.requests) == 1


def test_maps_core_media_to_user_message_and_prepends_image_explanation_prompt() -> (
    None
):
    """画像付きの user を画像パーツにし、先頭に画像説明の system を足すこと"""
    messages = to_provider_messages(
        [
            CoreMessage.user(
                "describe this",
                [CoreMedia("image/png", "diagram.png", b"\x01\x02\x03")],
            )
        ]
    )

    assert len(messages) == 2
    assert messages[0]["role"] == "system"
    assert "画像を見なくても文章だけで理解できるように" in messages[0]["content"]
    assert messages[0]["content"] == IMAGE_EXPLANATION_SYSTEM_PROMPT
    user = messages[1]
    assert user["role"] == "user"
    assert user["content"][0] == {"type": "text", "text": "describe this"}
    encoded = base64.b64encode(b"\x01\x02\x03").decode()
    assert user["content"][1] == {
        "type": "image_url",
        "image_url": {"url": f"data:image/png;base64,{encoded}"},
    }


def test_maps_all_core_message_roles_and_media_defaults() -> None:
    """全ロールが対応する role になり、MIME が空なら octet-stream になること"""
    messages = to_provider_messages(
        [
            CoreMessage.system("system"),
            CoreMessage.assistant("assistant"),
            CoreMessage(Role.TOOL, "tool"),
            CoreMessage.user("bytes", [CoreMedia("", " ", b"\x05\x06")]),
        ]
    )

    assert [m["role"] for m in messages] == [
        "system",
        "system",
        "assistant",
        "system",
        "user",
    ]
    assert messages[0]["content"] == IMAGE_EXPLANATION_SYSTEM_PROMPT
    assert messages[3]["content"] == "tool"
    image = messages[4]["content"][1]["image_url"]["url"]
    assert (
        image
        == f"data:application/octet-stream;base64,{base64.b64encode(bytes([5, 6])).decode()}"
    )


def test_rag_prompt_and_result_boundaries_stay_context_ordinal_based(
    router: respx.MockRouter,
) -> None:
    """RAG のプロンプトと結果が、コンテキストの順番（1 始まり）に基づくこと"""
    request = _rag_request(contexts=2)
    request = CoreRagRequest(
        CoreChatRequestBuilder("OpenAI")
        .add_message(CoreMessage.user("Question: question"))
        .build(),
        request.contexts,
    )

    prompt = to_rag_messages(request)
    result, _ = _run_rag(
        router, ['{"answer":"rag answer","id":[2]}', SUPPORTED], request
    )

    assert len(prompt) == 3
    assert "Context path: path1" in prompt[1]["content"]
    assert "first context" in prompt[1]["content"]
    assert result.answer_present
    assert result.references == ("path1", "path2")
    assert result.reference_ids == (2,)


def test_rag_result_without_ids_or_response_is_no_answer(
    router: respx.MockRouter,
) -> None:
    """id がない回答・本文のない応答は回答なしになり、chat の本文なしは空文字列になること"""
    request = _rag_request(contexts=2)

    no_ids, _ = _run_rag(router, ['{"answer":"none"}'], request)
    no_content, _ = _run_rag(router, [], request)
    chat = _transport(ProviderFamily.OPENAI).chat(
        _configuration(ProviderFamily.OPENAI), _chat_request(), _context()
    )

    assert not no_ids.answer_present
    assert not no_content.answer_present
    assert chat.answer == ""


def test_rag_validation_prompt_falls_back_for_out_of_range_ids() -> None:
    """範囲外の id は `Context id:N` の代わりの文面で検証すること"""
    request = _rag_request()

    messages = validation_messages(request, RagAnswer("rag answer", [2]))
    zero = validation_messages(request, RagAnswer("rag answer", [0]))

    assert "Context id:2" in messages[0]["content"]
    assert "Context id:0" in zero[0]["content"]
    assert messages[-1] == {"role": "user", "content": RAG_VALIDATION_INSTRUCTION}


def test_rag_without_usable_validation_response_is_no_answer(
    router: respx.MockRouter,
) -> None:
    """検証の応答が空・壊れた JSON なら回答なしになること"""
    empty, _ = _run_rag(router, [RAG_ANSWER])
    malformed, _ = _run_rag(router, [RAG_ANSWER, "{malformed"])

    assert not empty.answer_present
    assert not malformed.answer_present


def test_validation_options_use_json_mode_and_only_safe_temperature_knobs() -> None:
    """検証のオプションが JSON モードと temperature だけで、既定は Spring AI の既定値になること"""
    request = _chat_request(
        (
            GENERATION_OPTIONS_ATTRIBUTE,
            CoreGenerationOptions(
                temperature=0.2,
                max_tokens=99,
                reasoning_effort="none",
                verbosity="none",
            ),
        )
    )

    for family in (ProviderFamily.OPENAI, ProviderFamily.AZURE_OPENAI):
        options = validation_options(family, _configuration(family), request)
        assert options == {
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }
        default = validation_options(
            family, _configuration(family), CoreChatRequestBuilder("OpenAI").build()
        )
        assert default["temperature"] == DEFAULT_TEMPERATURE


def test_rag_answer_parsing_keeps_null_text_zero_ids_and_empty_responses_as_no_answer(
    router: respx.MockRouter,
) -> None:
    """answer が null・id が 0・id の型が不正な回答の扱いが移植元と同じであること"""
    null_answer = parse_rag_answer('{"answer":null,"id":[0]}')
    zero_id = parse_rag_answer('{"answer":"rag answer","id":[0]}')
    out_of_range, _ = _run_rag(router, ['{"answer":null,"id":[0]}', '{"answer":true}'])
    object_ids, _ = _run_rag(
        router, ['{"answer":"rag answer","id":{}}', '{"answer":true}']
    )
    object_validation, _ = _run_rag(router, [RAG_ANSWER, '{"answer":{}}'])
    boolean_ids, _ = _run_rag(router, ['{"answer":"rag answer","id":[true]}', "{}"])

    assert null_answer == RagAnswer("", [0])
    assert zero_id is not None
    assert zero_id.reference_ids == [0]
    assert not out_of_range.answer_present
    assert not object_ids.answer_present
    assert not object_validation.answer_present
    assert not boolean_ids.answer_present


def test_rag_answer_parsing_keeps_missing_answer_text_and_rejects_missing_validation(
    router: respx.MockRouter,
) -> None:
    """answer がなくても id があれば回答ありで、検証の answer がなければ回答なしになること"""
    missing_text, _ = _run_rag(router, ['{"id":[1]}', SUPPORTED])
    missing_validation, _ = _run_rag(router, [RAG_ANSWER, "{}"])
    null_validation, _ = _run_rag(router, [RAG_ANSWER, '{"answer":null}'])

    assert missing_text.answer_present
    assert missing_text.answer == ""
    assert missing_text.reference_ids == (1,)
    assert not missing_validation.answer_present
    assert not null_validation.answer_present


def test_chat_result_treats_null_generation_output_as_empty_text(
    router: respx.MockRouter,
) -> None:
    """回答の本文が null なら、空文字列として扱うこと"""
    router.post(OPENAI_URL).mock(
        return_value=httpx.Response(
            200, json={"choices": [{"message": {"role": "assistant", "content": None}}]}
        )
    )

    result = _transport(ProviderFamily.OPENAI).chat(
        _configuration(ProviderFamily.OPENAI), _chat_request(), _context()
    )

    assert result.answer == ""


def test_maps_core_generation_options_to_open_ai_and_azure_options() -> None:
    """生成パラメータが OpenAI・Azure のオプションに渡り、verbosity は OpenAI だけに渡ること"""
    options = CoreGenerationOptions(
        temperature=0.42,
        max_tokens=321,
        top_p=0.77,
        frequency_penalty=0.11,
        presence_penalty=0.22,
        stop="END",
        reasoning_effort="high",
        verbosity="low",
    )
    request = _chat_request((GENERATION_OPTIONS_ATTRIBUTE, options))
    expected = {
        "temperature": 0.42,
        "max_completion_tokens": 321,
        "top_p": 0.77,
        "frequency_penalty": 0.11,
        "presence_penalty": 0.22,
        "stop": ["END"],
        "reasoning_effort": "high",
    }

    openai = chat_options(
        ProviderFamily.OPENAI, _configuration(ProviderFamily.OPENAI), request
    )
    azure = chat_options(
        ProviderFamily.AZURE_OPENAI,
        _configuration(ProviderFamily.AZURE_OPENAI),
        request,
    )

    assert openai == {**expected, "verbosity": "low"}
    assert azure == expected
    for text in (" ", "none"):
        blank = _chat_request(
            (
                GENERATION_OPTIONS_ATTRIBUTE,
                CoreGenerationOptions(reasoning_effort=text, verbosity=text),
            )
        )
        for family in (ProviderFamily.OPENAI, ProviderFamily.AZURE_OPENAI):
            body = chat_options(family, _configuration(family), blank)
            assert "reasoning_effort" not in body
            assert "verbosity" not in body


def test_candidate_json_response_option_maps_to_provider_json_object_format() -> None:
    """候補の JSON 応答の指定が、プロバイダの json_object になること"""
    request = (
        CoreChatRequestBuilder("OpenAI")
        .candidate_json_response(True)
        .add_message(CoreMessage.user("Extract candidates."))
        .build()
    )

    for family in (ProviderFamily.OPENAI, ProviderFamily.AZURE_OPENAI):
        options = chat_options(family, _configuration(family), request)
        assert options["temperature"] == DEFAULT_TEMPERATURE
        assert options["response_format"] == {"type": "json_object"}


def test_rag_validation_prompt_resolves_reference_ids_against_context_ordinals() -> (
    None
):
    """検証のプロンプトの id が、チャットの発言ではなくコンテキストの順番で解決されること"""
    request = _rag_request(
        contexts=2, first_message="chat message at ordinal one must not be used"
    )

    messages = validation_messages(request, RagAnswer("rag answer", [2]))

    assert len(messages) == 4
    first = messages[0]["content"]
    assert "Context path: path2" in first
    assert "second context" in first
    assert "chat message at ordinal one must not be used" not in first
    assert "first context" not in first


def test_parses_rag_json_answer_and_keeps_no_answer_fallback_for_validation_failures(
    router: respx.MockRouter,
) -> None:
    """RAG の JSON 回答を読み、検証が偽・id なしなら回答なしになること"""
    validated, _ = _run_rag(
        router,
        [
            '{"question":"question","answer":"rag answer","id":[1],"FileName":["file1"]}',
            SUPPORTED,
        ],
    )
    validation_false, _ = _run_rag(
        router,
        [
            '{"question":"question","answer":"speculation","id":[1],"FileName":["file1"]}',
            '{"answer":false,"reason":"not supported"}',
        ],
    )
    missing_ids, _ = _run_rag(
        router,
        ['{"question":"question","answer":"no ids","id":[],"FileName":[]}', SUPPORTED],
    )

    assert validated.answer_present
    assert validated.answer == "rag answer"
    assert validated.reference_ids == (1,)
    assert validated.references == ("path1",)
    assert not validation_false.answer_present
    assert validation_false.answer == ""
    assert not missing_ids.answer_present


@pytest.mark.parametrize(
    "invalid_answer",
    [
        '{"answer":"rag answer","id":["1"]}',
        '{"answer":"rag answer","id":["01"]}',
        '{"answer":"rag answer","id":[1.2]}',
        '{"answer":"rag answer","id":["abc"]}',
        '{"answer":"rag answer"}',
    ],
)
def test_rejects_non_canonical_rag_json_reference_ids(
    router: respx.MockRouter, invalid_answer: str
) -> None:
    """文字列・先頭 0・小数・id なしの参照 id が回答なしになること"""
    result, _ = _run_rag(router, [invalid_answer, SUPPORTED])

    assert not result.answer_present


def test_duplicate_valid_rag_json_ids_are_deduplicated_in_first_seen_order(
    router: respx.MockRouter,
) -> None:
    """重複した id が最初に出た順で 1 つにまとめられること"""
    result, _ = _run_rag(router, ['{"answer":"rag answer","id":[1,1]}', SUPPORTED])

    assert result.answer == "rag answer"
    assert result.reference_ids == (1,)
    assert result.references == ("path1",)


def test_out_of_range_rag_json_id_does_not_create_invalid_reference_path(
    router: respx.MockRouter,
) -> None:
    """範囲外の id は、存在しない参照パスを作らず回答なしになること"""
    result, _ = _run_rag(
        router,
        ['{"answer":"rag answer","id":[2],"FileName":["file2"]}', SUPPORTED],
    )

    assert not result.answer_present
    assert result.reference_ids == ()


def test_azure_rag_json_object_mode_relies_on_parser_validation_boundary(
    router: respx.MockRouter,
) -> None:
    """Azure の JSON オブジェクトモードでも、不正な id は解析の段階で弾かれること"""
    result, _ = _run_rag(
        router,
        ['{"answer":"rag answer","id":["1"]}', SUPPORTED],
        _rag_request(provider="AzureOpenAI"),
        ProviderFamily.AZURE_OPENAI,
    )

    assert not result.answer_present
    assert result.reference_ids == ()


def test_model_provided_file_name_is_non_authoritative_when_canonical_id_is_valid(
    router: respx.MockRouter,
) -> None:
    """モデルが返した FileName は信用せず、正規の id だけを使うこと"""
    result, _ = _run_rag(
        router,
        ['{"answer":"rag answer","id":[1],"FileName":["../evil"]}', SUPPORTED],
    )

    assert result.answer == "rag answer"
    assert result.reference_ids == (1,)
    assert result.references == ("path1",)


def test_open_ai_rag_options_use_integer_reference_ids_and_optional_file_name() -> None:
    """OpenAI の RAG のスキーマが、整数の id と任意の FileName を持つこと"""
    options = rag_options(
        ProviderFamily.OPENAI,
        _configuration(ProviderFamily.OPENAI),
        _rag_request().chat_request,
    )

    response_format = options["response_format"]
    schema = response_format["json_schema"]["schema"]
    assert response_format["type"] == "json_schema"
    assert schema["properties"]["id"]["type"] == "array"
    assert schema["properties"]["id"]["items"]["type"] == "integer"
    assert "FileName" in schema["properties"]
    assert schema["required"] == ["question", "answer", "id"]


def test_generation_fields_are_absent_unless_requested() -> None:
    """生成パラメータは指定したものだけが本文に入ること"""
    body = chat_options(
        ProviderFamily.OPENAI, _configuration(ProviderFamily.OPENAI), _chat_request()
    )

    assert body == {"temperature": DEFAULT_TEMPERATURE}
    assert all(field not in body for field in GENERATION_FIELDS)
