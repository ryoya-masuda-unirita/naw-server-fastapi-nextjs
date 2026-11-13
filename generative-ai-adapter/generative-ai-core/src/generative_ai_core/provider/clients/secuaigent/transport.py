"""SecuAiGent の chat 送信（移植元 SecuAiGentTransport・SecuAiGentCoreChatClient）。

`POST {URL}/api/llm/chat` に multipart（`textData` の JSON と添付 `attachmentFiles`）を
送り、SSE（`data:` 行の JSON）を読む。

- `reasoning_delta`・`library_title_delta`・`library_content_delta` はコールバックへ渡す
- `text_delta` をつないで回答にし、`message_stop` で成功にする
- `error` や途中で切れたら、分類した固定の失敗にする
- RAG は回答 1 回と検証 1 回の 2 回呼ぶ。検証の呼び出しにはコールバックを渡さない
"""

import json
import logging
import re
import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

from generative_ai_core.chat import rag_prompt
from generative_ai_core.chat.models import (
    GENERATION_OPTIONS_ATTRIBUTE,
    RAG_JSON_RESPONSE_ATTRIBUTE,
    CoreChatRequest,
    CoreChatRequestBuilder,
    CoreChatResult,
    CoreImageExplanationRequest,
    CoreImageExplanationResult,
    CoreMessage,
    CoreRagRequest,
)
from generative_ai_core.failure import CoreFailure
from generative_ai_core.jsonutil import RawNumber, loads_with_raw_numbers
from generative_ai_core.network.transport import create_transport, describe
from generative_ai_core.provider.clients.base import ChatTransportBase, stream_callbacks
from generative_ai_core.provider.clients.secuaigent import failure, request_mapper, sse
from generative_ai_core.provider.clients.secuaigent.auth import (
    HTTP_ERROR_THRESHOLD,
    HTTP_PROXY_AUTH_REQUIRED,
    SecuAiGentAuthClient,
    normalize_base_url,
)
from generative_ai_core.provider.clients.secuaigent.keys import TENANT_ID
from generative_ai_core.provider.model import (
    Capability,
    CoreProviderCapabilityStatus,
    CoreProviderId,
    RuntimeProviderConfiguration,
)
from generative_ai_core.provider.runtime import ExecutionContext

logger = logging.getLogger(__name__)

CHAT_PATH = "/api/llm/chat"
BOUNDARY_PREFIX = "secuaigent-"
STREAM_ENDED_MESSAGE = "SecuAiGent stream ended before completion"
_REFERENCE_ID = re.compile(r"0|[1-9][0-9]*")
_MIME_TYPE = re.compile(r"^[^\s/;]+/[^\s/;]+(\s*;.*)?$")
DEL = 0x7F


@dataclass(frozen=True)
class RagAnswer:
    """RAG の回答本文と、根拠にしたコンテキストの ID。"""

    answer: str
    reference_ids: list[int]


def _validate_filename(filename: str | None) -> str:
    """添付のファイル名を確かめる。

    Parameters
    ----------
    filename : str | None
        添付のファイル名。

    Returns
    -------
    str
        検証済みのファイル名。

    Raises
    ------
    ValueError
        空・禁止文字・制御文字を含むとき。
    """
    if (
        filename is None
        or not filename.strip()
        or any(ch in filename for ch in ('"', "/", "\\"))
        or any(ord(ch) < 0x20 or ord(ch) == DEL for ch in filename)
    ):
        raise ValueError("Attachment filename is invalid")
    return filename


def _validate_mime_type(mime_type: str | None) -> str:
    """添付の MIME タイプを確かめる。

    Parameters
    ----------
    mime_type : str | None
        添付の MIME タイプ。

    Returns
    -------
    str
        検証済みの MIME タイプ。

    Raises
    ------
    ValueError
        空・形式が不正・ワイルドカードを含むとき。
    """
    if mime_type is None or not mime_type.strip():
        raise ValueError("Attachment MIME type must not be blank")
    if not _MIME_TYPE.match(mime_type):
        raise ValueError("Attachment MIME type is invalid")
    type_part, _, rest = mime_type.partition("/")
    subtype = rest.split(";", 1)[0].strip()
    if type_part.strip() == "*" or subtype == "*" or subtype.startswith("*+"):
        raise ValueError("Attachment MIME type is invalid")
    return mime_type


