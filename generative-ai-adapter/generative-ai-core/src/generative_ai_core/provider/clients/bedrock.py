"""Bedrock（Claude）の Messages API 送信（Python 版だけの独自の拡張）。

**移植元に対応する実装がない。** 移植元の Anthropic は「未対応」のスタブで、Bedrock の
コードもない。クラウドの server が Bedrock Mantle を呼ぶ処理（`BedrockLlmChatClient`）の
接続の形式に合わせて、Python 版だけで作った。Echo と同じ「Python 版だけのプロバイダ」。

移植元が将来 Bedrock に対応したら、このファイルを移植元の実装に置き換える。このファイルと
`bedrock-ext` の目印がある行（`model.py`・`factory.py`・`vendor.py`）を消せば、元の状態に戻る。
手順は `generative-ai-adapter/README.md` の「移植元にない拡張」を参照。

OpenAI 系（`openai_compatible.py`）と同じ作りにしている。

- ストリーミングしない 1 回の呼び出し（`stream: false`）
- 画像付きメッセージの system プロンプトや、RAG のプロンプト・回答の解析・検証は、
  `openai_compatible.py` の共通の関数を使う（複製しない）
- RAG は回答 1 回と検証 1 回の最大 2 回呼ぶ

接続先ごとの違い（URL・認証のヘッダー）は `request_target` に集めてある。
"""

import json
import logging
import re
from collections.abc import Mapping
from typing import Any

import httpx

from generative_ai_core.chat.models import (
    CoreChatRequest,
    CoreChatResult,
    CoreGenerationOptions,
    CoreRagRequest,
)
from generative_ai_core.jsonutil import loads_with_raw_numbers
from generative_ai_core.network.transport import client_options
from generative_ai_core.provider.clients.base import (
    ChatTransportBase,
    GenericCoreProviderChatClient,
)
from generative_ai_core.provider.clients.openai_compatible import (
    ProviderHttpError,
    parse_rag_answer,
    references_in_range,
    to_provider_messages,
    to_rag_messages,
    validation_messages,
    validation_passed,
)
from generative_ai_core.provider.model import (
    CoreProviderId,
    RuntimeProviderConfiguration,
)
from generative_ai_core.provider.runtime import ExecutionContext

logger = logging.getLogger(__name__)

MESSAGES_PATH = "/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
# Messages API は max_tokens が必須。呼び出し側が指定しないときに使う値
DEFAULT_MAX_TOKENS = 8192
EVIDENCE_BEDROCK = (
    "Bedrock Mantle Anthropic Messages API client (Python-only extension, "
    "controlled invocation tests)"
)
_DATA_URL = re.compile(r"^data:(?P<mime>[^;,]+);base64,(?P<data>.*)$", re.DOTALL)
_PART_SEPARATOR = "\n\n"
# JSON を包むコードフェンス（``` または ```json）。言語名と改行の有無は問わない
_CODE_FENCE = re.compile(r"^```[A-Za-z0-9_-]*[ \t]*\n?(?P<body>.*?)\s*```$", re.DOTALL)


def request_target(
    configuration: RuntimeProviderConfiguration,
) -> tuple[str, dict[str, str]]:
    """接続先の URL と認証のヘッダーを組み立てる（接続先ごとの違いはここだけ）。

    認証は Bearer の API キーだけを送る。Mantle は ``x-api-key`` と ``Authorization``
    が同時にあるリクエストを 401 で拒否するため、キー用ヘッダーは付けない（実機で確認済み）。

    Parameters
    ----------
    configuration : RuntimeProviderConfiguration
        プロバイダの実行時設定。

    Returns
    -------
    tuple[str, dict[str, str]]
        URL と、リクエストのヘッダー。
    """
    api_key = configuration.credential.value
    url = f"{configuration.endpoint.rstrip('/')}{MESSAGES_PATH}"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    }
    return url, headers


