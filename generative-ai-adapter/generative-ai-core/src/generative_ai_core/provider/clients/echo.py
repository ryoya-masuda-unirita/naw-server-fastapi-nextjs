"""確認用のプロバイダ（Python 版だけ。移植元にはない）。

キーなしで動き、外部へは送信しない。Waha! エミュレーターから server-local まで
通しで動かすときに、LLM の代わりに使う。

- chat: 最後のユーザーのメッセージを回答にする。回答を 8 文字ずつ推論の途中経過
  （reasoning_delta）としても流し、ストリームファイルへの書き込みを確かめられるようにする
- RAG: 渡されたコンテキストをすべて参照したことにして、質問を回答にする（検証は通す）
- 画像説明: 添付のファイル名を含む固定の説明を返す
"""

import logging

from generative_ai_core.chat.models import (
    CoreChatRequest,
    CoreChatResult,
    CoreRagRequest,
    OutputModeHint,
    Role,
)
from generative_ai_core.provider.clients.base import (
    ChatTransportBase,
    GenericCoreProviderChatClient,
    stream_callbacks,
)
from generative_ai_core.provider.model import (
    CoreProviderId,
    RuntimeProviderConfiguration,
)
from generative_ai_core.provider.runtime import ExecutionContext

logger = logging.getLogger(__name__)

# 途中経過が複数回に分かれて書かれることを確かめられるよう、数文字ずつに区切る
ECHO_CHUNK_SIZE = 8
ECHO_IMAGE_EXPLANATION = "（echo）画像の説明は生成していません: {names}"
RAG_QUESTION_PREFIX = "Question: "
ECHO_ATTACHMENT_NOTE = "（添付: {names}）"


def chunks(text: str) -> list[str]:
    """文字列を ECHO_CHUNK_SIZE 文字ずつに区切る。

    Parameters
    ----------
    text : str
        区切る文字列。

    Returns
    -------
    list[str]
        区切った文字列のリスト。
    """
    return [text[i : i + ECHO_CHUNK_SIZE] for i in range(0, len(text), ECHO_CHUNK_SIZE)]


class EchoTransport(ChatTransportBase):
    """外部へ送信せず、質問をそのまま返す送信。"""

    def chat(
        self,
        configuration: RuntimeProviderConfiguration,
        request: CoreChatRequest,
        context: ExecutionContext,
    ) -> CoreChatResult:
        """最後のユーザーの発言を回答にして返す。

        回答は推論の途中経過としても数文字ずつ流す。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定（使わない）。
        request : CoreChatRequest
            チャットのリクエスト。
        context : ExecutionContext
            実行時の文脈（使わない）。

        Returns
        -------
        CoreChatResult
            回答を含む成功の結果。
        """
        media = [m for message in request.messages for m in message.media]
        names = ", ".join(m.filename or m.source_hint for m in media)
        if media and request.output_mode_hint == OutputModeHint.CHAT_TEXT:
            # 画像説明（CoreImageExplanationRequest.to_chat_request）の呼び出し
            answer = ECHO_IMAGE_EXPLANATION.format(names=names)
        else:
            # 画像の添付はメッセージの本文が空になるため、本文のある最後の発言を返す
            answer = next(
                (
                    m.content
                    for m in reversed(request.messages)
                    if m.role == Role.USER and m.content
                ),
                "",
            )
            if media:
                answer = f"{answer}{ECHO_ATTACHMENT_NOTE.format(names=names)}"
        callbacks = stream_callbacks(request)
        for chunk in chunks(answer):
            callbacks.on_reasoning_delta(chunk)
        logger.info("echo chat: answerChars=%d", len(answer))
        return CoreChatResult.success(answer, [], request.output_mode_hint)

    def rag(
        self,
        configuration: RuntimeProviderConfiguration,
        request: CoreRagRequest,
        context: ExecutionContext,
    ) -> CoreChatResult:
        """渡されたコンテキストをすべて参照したことにして、質問を回答にする。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定（使わない）。
        request : CoreRagRequest
            RAG のリクエスト。
        context : ExecutionContext
            実行時の文脈（使わない）。

        Returns
        -------
        CoreChatResult
            成功の結果。コンテキストがなければ回答なしの結果。
        """
        chat_request = request.chat_request
        if not request.contexts:
            return CoreChatResult.no_answer(chat_request.output_mode_hint)
        # アダプタは質問を `Question: ` 付きの最後のメッセージにするため、外して返す
        answer = chat_request.last_user_text().removeprefix(RAG_QUESTION_PREFIX)
        callbacks = stream_callbacks(chat_request)
        for chunk in chunks(answer):
            callbacks.on_reasoning_delta(chunk)
        reference_ids = list(range(1, len(request.contexts) + 1))
        logger.info("echo rag: contexts=%d", len(request.contexts))
        return CoreChatResult.success(
            answer,
            [c.path for c in request.contexts],
            chat_request.output_mode_hint,
            reference_ids,
        )


class EchoCoreChatClient(GenericCoreProviderChatClient):
    """Echo プロバイダのクライアント。"""

    def __init__(self, configuration: RuntimeProviderConfiguration) -> None:
        """EchoTransport を使うクライアントを作る。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定。
        """
        super().__init__(
            CoreProviderId.Echo,
            configuration,
            EchoTransport(),
            "Python echo provider for local emulator verification",
        )