def build_multipart_body(
    boundary: str, text_data_json: str, request: CoreChatRequest
) -> bytes:
    """移植元 buildMultipartBody。添付の名前・MIME・中身を確かめてから組み立てる。

    Parameters
    ----------
    boundary : str
        multipart の境界文字列。
    text_data_json : str
        textData の JSON 文字列。
    request : CoreChatRequest
        chat のリクエスト。

    Returns
    -------
    bytes
        multipart/form-data の本文。

    Raises
    ------
    ValueError
        添付の名前・MIME・中身が不正なとき。
    """
    body = bytearray()
    body += (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="textData"\r\n'
        "Content-Type: application/json\r\n\r\n"
        f"{text_data_json}\r\n"
    ).encode()
    filenames: set[str] = set()
    for message in request.messages:
        for media in message.media:
            filename = _validate_filename(media.filename)
            if filename in filenames:
                raise ValueError("Attachment filename must be unique")
            filenames.add(filename)
            mime_type = _validate_mime_type(media.mime_type)
            if not media.payload:
                raise ValueError("Attachment payload must not be empty")
            body += (
                f"--{boundary}\r\n"
                'Content-Disposition: form-data; name="attachmentFiles"; '
                f'filename="{filename}"\r\n'
                f"Content-Type: {mime_type}\r\n\r\n"
            ).encode()
            body += media.payload
            body += b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    return bytes(body)


def parse_rag_answer(text: str) -> RagAnswer | None:
    """SecuAiGent の RAG 回答の JSON（answer は文字列、id は 0 以上の整数）。

    Parameters
    ----------
    text : str
        回答の本文（JSON）。

    Returns
    -------
    RagAnswer | None
        読めた回答。読めなければ None。
    """
    try:
        value: Any = loads_with_raw_numbers(text)
    except ValueError:
        return None
    if not isinstance(value, dict):
        return None
    answer = value.get("answer")
    ids = value.get("id")
    if not isinstance(answer, str) or not isinstance(ids, list):
        return None
    reference_ids: list[int] = []
    for item in ids:
        if not isinstance(item, RawNumber) or not _REFERENCE_ID.fullmatch(item.text):
            return None
        reference_id = int(item.text)
        if reference_id not in reference_ids:
            reference_ids.append(reference_id)
    return RagAnswer(answer, reference_ids)


def validation_passed(text: str) -> bool:
    """検証の応答で answer が真か判定する。

    Parameters
    ----------
    text : str
        検証の応答本文（JSON）。

    Returns
    -------
    bool
        answer が真の boolean なら True。
    """
    try:
        value = json.loads(text)
    except ValueError:
        return False
    return isinstance(value, dict) and value.get("answer") is True


def validation_request(request: CoreRagRequest, answer: RagAnswer) -> CoreChatRequest:
    """RAG 検証用の chat リクエストを作る。

    Parameters
    ----------
    request : CoreRagRequest
        RAG のリクエスト。
    answer : RagAnswer
        検証する RAG の回答。

    Returns
    -------
    CoreChatRequest
        検証用の chat リクエスト。
    """
    source = request.chat_request
    builder = (
        CoreChatRequestBuilder(source.provider_id)
        .network_setting(source.network_setting)
        .output_mode_hint(source.output_mode_hint)
        .attribute(RAG_JSON_RESPONSE_ATTRIBUTE, True)
    )
    generation_options = source.attributes.get(GENERATION_OPTIONS_ATTRIBUTE)
    if generation_options is not None:
        builder.attribute(GENERATION_OPTIONS_ATTRIBUTE, generation_options)
    for reference_id in answer.reference_ids:
        context = request.contexts[reference_id - 1]
        builder.add_message(
            CoreMessage.user(rag_prompt.context_text(context.path, context.content))
        )
    builder.add_message(CoreMessage.user("Question:" + source.last_user_text()))
    builder.add_message(CoreMessage.assistant("Answer:" + answer.answer))
    builder.add_message(CoreMessage.user(rag_prompt.RAG_VALIDATION_INSTRUCTION))
    return builder.build()


def _stream_failure(request: CoreChatRequest, message: str) -> CoreChatResult:
    """ストリームの失敗を分類した固定の失敗の結果にする。

    Parameters
    ----------
    request : CoreChatRequest
        chat のリクエスト。
    message : str
        失敗のメッセージ。

    Returns
    -------
    CoreChatResult
        失敗の結果。
    """
    failure_class = failure.classify(failure.SecuAiGentIOError(message))
    return CoreChatResult.from_failure(
        CoreFailure.of(failure_class, failure.summary(failure_class)),
        request.output_mode_hint,
    )


