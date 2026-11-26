"""LLM チャットのサービスが共通で使う、小さな純粋関数と定数。

`message_service` と `llm_chat_service` は「service が別の service を呼ばない」規約のため、
共通の部分をここに置く。
"""

from app.core.llm_client import ChatMessage
from app.core.llm_client import ToolConfig as CoreToolConfig
from app.schemas.message import ToolConfig as SchemaToolConfig
from app.schemas.response_format import ResponseFormatRequest

# responseFormat指定時にメッセージ列の先頭へ前置する固定指示文。移植元Java版
# `OpenAiLlmChatAdapter`に対応する。OpenAIのJSONモードは、メッセージ内に"json"という
# 語を含めることが要件のため、この指示文の前置が必須となる。
JSON_RESPONSE_INSTRUCTION = "回答は JSON 形式で出力してください。"

# ライブラリ生成用固定システムプロンプトの種別キー(system_prompt_templates.type)。
LIBRARY_PROMPT_TYPE = "LIBRARY"

# タイトルの最大長。移植元`LibraryEntity`のカラム定義(255文字)に合わせて切り詰める。
LIBRARY_TITLE_MAX_LENGTH = 255


def build_llm_response_format(
    response_format: ResponseFormatRequest | None,
) -> dict | None:
    """responseFormat指定をAzure OpenAI呼び出し用のresponse_format辞書へ変換する。

    移植元同様、typeの値(json_object/json_schema)によらず常にJSONモード
    (`{"type": "json_object"}`)として扱う。json_schemaによる構造強制は移植元でも
    未実装のため踏襲しない（`docs/issue-100/01_要件定義.md`参照）。

    Parameters
    ----------
    response_format : ResponseFormatRequest | None
        リクエストのresponseFormat指定。

    Returns
    -------
    dict | None
        Azure OpenAI呼び出し用のresponse_format辞書。未指定の場合はNone。
    """
    if response_format is None:
        return None
    return {"type": "json_object"}


def prepend_json_response_instruction(
    messages: list[ChatMessage], response_format: ResponseFormatRequest | None
) -> list[ChatMessage]:
    """responseFormat指定時、JSON出力を促すsystemメッセージを先頭に追加する。

    Parameters
    ----------
    messages : list[ChatMessage]
        会話履歴。
    response_format : ResponseFormatRequest | None
        リクエストのresponseFormat指定。未指定なら何もしない。

    Returns
    -------
    list[ChatMessage]
        指示文を前置した会話履歴。
    """
    if response_format is None:
        return messages
    return [ChatMessage(role="system", content=JSON_RESPONSE_INSTRUCTION), *messages]


def to_core_tool_configs(
    tools: list[SchemaToolConfig] | None,
) -> list[CoreToolConfig] | None:
    """リクエストスキーマの`ToolConfig`をLLM呼び出しクライアント用の`ToolConfig`へ変換する。

    Parameters
    ----------
    tools : list[SchemaToolConfig] | None
        リクエストで指定されたツール設定一覧。

    Returns
    -------
    list[CoreToolConfig] | None
        LLM呼び出しクライアント用のツール設定一覧。`tools`が空またはNoneの場合はNone。
    """
    if not tools:
        return None
    return [
        CoreToolConfig(
            name=tool.name,
            server_label=tool.server_label,
            server_url=tool.server_url,
            require_approval=tool.require_approval,
            authorization=tool.authorization,
            headers=tool.headers,
            allowed_tools=tool.allowed_tools,
        )
        for tool in tools
    ]
