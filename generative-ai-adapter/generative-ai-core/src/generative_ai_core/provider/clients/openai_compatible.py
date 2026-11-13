"""OpenAI・Azure OpenAI の chat completions 送信。

移植元は Spring AI 1.1.7（OpenAiChatModel・AzureOpenAiChatModel）を通して呼ぶ
（SpringAiChatTransport・SpringAiChatPromptMapper）。Python では Spring AI が組み立てる
HTTP リクエストを httpx で直接送る。再現していること:

- ストリーミングしない 1 回の呼び出し（`stream: false`）。推論の途中経過は出ない
- Spring AI の既定オプション（temperature 未指定なら 0.7）。jar の定数で確認した値
- OpenAI: `{URL}/v1/chat/completions`・`Authorization: Bearer`
- Azure: `{URL}/openai/deployments/{モデル名}/chat/completions?api-version=` に
  Azure SDK（azure-ai-openai 1.0.0-beta.16）の最新版 `2025-01-01-preview`・`api-key`
- 画像付きのメッセージがあれば、先頭に画像説明の system プロンプトを足す
- RAG は回答 1 回と検証 1 回の 2 回呼ぶ

再現していないこと（docs/issue-298 の 03 を参照）: Spring AI・Azure SDK の自動リトライ。
"""

import base64
import logging
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

import httpx

from generative_ai_core.chat import rag_prompt
from generative_ai_core.chat.models import (
    CoreChatRequest,
    CoreChatResult,
    CoreGenerationOptions,
    CoreMedia,
    CoreMessage,
    CoreRagRequest,
    Role,
)
from generative_ai_core.jsonutil import RawNumber, loads_with_raw_numbers
from generative_ai_core.network.transport import client_options
from generative_ai_core.provider.clients.base import (
    ChatTransportBase,
    GenericCoreProviderChatClient,
)
from generative_ai_core.provider.model import (
    CoreProviderId,
    RuntimeProviderConfiguration,
)
from generative_ai_core.provider.runtime import ExecutionContext

logger = logging.getLogger(__name__)

IMAGE_EXPLANATION_SYSTEM_PROMPT = (
    "画像を見なくても文章だけで理解できるように、画像の内容を具体的かつ正確な日本語で"
    "説明してください。位置関係・重要なテキスト・図表や数値・ラベル・色や形などを、"
    "文章のみで再現できる粒度で記述し、主観的な推測は避けて画像内の事実に限定してください。"
)
RAG_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "question": {"type": "string"},
        "answer": {"type": "string"},
        "id": {"type": "array", "items": {"type": "integer"}},
        "FileName": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["question", "answer", "id"],
    "additionalProperties": False,
}
# Spring AI の ResponseFormat(JSON_SCHEMA, schema) が付ける既定の名前・strict
JSON_SCHEMA_NAME = "custom_schema"
# Spring AI の OpenAiChatModel・AzureOpenAiChatModel の既定オプション
DEFAULT_TEMPERATURE = 0.7
OPENAI_COMPLETIONS_PATH = "/v1/chat/completions"
# Azure SDK（azure-ai-openai 1.0.0-beta.16）の OpenAIServiceVersion.getLatest()
AZURE_API_VERSION = "2025-01-01-preview"
DEFAULT_MIME_TYPE = "application/octet-stream"
_REFERENCE_ID = re.compile(r"0|[1-9][0-9]*")
EVIDENCE_OPENAI = (
    "OpenAI Spring AI 1.1.7 client construction and controlled invocation tests"
)
EVIDENCE_AZURE = (
    "AzureOpenAI Spring AI 1.1.7 client construction and controlled invocation tests"
)


class ProviderFamily(StrEnum):
    """OpenAI 互換プロバイダの種別。"""

    OPENAI = "OPENAI"
    AZURE_OPENAI = "AZURE_OPENAI"


class ProviderHttpError(RuntimeError):
    """プロバイダが HTTP エラーを返した。メッセージは移植元の例外と同じ書式にする。"""


@dataclass(frozen=True)
class RagAnswer:
    """RAG の回答本文と、根拠にしたコンテキストの ID。"""

    answer: str
    reference_ids: list[int]


