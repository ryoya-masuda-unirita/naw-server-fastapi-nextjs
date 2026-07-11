"""LLMチャットAPI(SSEストリーミング応答)のビジネスロジック。

移植元(Spring Boot)の`LlmChatService`に対応する。添付ファイル(`attachmentFiles`)は
issue-97で、tools（web_search/mcp）はissue-98で、ライブラリ生成（createLibrary）は
issue-99で、response_formatはissue-100で対応済み（`docs/issue-100/01_要件定義.md`参照）。
"""

import json
import logging
from collections.abc import AsyncIterator
from uuid import UUID

from fastapi import HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.attachment_media import build_user_content
from app.core.config import LlmCreditSettings, get_llm_credit_settings
from app.core.credit_quota import enforce_within_quota
from app.core.database import get_session_maker
from app.core.library_stream_router import (
    DEFAULT_LIBRARY_TITLE,
    LIBRARY_USER_INSTRUCTION_PREFIX,
    LibraryStreamRouter,
)
from app.core.llm_client import AzureLlmChatClient, ChatMessage
from app.core.llm_client import ToolConfig as CoreToolConfig
from app.core.room_access import require_owned_room
from app.core.token_usage_credit import (
    input_credits,
    output_credits,
    positive_token_weight,
)
from app.models.ai_model import AIModelEndpointType
from app.models.library import Library
from app.models.tenant_endpoint import EndpointType
from app.models.token_usage import TokenUsage
from app.models.user import User
from app.repositories.ai_model_repository import AIModelRepository
from app.repositories.library_repository import LibraryRepository
from app.repositories.message_repository import MessageRepository
from app.repositories.system_prompt_template_repository import (
    SystemPromptTemplateRepository,
)
from app.repositories.tenant_endpoint_repository import TenantEndpointRepository
from app.schemas.attachment import AttachmentFile
from app.schemas.llm import LlmChatRequest
from app.schemas.message import ToolConfig as SchemaToolConfig
from app.schemas.response_format import ResponseFormatRequest

logger = logging.getLogger(__name__)

# responseFormat指定時にメッセージ列の先頭へ前置する固定指示文。移植元Java版
# `OpenAiLlmChatAdapter`に対応する。OpenAIのJSONモードは、メッセージ内に"json"という
# 語を含めることが要件のため、この指示文の前置が必須となる。
_JSON_RESPONSE_INSTRUCTION = "回答は JSON 形式で出力してください。"

# ライブラリ生成用固定システムプロンプトの種別キー(system_prompt_templates.type)。
_LIBRARY_PROMPT_TYPE = "LIBRARY"

# タイトルの最大長。移植元`LibraryEntity`のカラム定義(255文字)に合わせて切り詰める。
_LIBRARY_TITLE_MAX_LENGTH = 255


def _sse(event: str, data: dict) -> bytes:
    """SSE(Server-Sent Events)形式の1イベントを組み立てる。

    Args:
        event: イベント名。
        data: イベントデータ(JSONへ変換される)。

    Returns:
        SSE形式にエンコードされたバイト列。
    """
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode()


def _build_llm_response_format(
    response_format: ResponseFormatRequest | None,
) -> dict | None:
    """responseFormat指定をAzure OpenAI呼び出し用のresponse_format辞書へ変換する。

    移植元同様、typeの値(json_object/json_schema)によらず常にJSONモード
    (`{"type": "json_object"}`)として扱う。json_schemaによる構造強制は移植元でも
    未実装のため踏襲しない（`docs/issue-100/01_要件定義.md`参照）。

    Args:
        response_format: リクエストのresponseFormat指定。

    Returns:
        Azure OpenAI呼び出し用のresponse_format辞書。未指定の場合はNone。
    """
    if response_format is None:
        return None
    return {"type": "json_object"}


