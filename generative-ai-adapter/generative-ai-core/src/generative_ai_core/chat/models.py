"""chat・RAG・画像説明の入出力（移植元 `jp.co.unirita.ai.core.chat` の record 群）。"""

import os
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field, replace
from enum import StrEnum
from types import MappingProxyType
from typing import Protocol

from generative_ai_core.failure import CoreFailure
from generative_ai_core.network.setting import CoreNetworkSetting

GENERATION_OPTIONS_ATTRIBUTE = "core.generationOptions"
RAG_JSON_RESPONSE_ATTRIBUTE = "core.rag.jsonResponse"
CANDIDATE_JSON_RESPONSE_ATTRIBUTE = "core.candidate.jsonResponse"
RAG_TOOL_INTENT_ATTRIBUTE = "core.rag.toolIntent"
CHAT_TOOLS_ATTRIBUTE = "core.chat.tools"
STREAM_CALLBACKS_ATTRIBUTE = "core.streamCallbacks"

DEFAULT_IMAGE_INSTRUCTION = "画像の内容を具体的かつ正確な日本語で説明してください。"


class Role(StrEnum):
    """メッセージの発話者の種別。"""

    USER = "USER"
    SYSTEM = "SYSTEM"
    ASSISTANT = "ASSISTANT"
    TOOL = "TOOL"


class OutputModeHint(StrEnum):
    """応答の出力形式のヒント。"""

    RETRIEVAL_ANSWER_JSON = "RETRIEVAL_ANSWER_JSON"
    PLAIN_ANSWER_TEXT = "PLAIN_ANSWER_TEXT"
    CHAT_TEXT = "CHAT_TEXT"


@dataclass(frozen=True)
class CoreMedia:
    """アダプタが用意した画像などのメディア。"""

    mime_type: str
    source_hint: str
    payload: bytes = field(default=b"", repr=False)
    filename: str | None = None

    def __post_init__(self) -> None:
        """mime_type・source_hint・filename の前後の空白を除いて正規化する。"""
        source_hint = (self.source_hint or "").strip()
        object.__setattr__(self, "mime_type", (self.mime_type or "").strip())
        object.__setattr__(self, "source_hint", source_hint)
        filename = source_hint if self.filename is None else self.filename
        object.__setattr__(self, "filename", filename.strip())


@dataclass(frozen=True)
class CoreMessage:
    """chat の 1 メッセージ。"""

    role: Role
    content: str = ""
    media_references: tuple[str, ...] = ()
    media: tuple[CoreMedia, ...] = ()

    @classmethod
    def user(cls, content: str, media: Sequence[CoreMedia] = ()) -> "CoreMessage":
        """ユーザー発話のメッセージを作る。

        Parameters
        ----------
        content : str
            本文。None 相当は空文字にする。
        media : Sequence[CoreMedia]
            添付メディア。

        Returns
        -------
        CoreMessage
            USER ロールのメッセージ。
        """
        return cls(
            Role.USER,
            content or "",
            tuple(m.source_hint for m in media),
            tuple(media),
        )

    @classmethod
    def system(cls, content: str) -> "CoreMessage":
        """システムメッセージを作る。

        Parameters
        ----------
        content : str
            本文。None 相当は空文字にする。

        Returns
        -------
        CoreMessage
            SYSTEM ロールのメッセージ。
        """
        return cls(Role.SYSTEM, content or "")

    @classmethod
    def assistant(cls, content: str) -> "CoreMessage":
        """アシスタント発話のメッセージを作る。

        Parameters
        ----------
        content : str
            本文。None 相当は空文字にする。

        Returns
        -------
        CoreMessage
            ASSISTANT ロールのメッセージ。
        """
        return cls(Role.ASSISTANT, content or "")


class CoreChatToolKind(StrEnum):
    """chat で使うツールの種別。"""

    WEB_SEARCH = "web_search"
    MCP = "mcp"


def _normalize_optional(value: str | None) -> str | None:
    """前後の空白を除き、空なら None にする。

    Parameters
    ----------
    value : str | None
        元の文字列。

    Returns
    -------
    str | None
        空白除去後の文字列。空なら None。
    """
    if value is None or not value.strip():
        return None
    return value.strip()


