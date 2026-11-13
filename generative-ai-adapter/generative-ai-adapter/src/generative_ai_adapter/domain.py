"""アダプタの値オブジェクト（移植元 domain パッケージ）。"""

import json
from dataclasses import dataclass, field, replace
from typing import Any

from generative_ai_adapter.constants import ReasoningEffort, Verbosity

DEFAULT_TIMEOUT_SECONDS = 180
ROLE_USER = "user"
ROLE_SYSTEM = "system"
ROLE_ASSISTANT = "assistant"
_ROLE_BY_INDEX = {0: ROLE_USER, 1: ROLE_SYSTEM, 2: ROLE_ASSISTANT}
RAG_INPUT_PREFIX = "RAG入力不足"


@dataclass
class AccessCredential:
    """接続先・資格情報（移植元 AccessCredential）。"""

    url: str | None = None
    test_url: str | None = None
    api_key: str | None = field(default=None, repr=False)
    secuaigent_access_token: str | None = field(default=None, repr=False)
    model_name: str | None = None
    vendor_name: str | None = None
    tenant_id: str | None = None
    secuaigent_stream_file_path: str | None = None
    embedding_dimensions: int | None = None
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS
    secuaigent_message_id: str | None = None
    secuaigent_additional_prompt: str | None = None
    secuaigent_create_library: bool | None = None

    def copy(self) -> "AccessCredential":
        """浅いコピーを作る。

        Returns
        -------
        AccessCredential
            同じ値を持つ新しいインスタンス。
        """
        return replace(self)


@dataclass
class ChatGPTParameter:
    """ChatGPT 系 API のサンプリング・出力に関するパラメータ。"""

    temperature: float | None = None
    top_p: float | None = None
    frequency_penalty: float | None = None
    presence_penalty: float | None = None
    max_tokens: int | None = None
    stop: str | None = None
    reasoning_effort: ReasoningEffort | None = ReasoningEffort.MEDIUM
    verbosity: Verbosity | None = Verbosity.MEDIUM


@dataclass
class ProxySetting:
    """プロキシの接続設定。"""

    use_proxy: int = 0
    proxy_host: str | None = None
    proxy_port: int = 0
    use_proxy_cred: bool = False
    proxy_id: str | None = None
    proxy_pass: str | None = field(default=None, repr=False)
    insecure_ssl_enabled: bool = False


@dataclass
class Message:
    """メッセージ（移植元 Message）。

    画像の添付は `image_resource`（バイト列）と `mime_type` で持つ。JSON にするときは
    移植元（Gson）と同じく None の項目を出さない。
    """

    role: str | None
    content: str | None
    image_resource: bytes | None = field(default=None, repr=False)
    mime_type: str | None = None

    @classmethod
    def of_index(
        cls,
        role: int,
        content: str | None,
        image_resource: bytes | None = None,
        mime_type: str | None = None,
    ) -> "Message":
        """ロールを番号で受け取って作る。

        0=user、1=system、2=assistant、それ以外は user とする。

        Parameters
        ----------
        role : int
            ロールの番号。
        content : str | None
            メッセージ本文。
        image_resource : bytes | None
            添付画像のバイト列。
        mime_type : str | None
            添付画像の MIME タイプ。

        Returns
        -------
        Message
            作成したメッセージ。
        """
        return cls(
            _ROLE_BY_INDEX.get(role, ROLE_USER),
            content,
            image_resource,
            mime_type,
        )

    @classmethod
    def context(cls, role: int, file_path: str, content: str, count: int) -> "Message":
        """RAG のコンテキスト 1 件（File ID・FileName・Content の囲み）を作る。

        Parameters
        ----------
        role : int
            ロールの番号。
        file_path : str
            コンテキストの元ファイルのパス。
        content : str
            コンテキストの本文。
        count : int
            コンテキストの通し番号（File ID）。

        Returns
        -------
        Message
            囲み形式の本文を持つメッセージ。
        """
        text = (
            f'"""\n## File ID\n  {count} \n## FileName\n{file_path} \n'
            f'## Content\n{content}\n"""'
        )
        return cls.of_index(role, text)

    @property
    def text(self) -> str | None:
        """本文（`content` の別名）。

        Returns
        -------
        str | None
            メッセージ本文。
        """
        return self.content

    def to_json_dict(self) -> dict[str, Any]:
        """JSON 用の辞書にする。None の項目は含めない。

        Returns
        -------
        dict[str, Any]
            role と content のうち値のあるもの。
        """
        return {
            key: value
            for key, value in (("role", self.role), ("content", self.content))
            if value is not None
        }