def _image_url(media: CoreMedia) -> str:
    """画像を data URL（base64）にする。

    Parameters
    ----------
    media : CoreMedia
        添付の画像。

    Returns
    -------
    str
        `data:{MIME};base64,...` 形式の文字列。
    """
    mime_type = media.mime_type or DEFAULT_MIME_TYPE
    encoded = base64.b64encode(media.payload).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def to_provider_messages(messages: Sequence[CoreMessage]) -> list[dict[str, Any]]:
    """core のメッセージを chat completions の messages にする（toSpringMessages）。

    Parameters
    ----------
    messages : Sequence[CoreMessage]
        core のメッセージ列。

    Returns
    -------
    list[dict[str, Any]]
        chat completions の messages。
    """
    result: list[dict[str, Any]] = []
    has_image_media = False
    for message in messages:
        if message.role == Role.USER:
            if not message.media:
                result.append({"role": "user", "content": message.content})
                continue
            has_image_media = True
            parts: list[dict[str, Any]] = [{"type": "text", "text": message.content}]
            parts.extend(
                {"type": "image_url", "image_url": {"url": _image_url(media)}}
                for media in message.media
            )
            result.append({"role": "user", "content": parts})
        elif message.role == Role.ASSISTANT:
            result.append({"role": "assistant", "content": message.content})
        else:
            # SYSTEM・TOOL はどちらも system として送る
            result.append({"role": "system", "content": message.content})
    if has_image_media:
        result.insert(0, {"role": "system", "content": IMAGE_EXPLANATION_SYSTEM_PROMPT})
    return result


def to_rag_messages(request: CoreRagRequest) -> list[dict[str, Any]]:
    """RAG 回答用の messages（通常のメッセージ＋コンテキスト）を作る。

    Parameters
    ----------
    request : CoreRagRequest
        RAG のリクエスト。

    Returns
    -------
    list[dict[str, Any]]
        chat completions の messages。
    """
    messages = to_provider_messages(request.chat_request.messages)
    for context in request.contexts:
        messages.append(
            {
                "role": "user",
                "content": rag_prompt.context_text(context.path, context.content),
            }
        )
    return messages


def _is_enabled(value: str | None) -> bool:
    """reasoning_effort・verbosity が有効な値か判定する。

    Parameters
    ----------
    value : str | None
        設定値。

    Returns
    -------
    bool
        未指定・空白・`none` 以外なら True。
    """
    return value is not None and bool(value.strip()) and value.lower() != "none"


def _generation_options(
    family: ProviderFamily, options: CoreGenerationOptions
) -> dict[str, Any]:
    """生成パラメータ（applyOpenAiGenerationOptions・applyAzureGenerationOptions）。

    temperature は未指定なら Spring AI の既定値を送る。verbosity は OpenAI だけ。

    Parameters
    ----------
    family : ProviderFamily
        プロバイダの種別。
    options : CoreGenerationOptions
        生成オプション。

    Returns
    -------
    dict[str, Any]
        リクエスト本文に足す生成パラメータ。
    """
    body: dict[str, Any] = {}
    if options.max_tokens is not None:
        body["max_completion_tokens"] = options.max_tokens
    body["temperature"] = (
        options.temperature if options.temperature is not None else DEFAULT_TEMPERATURE
    )
    if options.top_p is not None:
        body["top_p"] = options.top_p
    if options.frequency_penalty is not None:
        body["frequency_penalty"] = options.frequency_penalty
    if options.presence_penalty is not None:
        body["presence_penalty"] = options.presence_penalty
    if options.stop is not None:
        body["stop"] = [options.stop]
    if _is_enabled(options.reasoning_effort):
        body["reasoning_effort"] = options.reasoning_effort
    if family == ProviderFamily.OPENAI and _is_enabled(options.verbosity):
        body["verbosity"] = options.verbosity
    return body


def _json_object_format() -> dict[str, Any]:
    """JSON オブジェクト応答の response_format を返す。

    Returns
    -------
    dict[str, Any]
        `json_object` 指定の辞書。
    """
    return {"type": "json_object"}


def chat_options(
    family: ProviderFamily,
    configuration: RuntimeProviderConfiguration,
    request: CoreChatRequest,
) -> dict[str, Any]:
    """通常 chat のオプション（toOpenAiOptions・toAzureOpenAiOptions）。

    Parameters
    ----------
    family : ProviderFamily
        プロバイダの種別。
    configuration : RuntimeProviderConfiguration
        プロバイダの実行時設定（互換のため受け取るだけで使わない）。
    request : CoreChatRequest
        chat のリクエスト。

    Returns
    -------
    dict[str, Any]
        リクエスト本文に足すオプション。
    """
    body = _generation_options(family, request.generation_options())
    if request.candidate_json_response_requested():
        body["response_format"] = _json_object_format()
    return body