def _to_content(content: Any) -> Any:
    """chat completions 形式の content を、Messages API の content にする。

    Parameters
    ----------
    content : Any
        文字列、または `text` / `image_url` のパートの配列。

    Returns
    -------
    Any
        文字列はそのまま。配列は `text` / `image` のブロックの配列。
    """
    if not isinstance(content, list):
        return content
    blocks: list[dict[str, Any]] = []
    for part in content:
        if part.get("type") == "image_url":
            matched = _DATA_URL.match(part["image_url"]["url"])
            if matched is None:
                raise ValueError("image url must be a base64 data url")
            blocks.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": matched.group("mime"),
                        "data": matched.group("data"),
                    },
                }
            )
        else:
            blocks.append({"type": "text", "text": part.get("text", "")})
    return blocks


def to_messages_payload(
    messages: list[dict[str, Any]],
) -> tuple[str | None, list[dict[str, Any]]]:
    """chat completions 形式の messages を、system と messages に分ける。

    Messages API は system を messages に入れず、別の項目で受け取る。

    Parameters
    ----------
    messages : list[dict[str, Any]]
        chat completions 形式の messages（`to_provider_messages` の結果など）。

    Returns
    -------
    tuple[str | None, list[dict[str, Any]]]
        system の文字列（なければ None）と、user / assistant の messages。
    """
    system_parts: list[str] = []
    conversation: list[dict[str, Any]] = []
    for message in messages:
        role = str(message["role"]).lower()
        if role == "system":
            system_parts.append(str(message["content"]))
            continue
        conversation.append({"role": role, "content": _to_content(message["content"])})
    system = _PART_SEPARATOR.join(system_parts) if system_parts else None
    return system, conversation


def generation_body(options: CoreGenerationOptions) -> dict[str, Any]:
    """生成パラメータを Messages API の項目にする。

    温度と top_p は、指定されたときだけ送る（OpenAI 系の既定の 0.7 は引き継がない）。
    両方が指定されたときは、温度だけを送る（新しい Claude のモデルは同時の指定を拒否する）。
    Messages API にない frequency_penalty・presence_penalty・reasoning_effort・
    verbosity は送らない。

    Parameters
    ----------
    options : CoreGenerationOptions
        生成オプション。

    Returns
    -------
    dict[str, Any]
        リクエスト本文に足す項目。
    """
    body: dict[str, Any] = {
        "max_tokens": options.max_tokens
        if options.max_tokens is not None
        else DEFAULT_MAX_TOKENS
    }
    if options.temperature is not None:
        body["temperature"] = options.temperature
    # 新しい Claude のモデルは、温度と top_p を同時に指定すると拒否するため、
    # 両方あるときは温度だけを送る
    if options.top_p is not None and options.temperature is None:
        body["top_p"] = options.top_p
    if options.stop is not None:
        body["stop_sequences"] = [options.stop]
    return body


def _is_json(text: str) -> bool:
    """文字列が JSON として読めるかを返す（RAG の回答の読み取りと同じ関数で判定する）。

    Parameters
    ----------
    text : str
        判定する文字列。

    Returns
    -------
    bool
        読めるとき True。
    """
    try:
        loads_with_raw_numbers(text)
    except ValueError:
        return False
    return True


def json_payload(text: str | None) -> str | None:
    """RAG の返答の本文から、JSON の部分を取り出す。

    Messages API には、OpenAI 系のような JSON 形式の出力の指定がなく、Claude は JSON を
    コードフェンスで包んだり、前後に説明文を付けたりして返す。読み取りの前に、前後の空白と
    コードフェンスを取り除き、それでも読めなければ、前後の説明文の中から、読める最初の
    JSON オブジェクトを探して取り出す（説明文の中の ``{`` ``}`` は読み飛ばす）。読めない
    ものは、元の文字列をそのまま返す（読み取りで従来どおり却下される）。

    Parameters
    ----------
    text : str | None
        返答の本文。

    Returns
    -------
    str | None
        JSON として読める部分。読めなければ元の文字列そのまま。None は None。
    """
    if text is None:
        return None
    stripped = text.strip()
    fenced = _CODE_FENCE.match(stripped)
    if fenced is not None:
        stripped = fenced.group("body").strip()
    if _is_json(stripped):
        return stripped
    decoder = json.JSONDecoder()
    for start, character in enumerate(stripped):
        if character != "{":
            continue
        # 説明文の中の { } に惑わされないよう、各 { から読める最初の JSON を探す
        try:
            _, end = decoder.raw_decode(stripped, start)
        except ValueError:
            continue
        if _is_json(stripped[start:end]):
            return stripped[start:end]
    return text