@dataclass(frozen=True)
class ImageExplanation:
    """画像の説明（種別・キャプション・出典のヒント）。"""

    type: int  # 1: 埋め込み画像, 2: ページ全体
    caption: str
    source_hint: str

    def to_json_dict(self) -> dict[str, Any]:
        """JSON 用の辞書にする。

        Returns
        -------
        dict[str, Any]
            移植元と同じ項目名の辞書。
        """
        return {
            "type": self.type,
            "caption": self.caption,
            "sourceHint": self.source_hint,
        }


@dataclass
class FileData:
    """読み込んだファイルの内容（テキスト・画像・画像の説明）。"""

    text: str | None = None
    image_resource: bytes | None = field(default=None, repr=False)
    mime_type: str | None = None
    image_explanations: list[ImageExplanation] = field(default_factory=list)


@dataclass
class RetrievalContext:
    """検索で得た RAG のコンテキスト 1 件。"""

    context: str | None = ""
    path: str | None = ""
    file_name: str | None = ""

    def is_filled(self) -> bool:
        """本文・パス・ファイル名がすべて埋まっているか判定する。

        Returns
        -------
        bool
            すべて None でも空でもなければ True。
        """
        if self.context is None or self.path is None or self.file_name is None:
            return False
        return bool(self.context) and bool(self.path) and bool(self.file_name)


@dataclass
class RetrievalAnswer:
    """出力の JSON（移植元 RetrievalAnswer）。

    `image_explanations` が None なら JSON から省く（移植元は Gson が null を出さない）。
    """

    answer: str | None = ""
    filepaths: list[str] | None = field(default_factory=list)
    references: list[Message] | None = field(default_factory=list)
    image_explanations: list[ImageExplanation] | None = field(default_factory=list)

    def add_filepath(self, filepath: str | None) -> None:
        """参照ファイルのパスを追加する。

        Parameters
        ----------
        filepath : str | None
            追加するパス。None なら何もしない。
        """
        if self.filepaths is None:
            self.filepaths = []
        if filepath is not None:
            self.filepaths.append(filepath)

    def add_reference(self, reference: Message) -> None:
        """参照メッセージを追加する。

        Parameters
        ----------
        reference : Message
            追加する参照。
        """
        if self.references is None:
            self.references = []
        self.references.append(reference)

    def add_image_explanation(self, explanation: ImageExplanation) -> None:
        """画像の説明を追加する。

        Parameters
        ----------
        explanation : ImageExplanation
            追加する説明。
        """
        if self.image_explanations is None:
            self.image_explanations = []
        self.image_explanations.append(explanation)

    def to_json(self) -> str:
        """移植元の Gson と同じ項目名・順序の 1 行の JSON にする。

        Returns
        -------
        str
            1 行の JSON 文字列。
        """
        body: dict[str, Any] = {}
        if self.answer is not None:
            body["answer"] = self.answer
        if self.filepaths is not None:
            body["filepaths"] = list(self.filepaths)
        if self.references is not None:
            body["references"] = [r.to_json_dict() for r in self.references]
        if self.image_explanations is not None:
            body["imageExplanations"] = [
                e.to_json_dict() for e in self.image_explanations
            ]
        return json.dumps(body, ensure_ascii=False, separators=(",", ":"))