def rag_options(
    family: ProviderFamily,
    configuration: RuntimeProviderConfiguration,
    request: CoreChatRequest,
) -> dict[str, Any]:
    """RAG 回答のオプション（toOpenAiRagOptions・toAzureOpenAiRagOptions）。

    Parameters
    ----------
    family : ProviderFamily
        プロバイダの種別。
    configuration : RuntimeProviderConfiguration
        プロバイダの実行時設定（互換のため受け取るだけで使わない）。
    request : CoreChatRequest
        chat のリクエスト。

    Returns
    -------
    dict[str, Any]
        リクエスト本文に足すオプション。
    """
    body = _generation_options(family, request.generation_options())
    if family == ProviderFamily.OPENAI:
        body["response_format"] = {
            "type": "json_schema",
            "json_schema": {
                "name": JSON_SCHEMA_NAME,
                "schema": RAG_OUTPUT_SCHEMA,
                "strict": True,
            },
        }
    else:
        body["response_format"] = _json_object_format()
    return body


def validation_options(
    family: ProviderFamily,
    configuration: RuntimeProviderConfiguration,
    request: CoreChatRequest,
) -> dict[str, Any]:
    """RAG 検証のオプション。生成パラメータは temperature だけ引き継ぐ。

    Parameters
    ----------
    family : ProviderFamily
        プロバイダの種別（使わない）。
    configuration : RuntimeProviderConfiguration
        プロバイダの実行時設定（互換のため受け取るだけで使わない）。
    request : CoreChatRequest
        chat のリクエスト。

    Returns
    -------
    dict[str, Any]
        リクエスト本文に足すオプション。
    """
    temperature = request.generation_options().temperature
    return {
        "temperature": temperature if temperature is not None else DEFAULT_TEMPERATURE,
        "response_format": _json_object_format(),
    }


def parse_rag_answer(text: str | None) -> RagAnswer | None:
    """RAG 回答の JSON（answer・id）を読む（SpringAiChatPromptMapper.parseRagAnswer）。

    id は 0 以上の整数（書かれたとおりの表記が `0` または先頭 0 なし）だけを受け付け、
    1 つでも外れたら読めないもの（None）にする。重複は最初の 1 つだけ残す。

    Parameters
    ----------
    text : str | None
        回答の本文（JSON）。None なら読めないものとする。

    Returns
    -------
    RagAnswer | None
        読めた回答。読めなければ None。
    """
    if text is None:
        return None
    try:
        value = loads_with_raw_numbers(text)
    except ValueError:
        return None
    if not isinstance(value, dict):
        return None
    raw_answer = value.get("answer")
    if raw_answer is None:
        answer = ""
    elif isinstance(raw_answer, str):
        answer = raw_answer
    elif isinstance(raw_answer, RawNumber):
        answer = raw_answer.text
    elif isinstance(raw_answer, bool):
        answer = "true" if raw_answer else "false"
    else:
        return None
    ids = value.get("id")
    if not isinstance(ids, list):
        return None
    reference_ids: list[int] = []
    for item in ids:
        if not isinstance(item, RawNumber) or not _REFERENCE_ID.fullmatch(item.text):
            return None
        reference_id = int(item.text)
        if reference_id not in reference_ids:
            reference_ids.append(reference_id)
    return RagAnswer(answer, reference_ids)


def validation_passed(text: str | None) -> bool:
    """検証の応答で answer が真か（Gson の getAsBoolean と同じく文字列 "true" も真）。

    Parameters
    ----------
    text : str | None
        検証の応答本文（JSON）。

    Returns
    -------
    bool
        answer が真なら True。
    """
    if text is None:
        return False
    try:
        value = loads_with_raw_numbers(text)
    except ValueError:
        return False
    if not isinstance(value, dict) or "answer" not in value:
        return False
    answer = value["answer"]
    if isinstance(answer, bool):
        return answer
    if isinstance(answer, str):
        return answer.lower() == "true"
    return False


def references_in_range(answer: RagAnswer, request: CoreRagRequest) -> bool:
    """回答の参照 ID がすべてコンテキストの範囲内か判定する。

    Parameters
    ----------
    answer : RagAnswer
        RAG の回答。
    request : CoreRagRequest
        RAG のリクエスト。

    Returns
    -------
    bool
        すべて 1 以上コンテキスト数以下なら True。
    """
    count = len(request.contexts)
    return all(1 <= reference_id <= count for reference_id in answer.reference_ids)


def context_text_for_id(request: CoreRagRequest, reference_id: int) -> str:
    """参照 ID に対応するコンテキストの文章を返す。

    Parameters
    ----------
    request : CoreRagRequest
        RAG のリクエスト。
    reference_id : int
        1 始まりの参照 ID。

    Returns
    -------
    str
        コンテキストの文章。範囲外なら `Context id:{ID}`。
    """
    index = reference_id - 1
    if 0 <= index < len(request.contexts):
        context = request.contexts[index]
        return rag_prompt.context_text(context.path, context.content)
    return f"Context id:{reference_id}"