def _prepend_json_response_instruction(
    messages: list[ChatMessage], response_format: ResponseFormatRequest | None
) -> list[ChatMessage]:
    """responseFormat指定時、JSON出力を促すsystemメッセージを先頭に追加する。

    Args:
        messages: 会話履歴。
        response_format: リクエストのresponseFormat指定。未指定なら何もしない。

    Returns:
        指示文を前置した会話履歴。
    """
    if response_format is None:
        return messages
    return [ChatMessage(role="system", content=_JSON_RESPONSE_INSTRUCTION), *messages]


def _to_core_tool_configs(
    tools: list[SchemaToolConfig] | None,
) -> list[CoreToolConfig] | None:
    """リクエストスキーマの`ToolConfig`をLLM呼び出しクライアント用の`ToolConfig`へ変換する。

    Args:
        tools: リクエストで指定されたツール設定一覧。

    Returns:
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


class LlmChatService:
    @staticmethod
    async def stream_chat(
        tenant_id: str,
        current_user: User,
        req: LlmChatRequest,
        session: AsyncSession,
    ) -> StreamingResponse:
        """LLMチャットを呼び出し、応答をSSEでストリーミング返却する。

        クレジット上限チェック・AIModel/TenantEndpoint解決・messageId解決は、
        ここで注入された`session`を使い、ストリーミング開始前に行う。ストリーミング
        完了後のトークン使用量永続化は、`session`のライフサイクル
        （StreamingResponse返却後にリクエストのDIスコープが終了しうる）とは独立させる
        必要があるため、新規セッションで行う。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            req: チャットリクエスト。
            session: 非同期DBセッション（呼び出し前のDB検証にのみ使用する）。

        Returns:
            `text/event-stream`のストリーミングレスポンス。

        Raises:
            HTTPException: クレジット上限超過時は429、指定deployNameのAIモデルが
                存在しない・テナントにAzure OpenAI Chatエンドポイントが存在しない・
                createLibrary=trueなのにmessageId未指定の場合は400、指定messageIdが
                テナント内に存在しない場合は404、所属ルームの所有者でない場合は403を返す。
        """
        if req.createLibrary and not req.messageId:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="ライブラリを生成するには、保存先のメッセージ ID（messageId）を指定してください。",
            )

        await enforce_within_quota(tenant_id, session)

        ai_model = await AIModelRepository.find_by_endpoint_type_and_name(
            AIModelEndpointType.AZURE_OPENAI_CHAT, req.deployName, session
        )
        if ai_model is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"指定された deployName の AI モデルが見つかりません: {req.deployName}",
            )

        endpoints = await TenantEndpointRepository.find_by_tenant_id_and_type(
            tenant_id, EndpointType.AZURE_OPENAI_CHAT, session
        )
        if not endpoints:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="チャット用のテナントエンドポイントが見つかりません。",
            )
        # 複数存在する場合は移植元同様にidが最小のものを採用する。
        tenant_endpoint = min(endpoints, key=lambda endpoint: endpoint.id)

        room_id: str | None = None
        message_id_for_usage: str | None = None
        if req.messageId:
            message = await MessageRepository.find_by_tenant_id_and_id(
                tenant_id, req.messageId, session
            )
            if message is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="指定された messageId のメッセージが見つかりません。",
                )
            # 移植元Java版はここでルーム所有権を検証していないが、他の
            # メッセージ関連エンドポイント（message_service.py等）と同様に
            # 所有権のないメッセージIDが指定された場合のなりすまし・情報漏えいを
            # 防ぐため、本ポートでは所有権チェックを追加する（`01_要件定義.md`参照）。
            await require_owned_room(tenant_id, current_user, message.room_id, session)
            room_id = message.room_id
            message_id_for_usage = message.id

        chat_messages = LlmChatService._apply_additional_prompt(
            [
                ChatMessage(role=turn.role, content=turn.content)
                for turn in req.messages
            ],
            req.additionalPrompt,
        )
        if req.createLibrary:
            # attachmentFiles適用より前に行う。build_user_content適用後はcontentが
            # マルチモーダルのリストになりうり、その後にf-string結合すると壊れるため。
            chat_messages = LlmChatService._downgrade_system_turns_to_user(
                LlmChatService._apply_library_instruction_to_last_user_turn(
                    chat_messages
                )
            )
        chat_messages = LlmChatService._apply_attachment_files(
            chat_messages, req.attachmentFiles
        )

        if req.createLibrary:
            library_prompt = await SystemPromptTemplateRepository.find_by_type(
                _LIBRARY_PROMPT_TYPE, session
            )
            if library_prompt is None:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="ライブラリ生成用のシステムプロンプトが見つかりません。",
                )
            chat_messages = [
                ChatMessage(role="system", content=library_prompt.content),
                *chat_messages,
            ]

        chat_messages = _prepend_json_response_instruction(
            chat_messages, req.responseFormat
        )
        response_format_param = _build_llm_response_format(req.responseFormat)

        credit_settings = get_llm_credit_settings()
        endpoint_url = tenant_endpoint.endpoint
        api_key = tenant_endpoint.api_key
        deploy_name = req.deployName
        temperature = req.temperature
        max_tokens = req.maxTokens
        tools = _to_core_tool_configs(req.tools)
        user_id = current_user.id
        model_name = ai_model.name
        token_weight = positive_token_weight(float(ai_model.token_weight))
        create_library = req.createLibrary
        library_tenant_id = tenant_id
        library_message_id = message_id_for_usage

        async def event_stream() -> AsyncIterator[bytes]:
            """Azure OpenAIの応答をSSEイベントへ変換しつつ配信する。

            `createLibrary=true`の場合は、`text_delta`の代わりに`LibraryStreamRouter`
            経由でタイトル/本文/補足コメントの3区分に振り分けて配信し、完了後に
            ライブラリを新規永続化する。
            """
            input_tokens = 0
            output_tokens = 0
            router = LibraryStreamRouter() if create_library else None
            library_title: str | None = None
            library_content: str | None = None
            try:
                async for chunk in AzureLlmChatClient.stream_chat(
                    endpoint_url,
                    api_key,
                    deploy_name,
                    chat_messages,
                    temperature,
                    max_tokens,
                    tools,
                    response_format_param,
                ):
                    if chunk.text_delta is not None:
                        if router is not None:
                            for kind, text in router.feed(chunk.text_delta):
                                event = (
                                    "text_delta"
                                    if kind == "comment"
                                    else f"library_{kind}_delta"
                                )
                                yield _sse(event, {"text": text})
                        else:
                            yield _sse("text_delta", {"text": chunk.text_delta})
                    if chunk.input_tokens is not None:
                        input_tokens = chunk.input_tokens
                    if chunk.output_tokens is not None:
                        output_tokens = chunk.output_tokens

                if router is not None:
                    for kind, text in router.flush():
                        event = (
                            "text_delta"
                            if kind == "comment"
                            else f"library_{kind}_delta"
                        )
                        yield _sse(event, {"text": text})
                    # 永続化(`_persist_library`)自体は`finally`で行う。ここで確定させて
                    # おくことで、直後の`yield`中にクライアントが切断してGeneratorExitが
                    # 送出された場合でも、`finally`到達時点でタイトル・本文が確定済みなら
                    # ライブラリが永続化される(message_service.pyの同様の堅牢性方針を踏襲)。
                    library_title = (router.final_title() or DEFAULT_LIBRARY_TITLE)[
                        :_LIBRARY_TITLE_MAX_LENGTH
                    ]
                    library_content = router.final_content()
                    comment = router.final_comment()
                    if not comment:
                        yield _sse(
                            "text_delta", {"text": f"「{library_title}」を作成しました"}
                        )

                yield _sse(
                    "message_stop",
                    {"inputTokens": input_tokens, "outputTokens": output_tokens},
                )
            except Exception as e:
                # SSEは開始後にHTTPステータスでエラーを返せないため、専用イベントとして
                # クライアントへ通知する（例外を握り潰すのではなく、ログに残したうえで
                # クライアントへ伝わる形に変換する）。ライブラリ生成が正常完了した場合のみ
                # 永続化する移植元の挙動に合わせ、エラー時はライブラリを永続化しない
                # （`library_title`/`library_content`はflush後にのみ設定されるため、
                # 生成完了前の例外では自動的に永続化がスキップされる）。
                logger.exception("LLMチャット呼び出し中にエラーが発生しました")
                yield _sse("error", {"message": str(e)})
            finally:
                if library_title is not None and library_content is not None:
                    await LlmChatService._persist_library(
                        tenant_id=library_tenant_id,
                        message_id=library_message_id,
                        user_id=user_id,
                        title=library_title,
                        content=library_content,
                    )
                await LlmChatService._persist_token_usage(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    room_id=room_id,
                    message_id=message_id_for_usage,
                    model_name=model_name,
                    token_weight=token_weight,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    credit_settings=credit_settings,
                )

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    @staticmethod
    def _apply_additional_prompt(
        messages: list[ChatMessage], additional_prompt: str | None
    ) -> list[ChatMessage]:
        """末尾から見て最後の"user"ロール発話の前に追加プロンプトを前置する。

        移植元Java版`applyAdditionalPromptToLastUserTurn`に対応する。単純に配列末尾の
        発話を書き換えるのではなく、末尾から遡って最初に見つかった"user"ロールの発話
        （大文字小文字を区別しない）に適用する。該当する発話がない場合は何もしない。

        Args:
            messages: 会話履歴。
            additional_prompt: 前置きするプロンプト。未指定・空白のみなら何もしない。

        Returns:
            追加プロンプト適用後の会話履歴。
        """
        if not additional_prompt or not additional_prompt.strip():
            return messages
        for index in range(len(messages) - 1, -1, -1):
            if messages[index].role.lower() == "user":
                updated = list(messages)
                updated[index] = ChatMessage(
                    role=messages[index].role,
                    content=f"{additional_prompt}\n\n{messages[index].content}",
                )
                return updated
        return messages

    @staticmethod
    def _apply_library_instruction_to_last_user_turn(
        messages: list[ChatMessage],
    ) -> list[ChatMessage]:
        """ライブラリ生成時のみ、末尾から見て最後の"user"ロール発話の先頭に固定の指示を前置する。

        移植元Java版`applyLibraryInstructionToLastUserTurn`に対応する。
        `_apply_additional_prompt`で結合済みの発話にさらに被せる想定のため、必ず
        `_apply_additional_prompt`の後に呼ぶこと。

        Args:
            messages: 会話履歴。

        Returns:
            指示前置後の会話履歴。該当する"user"ロール発話がない場合はそのまま返す。
        """
        for index in range(len(messages) - 1, -1, -1):
            if messages[index].role.lower() == "user":
                updated = list(messages)
                updated[index] = ChatMessage(
                    role=messages[index].role,
                    content=f"{LIBRARY_USER_INSTRUCTION_PREFIX}{messages[index].content}",
                )
                return updated
        return messages

    @staticmethod
    def _apply_attachment_files(
        messages: list[ChatMessage], files: list[AttachmentFile]
    ) -> list[ChatMessage]:
        """末尾から見て最後の"user"ロール発話に添付ファイルを付与する。

        移植元Java版はターンごとにファイル名で紐付けるが、本ポートでは複雑さ低減のため
        `attachmentFiles`は常に最後のユーザー発話に一括で適用する
        （`docs/issue-97/01_要件定義.md`参照）。

        Args:
            messages: 会話履歴（`_apply_additional_prompt`適用後を想定）。
            files: 添付ファイル一覧。

        Returns:
            添付ファイル適用後の会話履歴。`files`が空、またはuser発話が存在しない
            場合はそのまま返す。
        """
        if not files:
            return messages
        for index in range(len(messages) - 1, -1, -1):
            if messages[index].role.lower() == "user":
                updated = list(messages)
                content = messages[index].content
                # additionalPrompt適用直後はcontentが常にstrであることを前提とする
                # (このメソッドは_apply_additional_promptの直後にのみ呼ばれる)。
                assert isinstance(content, str)
                updated[index] = ChatMessage(
                    role=messages[index].role,
                    content=build_user_content(content, files),
                )
                return updated
        return messages

    @staticmethod
    def _downgrade_system_turns_to_user(
        messages: list[ChatMessage],
    ) -> list[ChatMessage]:
        """ライブラリ生成時、クライアント由来の"system"ロール発話を"user"へ降格する。

        移植元Java版`buildSpringAiMessages`の`downgradeSystemToUser`相当。ライブラリ用
        システムプロンプトより後ろに別のsystem発話が並ぶと出力形式が不安定になるため、
        `messages`由来のsystem発話はuserへ降格する。

        Args:
            messages: 会話履歴。

        Returns:
            system発話をuserへ降格した会話履歴。
        """
        return [
            ChatMessage(role="user", content=message.content)
            if message.role.lower() == "system"
            else message
            for message in messages
        ]

    @staticmethod
    async def _persist_library(
        *,
        tenant_id: str,
        message_id: str | None,
        user_id: UUID,
        title: str,
        content: str,
    ) -> None:
        """生成したライブラリを新規セッションで永続化する（移植元`persistLibraryInNewTransaction`相当）。

        Args:
            tenant_id: テナントID。
            message_id: 紐づくメッセージID(`createLibrary=true`時は必須のため非None)。
            user_id: 生成したユーザーのID。
            title: 確定したタイトル(255文字以内に切り詰め済み)。
            content: 確定した本文(md)。
        """
        if message_id is None:
            # createLibrary=trueの場合、stream_chat冒頭のバリデーションでmessageId
            # 必須としているため実際には到達しないが、型上のNoneガードとして残す。
            logger.error("ライブラリ生成に必要なmessageIdが解決できませんでした")
            return
        session_maker = get_session_maker()
        async with session_maker() as new_session:
            await LibraryRepository.save(
                Library(
                    tenant_id=tenant_id,
                    message_id=message_id,
                    user_id=user_id,
                    title=title,
                    content=content,
                ),
                new_session,
            )

    @staticmethod
    async def _persist_token_usage(
        *,
        tenant_id: str,
        user_id: UUID,
        room_id: str | None,
        message_id: str | None,
        model_name: str,
        token_weight: float,
        input_tokens: int,
        output_tokens: int,
        credit_settings: LlmCreditSettings,
    ) -> None:
        """チャット呼び出しのトークン使用量を新規セッションで永続化する。

        ストリーミングを配信する非同期ジェネレータは、エンドポイント関数に注入された
        `AsyncSession`のライフサイクル外で実行されうるため、独立した新規セッションで
        コミットする。

        Args:
            tenant_id: テナントID。
            user_id: 呼び出したユーザーのID。
            room_id: 紐づくルームID(messageId未指定時はNone)。
            message_id: 紐づくメッセージID(messageId未指定時はNone)。
            model_name: 呼び出したAIモデル名。
            token_weight: 呼び出したAIモデルの重み係数。
            input_tokens: 入力トークン数。
            output_tokens: 出力トークン数。
            credit_settings: クレジット換算設定。
        """
        if input_tokens <= 0 and output_tokens <= 0:
            return

        token_usage = TokenUsage(
            tenant_id=tenant_id,
            user_id=user_id,
            room_id=room_id,
            message_id=message_id,
            endpoint_type=AIModelEndpointType.AZURE_OPENAI_CHAT.value,
            model=model_name,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            input_credits=input_credits(
                input_tokens,
                credit_settings.tokens_per_credit,
                credit_settings.input_credit_weight,
                token_weight,
            ),
            output_credits=output_credits(
                output_tokens, credit_settings.tokens_per_credit, token_weight
            ),
        )
        session_maker = get_session_maker()
        async with session_maker() as new_session:
            new_session.add(token_usage)
            await new_session.commit()