class RagInputDeficiency:
    """RAG の入力不足・回答の参照 ID の不整合（移植元 RagInputDeficiency）。"""

    def __init__(self, message: str) -> None:
        """メッセージを指定して作る。

        Parameters
        ----------
        message : str
            入力不足の内容を表すメッセージ。
        """
        self.message = message

    @classmethod
    def answer_reference_out_of_range(
        cls, reference_id: int, min_id: int, max_id: int
    ) -> "RagInputDeficiency":
        """回答の参照 ID が範囲外のときの入力不足を作る。

        Parameters
        ----------
        reference_id : int
            回答が参照した ID。
        min_id : int
            有効な ID の最小値。
        max_id : int
            有効な ID の最大値。

        Returns
        -------
        RagInputDeficiency
            範囲外の参照を説明する入力不足。
        """
        return cls(
            "RAG回答参照ID不整合: 回答が存在しないコンテキストIDを参照しました。"
            f"id={reference_id}, valid range={min_id}-{max_id}。"
        )

    @classmethod
    def builder(cls) -> "RagInputDeficiencyBuilder":
        """入力不足の組み立て用ビルダーを作る。

        Returns
        -------
        RagInputDeficiencyBuilder
            空のビルダー。
        """
        return RagInputDeficiencyBuilder()


class RagInputDeficiencyBuilder:
    """RAG の入力不足の理由を集めて `RagInputDeficiency` を組み立てる。"""

    def __init__(self) -> None:
        """理由が空の状態で作る。"""
        self._reasons: list[str] = []

    def add(self, reason: str | None) -> "RagInputDeficiencyBuilder":
        """理由を追加する。

        Parameters
        ----------
        reason : str | None
            追加する理由。None や空白だけなら無視する。

        Returns
        -------
        RagInputDeficiencyBuilder
            メソッドチェーン用の自身。
        """
        if reason is not None and reason.strip():
            self._reasons.append(reason)
        return self

    def missing_user_question(self) -> "RagInputDeficiencyBuilder":
        """ユーザー質問が空であることを理由に追加する。

        Returns
        -------
        RagInputDeficiencyBuilder
            メソッドチェーン用の自身。
        """
        return self.add("ユーザー質問(index=0)が空です")

    def missing_context_body(self) -> "RagInputDeficiencyBuilder":
        """コンテキスト本文が空であることを理由に追加する。

        Returns
        -------
        RagInputDeficiencyBuilder
            メソッドチェーン用の自身。
        """
        return self.add("コンテキスト本文(index=5)が空です")

    def missing_context_path(self) -> "RagInputDeficiencyBuilder":
        """コンテキストパスが空であることを理由に追加する。

        Returns
        -------
        RagInputDeficiencyBuilder
            メソッドチェーン用の自身。
        """
        return self.add("コンテキストパス(index=3)が空です")

    def missing_context_file_name(self) -> "RagInputDeficiencyBuilder":
        """ファイル名をパスから導出できないことを理由に追加する。

        Returns
        -------
        RagInputDeficiencyBuilder
            メソッドチェーン用の自身。
        """
        return self.add("コンテキストファイル名(index=3)をパスから導出できません")

    def missing_messages(self) -> "RagInputDeficiencyBuilder":
        """メッセージがないことを理由に追加する。

        Returns
        -------
        RagInputDeficiencyBuilder
            メソッドチェーン用の自身。
        """
        return self.add("メッセージ(system prompt/history)がありません")

    def missing_request_schema(self) -> "RagInputDeficiencyBuilder":
        """request schema がないことを理由に追加する。

        Returns
        -------
        RagInputDeficiencyBuilder
            メソッドチェーン用の自身。
        """
        return self.add("request schema がありません")

    def build_or_none(self) -> RagInputDeficiency | None:
        """集めた理由から入力不足を作る。

        Returns
        -------
        RagInputDeficiency | None
            理由が 1 件もなければ None。重複は除く。
        """
        if not self._reasons:
            return None
        unique = list(dict.fromkeys(self._reasons))
        return RagInputDeficiency(f"{RAG_INPUT_PREFIX}: {' / '.join(unique)}。")