def parse_sse_stream(request: CoreChatRequest, lines: Iterator[str]) -> CoreChatResult:
    """SSE の行を読み、回答の結果にする。

    Parameters
    ----------
    request : CoreChatRequest
        chat のリクエスト。
    lines : Iterator[str]
        SSE の行。

    Returns
    -------
    CoreChatResult
        message_stop で成功の結果。error・途中切れは失敗の結果。
    """
    callbacks = stream_callbacks(request)
    answer: list[str] = []
    counts = {"reasoning": 0, "library": 0, "text": 0}
    for line in lines:
        event = sse.parse_data_line(line)
        match event:
            case None:
                continue
            case sse.ReasoningDelta(text=text):
                if text:
                    counts["reasoning"] += 1
                    callbacks.on_reasoning_delta(text)
            case sse.LibraryTitleDelta(text=text):
                if text:
                    counts["library"] += 1
                    callbacks.on_library_title_delta(text)
            case sse.LibraryContentDelta(text=text):
                if text:
                    counts["library"] += 1
                    callbacks.on_library_content_delta(text)
            case sse.TextDelta(text=text):
                counts["text"] += 1
                answer.append(text)
            case sse.ErrorEvent(message=message):
                logger.warning("secuaigent stream returned error event")
                return _stream_failure(request, message)
            case sse.MessageStop():
                logger.info(
                    "secuaigent stream finished: reasoningDeltas=%d, libraryDeltas=%d, "
                    "textDeltas=%d",
                    counts["reasoning"],
                    counts["library"],
                    counts["text"],
                )
                return CoreChatResult.success(
                    "".join(answer), [], request.output_mode_hint
                )
    logger.warning("secuaigent stream ended before message_stop")
    return _stream_failure(request, STREAM_ENDED_MESSAGE)