@dataclass(frozen=True)
class CoreChatTool:
    """chat に渡すツール（Web 検索・MCP）の指定。"""

    kind: CoreChatToolKind
    server_label: str | None = None
    server_url: str | None = None
    require_approval: str | None = None
    authorization: str | None = field(default=None, repr=False)
    headers: Mapping[str, str] = field(default_factory=dict, hash=False, repr=False)

    def __post_init__(self) -> None:
        """各項目を正規化し、headers を読み取り専用にする。"""
        object.__setattr__(self, "server_label", _normalize_optional(self.server_label))
        object.__setattr__(self, "server_url", _normalize_optional(self.server_url))
        object.__setattr__(
            self, "require_approval", _normalize_optional(self.require_approval)
        )
        object.__setattr__(
            self, "authorization", _normalize_optional(self.authorization)
        )
        normalized = {
            name.strip(): value.strip()
            for name, value in (self.headers or {}).items()
            if name is not None and value is not None
        }
        # 移植元は unmodifiableMap。変更できない読み取り専用にする
        object.__setattr__(self, "headers", MappingProxyType(normalized))

    @classmethod
    def web_search(cls) -> "CoreChatTool":
        """Web 検索ツールを作る。

        Returns
        -------
        CoreChatTool
            WEB_SEARCH 種別のツール。
        """
        return cls(CoreChatToolKind.WEB_SEARCH)

    @classmethod
    def mcp(
        cls,
        server_label: str | None,
        server_url: str | None,
        require_approval: str | None = None,
        authorization: str | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> "CoreChatTool":
        """MCP ツールを作る。

        Parameters
        ----------
        server_label : str | None
            MCP サーバーのラベル。
        server_url : str | None
            MCP サーバーの URL。
        require_approval : str | None
            承認要否の指定。
        authorization : str | None
            認証トークン。
        headers : Mapping[str, str] | None
            追加の HTTP ヘッダー。

        Returns
        -------
        CoreChatTool
            MCP 種別のツール。
        """
        return cls(
            CoreChatToolKind.MCP,
            server_label,
            server_url,
            require_approval,
            authorization,
            dict(headers or {}),
        )

    @property
    def wire_name(self) -> str:
        """プロバイダへ送るときのツール種別名。

        Returns
        -------
        str
            種別の値。
        """
        return self.kind.value

    @property
    def is_mcp(self) -> bool:
        """MCP ツールかどうか。

        Returns
        -------
        bool
            MCP 種別なら True。
        """
        return self.kind == CoreChatToolKind.MCP


def _normalize_text(value: str | None) -> str | None:
    """前後の空白を除き、空なら None にする。

    Parameters
    ----------
    value : str | None
        元の文字列。

    Returns
    -------
    str | None
        空白除去後の文字列。空なら None。
    """
    if value is None or not value.strip():
        return None
    return value.strip()


@dataclass(frozen=True)
class CoreGenerationOptions:
    """生成パラメータ（温度・最大トークン数など）。"""

    temperature: float | None = None
    top_p: float | None = None
    frequency_penalty: float | None = None
    presence_penalty: float | None = None
    max_tokens: int | None = None
    stop: str | None = None
    reasoning_effort: str | None = None
    verbosity: str | None = None

    def __post_init__(self) -> None:
        """文字列の項目の前後の空白を除き、空なら None にする。"""
        object.__setattr__(self, "stop", _normalize_text(self.stop))
        object.__setattr__(
            self, "reasoning_effort", _normalize_text(self.reasoning_effort)
        )
        object.__setattr__(self, "verbosity", _normalize_text(self.verbosity))

    @classmethod
    def empty(cls) -> "CoreGenerationOptions":
        """何も指定しない生成パラメータを作る。

        Returns
        -------
        CoreGenerationOptions
            すべて未指定のパラメータ。
        """
        return cls()

    def is_empty(self) -> bool:
        """何も指定されていないかどうか。

        Returns
        -------
        bool
            すべて未指定なら True。
        """
        return self == CoreGenerationOptions()


class CoreStreamCallbacks(Protocol):
    """ストリーミングの途中経過を受け取る（移植元 CoreStreamCallbacks）。"""

    def on_reasoning_delta(self, text: str) -> None:
        """推論テキストの差分を受け取る。

        Parameters
        ----------
        text : str
            差分のテキスト。
        """

    def on_library_title_delta(self, text: str) -> None:
        """ライブラリのタイトルの差分を受け取る。

        Parameters
        ----------
        text : str
            差分のテキスト。
        """

    def on_library_content_delta(self, text: str) -> None:
        """ライブラリの本文の差分を受け取る。

        Parameters
        ----------
        text : str
            差分のテキスト。
        """


class NoStreamCallbacks:
    """何もしないコールバック（移植元 CoreStreamCallbacks.none()）。"""

    def on_reasoning_delta(self, text: str) -> None:
        """何もしない。

        Parameters
        ----------
        text : str
            差分のテキスト（使わない）。
        """
        return

    def on_library_title_delta(self, text: str) -> None:
        """何もしない。

        Parameters
        ----------
        text : str
            差分のテキスト（使わない）。
        """
        return

    def on_library_content_delta(self, text: str) -> None:
        """何もしない。

        Parameters
        ----------
        text : str
            差分のテキスト（使わない）。
        """
        return


NO_STREAM_CALLBACKS = NoStreamCallbacks()


@dataclass(frozen=True)
class CoreChatRequest:
    """chat のリクエスト。"""

    provider_id: str
    network_setting: CoreNetworkSetting = field(
        default_factory=CoreNetworkSetting.defaults
    )
    output_mode_hint: OutputModeHint = OutputModeHint.RETRIEVAL_ANSWER_JSON
    messages: tuple[CoreMessage, ...] = ()
    attributes: Mapping[str, object] = field(default_factory=dict, hash=False)

    def __post_init__(self) -> None:
        """項目を正規化して検証する。

        Raises
        ------
        ValueError
            provider_id が空のとき。
        """
        if not self.provider_id or not self.provider_id.strip():
            raise ValueError("providerId must not be blank")
        object.__setattr__(self, "provider_id", self.provider_id.strip())
        object.__setattr__(self, "messages", tuple(self.messages))
        object.__setattr__(self, "attributes", dict(self.attributes))

    def last_user_text(self) -> str:
        """最後のユーザー発話の本文を返す。

        Returns
        -------
        str
            本文。ユーザー発話がなければ空文字。
        """
        for message in reversed(self.messages):
            if message.role == Role.USER:
                return message.content
        return ""

    def generation_options(self) -> CoreGenerationOptions:
        """属性から生成パラメータを取り出す。

        Returns
        -------
        CoreGenerationOptions
            指定された生成パラメータ。なければ空のもの。
        """
        value = self.attributes.get(GENERATION_OPTIONS_ATTRIBUTE)
        if isinstance(value, CoreGenerationOptions):
            return value
        return CoreGenerationOptions.empty()

    def rag_json_response_requested(self) -> bool:
        """RAG の JSON 応答が求められているかを返す。

        Returns
        -------
        bool
            求められていれば True。
        """
        return self.attributes.get(RAG_JSON_RESPONSE_ATTRIBUTE) is True

    def candidate_json_response_requested(self) -> bool:
        """候補の JSON 応答が求められているかを返す。

        Returns
        -------
        bool
            求められていれば True。
        """
        return self.attributes.get(CANDIDATE_JSON_RESPONSE_ATTRIBUTE) is True

    def rag_tool_intent(self) -> str:
        """属性から RAG のツール意図を取り出す。

        Returns
        -------
        str
            ツール意図。なければ空文字。
        """
        value = self.attributes.get(RAG_TOOL_INTENT_ATTRIBUTE)
        return value if isinstance(value, str) else ""

    def tools(self) -> list[CoreChatTool]:
        """属性から chat ツールの一覧を取り出す。

        Returns
        -------
        list[CoreChatTool]
            指定されたツール。なければ空のリスト。
        """
        value = self.attributes.get(CHAT_TOOLS_ATTRIBUTE)
        if isinstance(value, (list, tuple)):
            return [tool for tool in value if isinstance(tool, CoreChatTool)]
        return []

    def stream_callbacks(self) -> CoreStreamCallbacks:
        """属性からストリーミングのコールバックを取り出す。

        Returns
        -------
        CoreStreamCallbacks
            指定されたコールバック。なければ何もしないもの。
        """
        value = self.attributes.get(STREAM_CALLBACKS_ATTRIBUTE)
        if value is not None and hasattr(value, "on_reasoning_delta"):
            callbacks: CoreStreamCallbacks = value  # type: ignore[assignment]
            return callbacks
        return NO_STREAM_CALLBACKS

    def with_stream_callbacks(
        self, callbacks: CoreStreamCallbacks | None
    ) -> "CoreChatRequest":
        """コールバックを差し替えた新しいリクエストを返す。

        Parameters
        ----------
        callbacks : CoreStreamCallbacks | None
            新しいコールバック。None なら外す。

        Returns
        -------
        CoreChatRequest
            コールバックを差し替えたリクエスト。
        """
        attributes = dict(self.attributes)
        if callbacks is None or callbacks is NO_STREAM_CALLBACKS:
            attributes.pop(STREAM_CALLBACKS_ATTRIBUTE, None)
        else:
            attributes[STREAM_CALLBACKS_ATTRIBUTE] = callbacks
        return replace(self, attributes=attributes)

    def with_tools(self, tools: Sequence[CoreChatTool] | None) -> "CoreChatRequest":
        """ツールを差し替えた新しいリクエストを返す。

        Parameters
        ----------
        tools : Sequence[CoreChatTool] | None
            新しいツール。空なら外す。

        Returns
        -------
        CoreChatRequest
            ツールを差し替えたリクエスト。
        """
        attributes = dict(self.attributes)
        if not tools:
            attributes.pop(CHAT_TOOLS_ATTRIBUTE, None)
        else:
            attributes[CHAT_TOOLS_ATTRIBUTE] = list(tools)
        return replace(self, attributes=attributes)


class CoreChatRequestBuilder:
    """移植元 CoreChatRequest.Builder。"""

    def __init__(self, provider_id: str) -> None:
        """プロバイダ ID を指定してビルダーを作る。

        Parameters
        ----------
        provider_id : str
            プロバイダ ID。
        """
        self._provider_id = provider_id
        self._network_setting = CoreNetworkSetting.defaults()
        self._output_mode_hint = OutputModeHint.RETRIEVAL_ANSWER_JSON
        self._messages: list[CoreMessage] = []
        self._attributes: dict[str, object] = {}

    def network_setting(self, value: CoreNetworkSetting) -> "CoreChatRequestBuilder":
        """ネットワーク設定を指定する。

        Parameters
        ----------
        value : CoreNetworkSetting
            ネットワーク設定。

        Returns
        -------
        CoreChatRequestBuilder
            このビルダー。
        """
        self._network_setting = value
        return self

    def output_mode_hint(self, value: OutputModeHint) -> "CoreChatRequestBuilder":
        """出力形式のヒントを指定する。

        Parameters
        ----------
        value : OutputModeHint
            出力形式のヒント。

        Returns
        -------
        CoreChatRequestBuilder
            このビルダー。
        """
        self._output_mode_hint = value
        return self

    def messages(
        self, messages: Sequence[CoreMessage] | None
    ) -> "CoreChatRequestBuilder":
        """メッセージ一覧を丸ごと指定する。

        Parameters
        ----------
        messages : Sequence[CoreMessage] | None
            メッセージ一覧。None は空にする。

        Returns
        -------
        CoreChatRequestBuilder
            このビルダー。
        """
        self._messages = list(messages or [])
        return self

    def add_message(self, message: CoreMessage) -> "CoreChatRequestBuilder":
        """メッセージを末尾に追加する。

        Parameters
        ----------
        message : CoreMessage
            追加するメッセージ。

        Returns
        -------
        CoreChatRequestBuilder
            このビルダー。
        """
        self._messages.append(message)
        return self

    def tools(self, tools: Sequence[CoreChatTool] | None) -> "CoreChatRequestBuilder":
        """chat ツールを指定する。

        Parameters
        ----------
        tools : Sequence[CoreChatTool] | None
            ツール。空なら外す。

        Returns
        -------
        CoreChatRequestBuilder
            このビルダー。
        """
        if not tools:
            self._attributes.pop(CHAT_TOOLS_ATTRIBUTE, None)
        else:
            self._attributes[CHAT_TOOLS_ATTRIBUTE] = list(tools)
        return self

    def attribute(self, key: str, value: object | None) -> "CoreChatRequestBuilder":
        """属性を設定する。

        Parameters
        ----------
        key : str
            属性名。
        value : object | None
            属性値。None なら属性を外す。

        Returns
        -------
        CoreChatRequestBuilder
            このビルダー。

        Raises
        ------
        ValueError
            key が空のとき。
        """
        if not key or not key.strip():
            raise ValueError("attribute key must not be blank")
        if value is None:
            self._attributes.pop(key, None)
        else:
            self._attributes[key] = value
        return self

    def candidate_json_response(self, requested: bool) -> "CoreChatRequestBuilder":
        """候補の JSON 応答を求めるかを指定する。

        Parameters
        ----------
        requested : bool
            求めるなら True。

        Returns
        -------
        CoreChatRequestBuilder
            このビルダー。
        """
        return self.attribute(
            CANDIDATE_JSON_RESPONSE_ATTRIBUTE, True if requested else None
        )

    def build(self) -> CoreChatRequest:
        """リクエストを組み立てる。

        Returns
        -------
        CoreChatRequest
            組み立てたリクエスト。
        """
        return CoreChatRequest(
            self._provider_id,
            self._network_setting,
            self._output_mode_hint,
            tuple(self._messages),
            dict(self._attributes),
        )


@dataclass(frozen=True)
class CoreRagContext:
    """RAG に渡すコンテキスト 1 件。"""

    path: str
    content: str = ""
    references: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        """項目を正規化して検証する。

        Raises
        ------
        ValueError
            path が空のとき。
        """
        if not self.path or not self.path.strip():
            raise ValueError("path must not be blank")
        object.__setattr__(self, "path", self.path.strip())
        object.__setattr__(self, "content", self.content or "")
        object.__setattr__(self, "references", tuple(self.references))


@dataclass(frozen=True)
class CoreRagRequest:
    """RAG のリクエスト。"""

    chat_request: CoreChatRequest
    contexts: tuple[CoreRagContext, ...] = ()

    def __post_init__(self) -> None:
        """contexts を tuple にそろえる。"""
        object.__setattr__(self, "contexts", tuple(self.contexts))


@dataclass(frozen=True)
class CoreChatResult:
    """chat・RAG の結果。"""

    answer: str = ""
    references: tuple[str, ...] = ()
    reference_ids: tuple[int, ...] = ()
    output_mode_hint: OutputModeHint = OutputModeHint.RETRIEVAL_ANSWER_JSON
    failure: CoreFailure | None = None
    answer_present: bool = True

    def __post_init__(self) -> None:
        """失敗ありの結果は、回答ありにならないようにする。"""
        if self.failure is not None and self.answer_present:
            object.__setattr__(self, "answer_present", False)

    @classmethod
    def success(
        cls,
        answer: str,
        references: Sequence[str],
        output_mode_hint: OutputModeHint,
        reference_ids: Sequence[int] = (),
    ) -> "CoreChatResult":
        """成功の結果を作る。

        Parameters
        ----------
        answer : str
            回答。None 相当は空文字にする。
        references : Sequence[str]
            参照元。
        output_mode_hint : OutputModeHint
            出力形式のヒント。
        reference_ids : Sequence[int]
            参照 ID。

        Returns
        -------
        CoreChatResult
            回答ありの結果。
        """
        return cls(
            answer or "",
            tuple(references),
            tuple(reference_ids),
            output_mode_hint,
            None,
            True,
        )

    @classmethod
    def no_answer(cls, output_mode_hint: OutputModeHint) -> "CoreChatResult":
        """回答なしの結果を作る。

        Parameters
        ----------
        output_mode_hint : OutputModeHint
            出力形式のヒント。

        Returns
        -------
        CoreChatResult
            回答なしの結果。
        """
        return cls("", (), (), output_mode_hint, None, False)

    @classmethod
    def from_failure(
        cls, failure: CoreFailure, output_mode_hint: OutputModeHint
    ) -> "CoreChatResult":
        """失敗の結果を作る。

        Parameters
        ----------
        failure : CoreFailure
            失敗の内容。
        output_mode_hint : OutputModeHint
            出力形式のヒント。

        Returns
        -------
        CoreChatResult
            失敗を持つ結果。
        """
        return cls("", (), (), output_mode_hint, failure, False)


@dataclass(frozen=True)
class CoreImageExplanationResult:
    """画像説明の結果。"""

    explanation: str = ""
    failure: CoreFailure | None = None
    explanation_present: bool = True

    @classmethod
    def success(cls, explanation: str) -> "CoreImageExplanationResult":
        """成功の結果を作る。

        Parameters
        ----------
        explanation : str
            説明文。None 相当は空文字にする。

        Returns
        -------
        CoreImageExplanationResult
            説明ありの結果。
        """
        return cls(explanation or "", None, True)

    @classmethod
    def from_failure(cls, failure: CoreFailure) -> "CoreImageExplanationResult":
        """失敗の結果を作る。

        Parameters
        ----------
        failure : CoreFailure
            失敗の内容。

        Returns
        -------
        CoreImageExplanationResult
            失敗を持つ結果。
        """
        return cls("", failure, False)

    @classmethod
    def from_chat_result(
        cls, result: CoreChatResult | None
    ) -> "CoreImageExplanationResult":
        """chat の結果から画像説明の結果を作る。

        Parameters
        ----------
        result : CoreChatResult | None
            chat の結果。

        Returns
        -------
        CoreImageExplanationResult
            変換した結果。result が None のときは失敗の結果。
        """
        if result is None:
            return cls.from_failure(
                CoreFailure.of(
                    "IMAGE_EXPLANATION_PROVIDER_FAILURE",
                    "chat result must not be null",
                )
            )
        if result.failure is not None:
            return cls.from_failure(result.failure)
        if not result.answer_present:
            return cls("", None, False)
        return cls.success(result.answer)


@dataclass(frozen=True)
class CoreImageExplanationRequest:
    """画像説明のリクエスト。"""

    provider_id: str
    network_setting: CoreNetworkSetting = field(
        default_factory=CoreNetworkSetting.defaults
    )
    instruction: str = ""
    context: str = ""
    media: tuple[CoreMedia, ...] = ()
    generation_options: CoreGenerationOptions = field(
        default_factory=CoreGenerationOptions.empty
    )

    def __post_init__(self) -> None:
        """項目を正規化して検証する。

        Raises
        ------
        ValueError
            provider_id が空のとき。
        """
        if not self.provider_id or not self.provider_id.strip():
            raise ValueError("providerId must not be blank")
        object.__setattr__(self, "provider_id", self.provider_id.strip())
        object.__setattr__(self, "instruction", (self.instruction or "").strip())
        object.__setattr__(self, "context", (self.context or "").strip())
        object.__setattr__(self, "media", tuple(self.media))

    def to_chat_request(self) -> CoreChatRequest:
        """chat のリクエストに変換する。

        Returns
        -------
        CoreChatRequest
            画像つきのユーザー発話を持つリクエスト。
        """
        builder = (
            CoreChatRequestBuilder(self.provider_id)
            .network_setting(self.network_setting)
            .output_mode_hint(OutputModeHint.CHAT_TEXT)
            .add_message(CoreMessage.user(self._prompt_text(), self.media))
        )
        if not self.generation_options.is_empty():
            builder.attribute(GENERATION_OPTIONS_ATTRIBUTE, self.generation_options)
        return builder.build()

    def _prompt_text(self) -> str:
        """指示とコンテキストから送信するプロンプトを作る。

        Returns
        -------
        str
            プロンプトの本文。
        """
        base = self.instruction or DEFAULT_IMAGE_INSTRUCTION
        if not self.context:
            return base
        # 移植元は System.lineSeparator() を使う。動かす OS の改行に合わせる
        return f"{base}{os.linesep}Context:{os.linesep}{self.context}"