def submit_question_function() -> dict[str, Any]:
    """RAG で付ける submit_question ツールの定義を作る（移植元 FunctionConstants）。

    Returns
    -------
    dict[str, Any]
        function calling 用のツール定義。
    """
    return {
        "type": "function",
        "function": {
            "name": "submit_question",
            "required": {
                "required": ["question", "answer", "id", "title", "could_not_answer"]
            },
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "A unique identifier for the question",
                    },
                    "title": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "The title of the question",
                    },
                    "answer": {
                        "type": "string",
                        "description": "The answer to the question",
                    },
                    "question": {
                        "type": "string",
                        "description": "The question to be submitted",
                    },
                    "could_not_answer": {
                        "type": "boolean",
                        "description": "Whether the question could not be answered",
                    },
                },
            },
            "description": "Submit a question and its answer along with an ID and title",
        },
    }


@dataclass
class RequestSchema:
    """LLM へのリクエストの組み立て途中の値（移植元 RequestSchema）。"""

    model: str | None = None
    messages: list[Message] | None = None
    temperature: float | None = None
    top_p: float | None = None
    frequency_penalty: float | None = None
    presence_penalty: float | None = None
    max_tokens: int | None = None
    stop: str | None = None
    response_format: dict[str, Any] | None = None
    tools: list[dict[str, Any]] | None = None
    tool_choice: dict[str, Any] | None = None
    retrieval_contexts: list[RetrievalContext] | None = None
    user_question: str | None = None
    rag_input_deficiency: RagInputDeficiency | None = None
    image_explanations: list[ImageExplanation] | None = None
    reasoning_effort: ReasoningEffort | None = None
    verbosity: Verbosity | None = None

    @classmethod
    def with_parameter(
        cls, model: str | None, parameter: ChatGPTParameter
    ) -> "RequestSchema":
        """モデル名とパラメータから作る。

        Parameters
        ----------
        model : str | None
            モデル名。
        parameter : ChatGPTParameter
            設定するパラメータ。

        Returns
        -------
        RequestSchema
            パラメータを設定済みのリクエスト。
        """
        schema = cls(model=model)
        schema.set_chat_gpt_parameter(parameter)
        return schema

    def set_chat_gpt_parameter(self, parameter: ChatGPTParameter) -> None:
        """パラメータを設定する。

        None の項目は上書きしない（推論の深さ・詳細度だけは常に上書き）。

        Parameters
        ----------
        parameter : ChatGPTParameter
            設定するパラメータ。
        """
        if parameter.temperature is not None:
            self.temperature = parameter.temperature
        if parameter.top_p is not None:
            self.top_p = parameter.top_p
        if parameter.frequency_penalty is not None:
            self.frequency_penalty = parameter.frequency_penalty
        if parameter.presence_penalty is not None:
            self.presence_penalty = parameter.presence_penalty
        if parameter.max_tokens is not None:
            self.max_tokens = parameter.max_tokens
        if parameter.stop is not None:
            self.stop = parameter.stop
        self.reasoning_effort = parameter.reasoning_effort
        self.verbosity = parameter.verbosity

    def add_message(self, message: Message) -> None:
        """メッセージを末尾に追加する。

        Parameters
        ----------
        message : Message
            追加するメッセージ。
        """
        if self.messages is None:
            self.messages = []
        self.messages.append(message)

    def clear_message(self) -> None:
        """メッセージを消す。"""
        self.messages = None

    def set_response_json(self) -> None:
        """応答形式を JSON オブジェクトにする。"""
        self.response_format = {"type": "json_object"}

    def clear_response_format(self) -> None:
        """応答形式の指定を消す。"""
        self.response_format = None

    def clear_tools(self) -> None:
        """ツールとツールの選択指定を消す。"""
        self.tools = None
        self.clear_tool_choice()

    def add_tool(self, tool: dict[str, Any]) -> None:
        """ツールを追加する。

        Parameters
        ----------
        tool : dict[str, Any]
            追加するツールの定義。
        """
        if self.tools is None:
            self.tools = []
        self.tools.append(tool)

    def add_submit_question_tool(self) -> None:
        """submit_question ツールを追加し、それを必ず呼ぶよう指定する。"""
        self.add_tool(submit_question_function())
        self.tool_choice = {"type": "function", "function": {"name": "submit_question"}}

    def clear_tool_choice(self) -> None:
        """ツールの選択指定を消す。"""
        self.tool_choice = None