class SecuAiGentTransport(ChatTransportBase):
    """SecuAiGent に chat を送る。"""

    def __init__(
        self,
        configuration: RuntimeProviderConfiguration,
        auth_client: SecuAiGentAuthClient | None = None,
    ) -> None:
        """送信先を作る。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの実行時設定。
        auth_client : SecuAiGentAuthClient | None
            ログインのクライアント。省略すると既定のもの。
        """
        self._configuration = configuration
        self._auth_client = auth_client or SecuAiGentAuthClient()

    def chat(
        self,
        configuration: RuntimeProviderConfiguration,
        request: CoreChatRequest,
        context: ExecutionContext,
    ) -> CoreChatResult:
        """multipart で chat を送り、SSE を読む。

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
        """
        # 引数の configuration ではなく、作成時の設定を使う（移植元と同じ）
        own = self._configuration
        boundary = f"{BOUNDARY_PREFIX}{uuid.uuid4()}"
        text_data_json = request_mapper.to_text_data_json(own, request)
        body = build_multipart_body(boundary, text_data_json, request)
        token = self._auth_client.resolve_access_token(own)
        tenant_id = own.attributes.get(TENANT_ID, "")
        transport = create_transport(own.network_setting)
        holder: list[CoreChatResult] = []

        def handle(status_code: int, lines: Iterator[str]) -> None:
            """応答を読んで結果を holder に入れる。

            Parameters
            ----------
            status_code : int
                HTTP ステータスコード。
            lines : Iterator[str]
                応答本文の行。
            """
            logger.info("secuaigent response: status=%d", status_code)
            if status_code >= HTTP_ERROR_THRESHOLD:
                failure_class = (
                    failure.PROXY_AUTH_FAILURE
                    if status_code == HTTP_PROXY_AUTH_REQUIRED
                    else failure.NETWORK_FAILURE
                )
                holder.append(
                    CoreChatResult.from_failure(
                        CoreFailure.of(failure_class, failure.summary(failure_class)),
                        request.output_mode_hint,
                    )
                )
                return
            holder.append(parse_sse_stream(request, lines))

        logger.info(
            "secuaigent request: POST %s, messages=%d, attachments=%d",
            CHAT_PATH,
            len(request.messages),
            sum(len(m.media) for m in request.messages),
        )
        transport.post_streaming(
            normalize_base_url(own.endpoint) + CHAT_PATH,
            {
                "Authorization": f"Bearer {token}",
                "X-Tenant-ID": tenant_id,
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
            body,
            handle,
        )
        return holder[0]

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
            プロバイダの実行時設定。
        request : CoreRagRequest
            RAG のリクエスト。
        context : ExecutionContext
            実行コンテキスト。

        Returns
        -------
        CoreChatResult
            成功の結果。回答できなければ no_answer か失敗の結果。
        """
        answer_result = self.chat(configuration, request.chat_request, context)
        if answer_result.failure is not None:
            return answer_result
        answer = parse_rag_answer(answer_result.answer)
        if (
            answer is None
            or not answer.reference_ids
            or not all(
                1 <= reference_id <= len(request.contexts)
                for reference_id in answer.reference_ids
            )
        ):
            logger.info("secuaigent rag answer rejected before validation")
            return CoreChatResult.no_answer(request.chat_request.output_mode_hint)
        validation_result = self.chat(
            configuration, validation_request(request, answer), context
        )
        if validation_result.failure is not None:
            return validation_result
        if not validation_passed(validation_result.answer):
            logger.info("secuaigent rag answer rejected by validation")
            return CoreChatResult.no_answer(request.chat_request.output_mode_hint)
        return CoreChatResult.success(
            answer.answer,
            [c.path for c in request.contexts],
            request.chat_request.output_mode_hint,
            answer.reference_ids,
        )


class SecuAiGentCoreChatClient:
    """移植元 SecuAiGentCoreChatClient。例外は分類した固定の失敗にする。"""

    def __init__(
        self,
        configuration: RuntimeProviderConfiguration,
        transport: ChatTransportBase | None = None,
    ) -> None:
        """クライアントを作る。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの実行時設定。
        transport : ChatTransportBase | None
            送信先。省略すると SecuAiGent の送信先。
        """
        self._configuration = configuration
        self._transport: Any = transport or SecuAiGentTransport(configuration)
        network_evidence = describe(configuration.network_setting)
        evidences = {
            Capability.CHAT: "SecuAiGent multipart SSE chat transport",
            Capability.RAG: "SecuAiGent context chat transport",
            Capability.IMAGE_EXPLANATION: (
                "SecuAiGent multipart SSE image explanation transport"
            ),
        }
        self._statuses = {
            capability: CoreProviderCapabilityStatus.supported(
                CoreProviderId.SecuAiGent, capability, evidence, network_evidence
            )
            for capability, evidence in evidences.items()
        }

    @property
    def provider_id(self) -> CoreProviderId:
        """プロバイダ ID を返す。

        Returns
        -------
        CoreProviderId
            SecuAiGent のプロバイダ ID。
        """
        return CoreProviderId.SecuAiGent

    def supported_capabilities(self) -> set[Capability]:
        """対応する機能の集合を返す。

        Returns
        -------
        set[Capability]
            対応する機能。
        """
        return set(self._statuses)

    def capability_statuses(self) -> dict[Capability, CoreProviderCapabilityStatus]:
        """機能ごとの対応状況を返す。

        Returns
        -------
        dict[Capability, CoreProviderCapabilityStatus]
            機能と対応状況の辞書（コピー）。
        """
        return dict(self._statuses)

    def chat(
        self, request: CoreChatRequest, context: ExecutionContext
    ) -> CoreChatResult:
        """chat を呼ぶ。例外は失敗の結果にする。

        Parameters
        ----------
        request : CoreChatRequest
            chat のリクエスト。
        context : ExecutionContext
            実行コンテキスト。

        Returns
        -------
        CoreChatResult
            chat の結果。
        """
        try:
            result: CoreChatResult = self._transport.chat(
                self._configuration, request, context
            )
            return result
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            logger.warning("secuaigent chat failed: error=%s", type(e).__name__)
            return CoreChatResult.from_failure(
                failure.to_failure(e), request.output_mode_hint
            )

    def rag(self, request: CoreRagRequest, context: ExecutionContext) -> CoreChatResult:
        """RAG を呼ぶ。例外は失敗の結果にする。

        Parameters
        ----------
        request : CoreRagRequest
            RAG のリクエスト。
        context : ExecutionContext
            実行コンテキスト。

        Returns
        -------
        CoreChatResult
            RAG の結果。
        """
        try:
            result: CoreChatResult = self._transport.rag(
                self._configuration, request, context
            )
            return result
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            logger.warning("secuaigent rag failed: error=%s", type(e).__name__)
            return CoreChatResult.from_failure(
                failure.to_failure(e), request.chat_request.output_mode_hint
            )

    def image_explanation(
        self, request: CoreImageExplanationRequest, context: ExecutionContext
    ) -> CoreImageExplanationResult:
        """画像の説明を呼ぶ。例外・空の説明は失敗の結果にする。

        Parameters
        ----------
        request : CoreImageExplanationRequest
            画像説明のリクエスト。
        context : ExecutionContext
            実行コンテキスト。

        Returns
        -------
        CoreImageExplanationResult
            画像説明の結果。
        """
        try:
            result: CoreImageExplanationResult | None = (
                self._transport.image_explanation(self._configuration, request, context)
            )
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            return CoreImageExplanationResult.from_failure(failure.to_failure(e))
        if result is None:
            return CoreImageExplanationResult.from_failure(
                failure.to_failure(
                    failure.SecuAiGentIOError(
                        "Image explanation result must not be null"
                    )
                )
            )
        if result.failure is not None:
            return result
        if not result.explanation_present or not result.explanation.strip():
            return CoreImageExplanationResult.from_failure(
                failure.to_failure(ValueError("Image explanation must not be blank"))
            )
        return result