def validation_messages(
    request: CoreRagRequest, answer: RagAnswer
) -> list[dict[str, Any]]:
    """RAG 検証のメッセージ（toRagValidationPrompt）。

    Parameters
    ----------
    request : CoreRagRequest
        RAG のリクエスト。
    answer : RagAnswer
        検証する RAG の回答。

    Returns
    -------
    list[dict[str, Any]]
        chat completions の messages。
    """
    messages: list[dict[str, Any]] = [
        {"role": "user", "content": context_text_for_id(request, reference_id)}
        for reference_id in answer.reference_ids
    ]
    messages.append(
        {"role": "user", "content": "Question:" + request.chat_request.last_user_text()}
    )
    messages.append({"role": "assistant", "content": "Answer:" + answer.answer})
    messages.append({"role": "user", "content": rag_prompt.RAG_VALIDATION_INSTRUCTION})
    return messages


def extract_text(response_body: Mapping[str, Any] | None) -> str | None:
    """応答の 1 件目の回答本文。なければ None（移植元は空文字列か null）。

    Parameters
    ----------
    response_body : Mapping[str, Any] | None
        chat completions の応答本文。

    Returns
    -------
    str | None
        回答本文。なければ None。
    """
    if not response_body:
        return None
    choices = response_body.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    first = choices[0]
    if not isinstance(first, dict):
        return None
    message = first.get("message")
    if not isinstance(message, dict):
        return None
    content = message.get("content")
    return content if isinstance(content, str) else None


