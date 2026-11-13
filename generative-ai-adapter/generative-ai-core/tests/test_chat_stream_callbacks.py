"""移植元 CoreStreamCallbacksTest の移植。"""

from generative_ai_core.chat.models import (
    NO_STREAM_CALLBACKS,
    STREAM_CALLBACKS_ATTRIBUTE,
    CoreChatRequest,
    CoreChatRequestBuilder,
    CoreChatResult,
    CoreMessage,
    CoreRagRequest,
)
from generative_ai_core.provider.clients.base import ChatTransportBase, controlled
from generative_ai_core.provider.model import (
    Capability,
    CoreProviderId,
    RuntimeProviderConfiguration,
)
from generative_ai_core.provider.runtime import ExecutionContext


class _ReasoningRecorder:
    """推論の途中経過だけを記録するコールバック（移植元の `reasoning::add`）。"""

    def __init__(self) -> None:
        """空の記録で作る。"""
        self.reasoning: list[str] = []

    def on_reasoning_delta(self, text: str) -> None:
        """推論の途中経過を記録する。

        Parameters
        ----------
        text : str
            途中経過。
        """
        self.reasoning.append(text)

    def on_library_title_delta(self, text: str) -> None:
        """ライブラリのタイトルは記録しない。

        Parameters
        ----------
        text : str
            途中経過（使わない）。
        """

    def on_library_content_delta(self, text: str) -> None:
        """ライブラリの本文は記録しない。

        Parameters
        ----------
        text : str
            途中経過（使わない）。
        """


class _CallbackTransport(ChatTransportBase):
    """chat の中でコールバックを呼ぶ送信。"""

    def __init__(self, deltas: list[tuple[str, str]], answer: str) -> None:
        """呼ぶコールバックと回答を決めて作る。

        Parameters
        ----------
        deltas : list[tuple[str, str]]
            （種類, 文字列）の列。種類は reasoning・title・content。
        answer : str
            返す回答。
        """
        self._deltas = deltas
        self._answer = answer

    def chat(
        self,
        configuration: RuntimeProviderConfiguration,
        request: CoreChatRequest,
        context: ExecutionContext,
    ) -> CoreChatResult:
        """コールバックを順に呼んで回答を返す。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定。
        request : CoreChatRequest
            chat のリクエスト。
        context : ExecutionContext
            実行の文脈。

        Returns
        -------
        CoreChatResult
            決まった回答。
        """
        callbacks = request.stream_callbacks()
        for kind, text in self._deltas:
            if kind == "reasoning":
                callbacks.on_reasoning_delta(text)
            elif kind == "title":
                callbacks.on_library_title_delta(text)
            else:
                callbacks.on_library_content_delta(text)
        return CoreChatResult.success(self._answer, [], request.output_mode_hint)

    def rag(
        self,
        configuration: RuntimeProviderConfiguration,
        request: CoreRagRequest,
        context: ExecutionContext,
    ) -> CoreChatResult:
        """使わない。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定。
        request : CoreRagRequest
            RAG のリクエスト。
        context : ExecutionContext
            実行の文脈。

        Returns
        -------
        CoreChatResult
            返さない。

        Raises
        ------
        NotImplementedError
            常に投げる。
        """
        raise NotImplementedError


def _execution_context() -> ExecutionContext:
    """OpenAI の chat の実行文脈を作る。

    Returns
    -------
    ExecutionContext
        実行の文脈。
    """
    return ExecutionContext("OpenAI", Capability.CHAT)


def test_none_does_not_record_reasoning_deltas() -> None:
    """何もしないコールバックは常に同じものであること"""
    callbacks = NO_STREAM_CALLBACKS

    callbacks.on_reasoning_delta("ignored")

    assert CoreChatRequestBuilder("OpenAI").build().stream_callbacks() is callbacks


def test_controlled_transport_delivers_reasoning_independently_from_answer() -> None:
    """推論の途中経過が最終回答とは別に届くこと"""
    recorder = _ReasoningRecorder()
    client = controlled(
        CoreProviderId.OpenAI,
        _CallbackTransport(
            [
                ("reasoning", "alpha"),
                ("title", "library-title"),
                ("content", "library-content"),
                ("reasoning", "beta"),
            ],
            "answer-only",
        ),
    )
    request = (
        CoreChatRequestBuilder("OpenAI")
        .add_message(CoreMessage.user("hello"))
        .attribute(STREAM_CALLBACKS_ATTRIBUTE, recorder)
        .build()
    )

    result = client.chat(request, _execution_context())

    assert recorder.reasoning == ["alpha", "beta"]
    assert result.answer == "answer-only"
    assert result.failure is None


def test_request_without_callbacks_uses_none_semantics() -> None:
    """コールバックなしのリクエストでも送信が失敗しないこと"""
    client = controlled(
        CoreProviderId.OpenAI,
        _CallbackTransport([("reasoning", "must-not-fire")], "plain"),
    )

    result = client.chat(
        CoreChatRequestBuilder("OpenAI").add_message(CoreMessage.user("hello")).build(),
        _execution_context(),
    )

    assert result.answer == "plain"


def test_with_stream_callbacks_adds_and_removes_without_mutating_original() -> None:
    """コールバックの付け外しで元のリクエストが変わらないこと"""
    callbacks = _ReasoningRecorder()
    original = (
        CoreChatRequestBuilder("OpenAI").add_message(CoreMessage.user("hello")).build()
    )

    with_callbacks = original.with_stream_callbacks(callbacks)
    removed_with_null = with_callbacks.with_stream_callbacks(None)
    removed_with_none = with_callbacks.with_stream_callbacks(NO_STREAM_CALLBACKS)

    assert original.stream_callbacks() is NO_STREAM_CALLBACKS
    assert with_callbacks.stream_callbacks() is callbacks
    assert STREAM_CALLBACKS_ATTRIBUTE not in removed_with_null.attributes
    assert STREAM_CALLBACKS_ATTRIBUTE not in removed_with_none.attributes