def extract_text(response_body: Mapping[str, Any] | None) -> str | None:
    """応答の text ブロックを順につないだ回答本文。なければ None。

    Parameters
    ----------
    response_body : Mapping[str, Any] | None
        Messages API の応答本文。

    Returns
    -------
    str | None
        回答本文。text ブロックがなければ None。
    """
    if not response_body:
        return None
    content = response_body.get("content")
    if not isinstance(content, list):
        return None
    texts = [
        block["text"]
        for block in content
        if isinstance(block, dict)
        and block.get("type") == "text"
        and isinstance(block.get("text"), str)
    ]
    return "".join(texts) if texts else None


class BedrockMessagesTransport(ChatTransportBase):
    """Bedrock Mantle の Messages API への送信。"""

    def __init__(self, configuration: RuntimeProviderConfiguration) -> None:
        """送信先を作る。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの実行時設定。
        """
        self._configuration = configuration

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
            generation_body(request.generation_options()),
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
        options = generation_body(chat_request.generation_options())
        answer_body = self._call(to_rag_messages(request), options, "rag-answer")
        answer = parse_rag_answer(json_payload(extract_text(answer_body)))
        validation_text: str | None = None
        if answer is not None and answer.reference_ids:
            # 検証は温度だけを引き継ぐ（OpenAI 系と同じ）
            validation_options = {
                key: value
                for key, value in options.items()
                if key in ("max_tokens", "temperature")
            }
            validation_body = self._call(
                validation_messages(request, answer),
                validation_options,
                "rag-validation",
            )
            validation_text = json_payload(extract_text(validation_body))
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

    def _call(
        self, messages: list[dict[str, Any]], options: dict[str, Any], purpose: str
    ) -> dict[str, Any]:
        """Messages API を 1 回呼んで応答本文を返す。

        Parameters
        ----------
        messages : list[dict[str, Any]]
            chat completions 形式の messages。
        options : dict[str, Any]
            リクエスト本文に足す項目。
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
        system, conversation = to_messages_payload(messages)
        body: dict[str, Any] = {
            "model": self._configuration.model_name,
            "messages": conversation,
            "stream": False,
            **options,
        }
        if system is not None:
            body["system"] = system
        url, headers = request_target(self._configuration)
        logger.info(
            "provider request: provider=%s, purpose=%s, model=%s, messages=%d",
            self._configuration.provider_id,
            purpose,
            self._configuration.model_name,
            len(conversation),
        )
        with httpx.Client(
            **client_options(self._configuration.network_setting)
        ) as client:
            response = client.post(url, headers=headers, json=body)
        logger.info(
            "provider response: provider=%s, purpose=%s, status=%d",
            self._configuration.provider_id,
            purpose,
            response.status_code,
        )
        if response.is_error:
            raise ProviderHttpError(f"HTTP {response.status_code} - {response.text}")
        parsed: Any = response.json()
        return parsed if isinstance(parsed, dict) else {}


class BedrockCoreChatClient(GenericCoreProviderChatClient):
    """Bedrock（Claude）向けの chat クライアント。"""

    def __init__(self, configuration: RuntimeProviderConfiguration) -> None:
        """Bedrock 向けのクライアントを作る。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの実行時設定。
        """
        super().__init__(
            CoreProviderId.Bedrock,
            configuration,
            BedrockMessagesTransport(configuration),
            EVIDENCE_BEDROCK,
        )