class OpenAiCompatibleTransport(ChatTransportBase):
    """移植元 SpringAiChatTransport。"""

    def __init__(
        self, configuration: RuntimeProviderConfiguration, family: ProviderFamily
    ) -> None:
        """OpenAI 互換の送信先を作る。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの実行時設定。
        family : ProviderFamily
            プロバイダの種別。
        """
        self._configuration = configuration
        self._family = family

    @classmethod
    def open_ai(
        cls, configuration: RuntimeProviderConfiguration
    ) -> "OpenAiCompatibleTransport":
        """OpenAI 向けの送信先を作る。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの実行時設定。

        Returns
        -------
        OpenAiCompatibleTransport
            OpenAI 向けの送信先。
        """
        return cls(configuration, ProviderFamily.OPENAI)

    @classmethod
    def azure_open_ai(
        cls, configuration: RuntimeProviderConfiguration
    ) -> "OpenAiCompatibleTransport":
        """Azure OpenAI 向けの送信先を作る。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの実行時設定。

        Returns
        -------
        OpenAiCompatibleTransport
            Azure OpenAI 向けの送信先。
        """
        return cls(configuration, ProviderFamily.AZURE_OPENAI)

    def chat(
        self,
        configuration: RuntimeProviderConfiguration,
        request: CoreChatRequest,
        context: ExecutionContext,
    ) -> CoreChatResult:
        """通常の chat を 1 回呼ぶ。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの実行時設定（互換のため受け取るだけで使わない）。
        request : CoreChatRequest
            chat のリクエスト。
        context : ExecutionContext
            実行コンテキスト（使わない）。

        Returns
        -------
        CoreChatResult
            chat の結果。

        Raises
        ------
        ProviderHttpError
            プロバイダが HTTP エラーを返したとき。
        """
        body = self._call(
            to_provider_messages(request.messages),
            chat_options(self._family, self._configuration, request),
            "chat",
        )
        return CoreChatResult.success(
            extract_text(body) or "", [], request.output_mode_hint
        )

    def rag(
        self,
        configuration: RuntimeProviderConfiguration,
        request: CoreRagRequest,
        context: ExecutionContext,
    ) -> CoreChatResult:
        """RAG の回答と検証を呼び、検証を通った回答だけを返す。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの実行時設定（互換のため受け取るだけで使わない）。
        request : CoreRagRequest
            RAG のリクエスト。
        context : ExecutionContext
            実行コンテキスト（使わない）。

        Returns
        -------
        CoreChatResult
            成功の結果。回答できなければ no_answer の結果。

        Raises
        ------
        ProviderHttpError
            プロバイダが HTTP エラーを返したとき。
        """
        chat_request = request.chat_request
        answer_body = self._call(
            to_rag_messages(request),
            rag_options(self._family, self._configuration, chat_request),
            "rag-answer",
        )
        answer = parse_rag_answer(extract_text(answer_body))
        validation_text: str | None = None
        if answer is not None and answer.reference_ids:
            validation_body = self._call(
                validation_messages(request, answer),
                validation_options(self._family, self._configuration, chat_request),
                "rag-validation",
            )
            validation_text = extract_text(validation_body)
        if (
            answer is None
            or not answer.reference_ids
            or not references_in_range(answer, request)
            or not validation_passed(validation_text)
        ):
            logger.info(
                "rag answer rejected: provider=%s", self._configuration.provider_id
            )
            return CoreChatResult.no_answer(chat_request.output_mode_hint)
        return CoreChatResult.success(
            answer.answer,
            [context.path for context in request.contexts],
            chat_request.output_mode_hint,
            answer.reference_ids,
        )

    def _url_and_headers(self) -> tuple[str, dict[str, str], dict[str, str]]:
        """送信先の URL・ヘッダー・クエリを組み立てる。

        Returns
        -------
        tuple[str, dict[str, str], dict[str, str]]
            URL・ヘッダー・クエリパラメータの組。
        """
        configuration = self._configuration
        base = configuration.endpoint.rstrip("/")
        api_key = configuration.credential.value
        if self._family == ProviderFamily.OPENAI:
            return (
                f"{base}{OPENAI_COMPLETIONS_PATH}",
                {"Authorization": f"Bearer {api_key}"},
                {},
            )
        return (
            f"{base}/openai/deployments/{configuration.model_name}/chat/completions",
            {"api-key": api_key},
            {"api-version": AZURE_API_VERSION},
        )

    def _call(
        self, messages: list[dict[str, Any]], options: dict[str, Any], purpose: str
    ) -> dict[str, Any]:
        """chat completions を 1 回呼んで応答本文を返す。

        Parameters
        ----------
        messages : list[dict[str, Any]]
            送るメッセージ。
        options : dict[str, Any]
            リクエスト本文に足すオプション。
        purpose : str
            ログに出す呼び出しの目的。

        Returns
        -------
        dict[str, Any]
            応答本文（JSON オブジェクト以外なら空の辞書）。

        Raises
        ------
        ProviderHttpError
            プロバイダが HTTP エラーを返したとき。
        """
        url, headers, params = self._url_and_headers()
        body: dict[str, Any] = {
            "model": self._configuration.model_name,
            "messages": messages,
            "stream": False,
            **options,
        }
        logger.info(
            "provider request: provider=%s, purpose=%s, model=%s, messages=%d",
            self._configuration.provider_id,
            purpose,
            self._configuration.model_name,
            len(messages),
        )
        with httpx.Client(
            **client_options(self._configuration.network_setting)
        ) as client:
            response = client.post(url, headers=headers, params=params, json=body)
        logger.info(
            "provider response: provider=%s, purpose=%s, status=%d",
            self._configuration.provider_id,
            purpose,
            response.status_code,
        )
        if response.is_error:
            raise ProviderHttpError(self._error_message(response))
        parsed: Any = response.json()
        return parsed if isinstance(parsed, dict) else {}

    def _error_message(self, response: httpx.Response) -> str:
        """HTTP エラーのメッセージを移植元と同じ書式で作る。

        Parameters
        ----------
        response : httpx.Response
            エラーの応答。

        Returns
        -------
        str
            例外メッセージ。
        """
        # 移植元の例外メッセージの書式（Spring AI: "HTTP 400 - 本文"、
        # Azure SDK: "Status code 400, \"本文\""）。CoreFailure で秘密情報は伏せられる
        if self._family == ProviderFamily.OPENAI:
            return f"HTTP {response.status_code} - {response.text}"
        return f'Status code {response.status_code}, "{response.text}"'


class OpenAiCoreChatClient(GenericCoreProviderChatClient):
    """OpenAI 向けの chat クライアント。"""

    def __init__(self, configuration: RuntimeProviderConfiguration) -> None:
        """OpenAI 向けのクライアントを作る。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの実行時設定。
        """
        super().__init__(
            CoreProviderId.OpenAI,
            configuration,
            OpenAiCompatibleTransport.open_ai(configuration),
            EVIDENCE_OPENAI,
        )


class AzureOpenAiCoreChatClient(GenericCoreProviderChatClient):
    """Azure OpenAI 向けの chat クライアント。"""

    def __init__(self, configuration: RuntimeProviderConfiguration) -> None:
        """Azure OpenAI 向けのクライアントを作る。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの実行時設定。
        """
        super().__init__(
            CoreProviderId.AzureOpenAI,
            configuration,
            OpenAiCompatibleTransport.azure_open_ai(configuration),
            EVIDENCE_AZURE,
        )
