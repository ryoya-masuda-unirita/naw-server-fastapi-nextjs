"""リクエストのスキーマが、移植元のBean Validationと同じ文言を返すことのテスト（Issue #239）。

期待する文言は移植元のRequestクラスの注釈の`message`（指定が無いものは
Hibernate Validatorの日本語の既定文言）。対応表は`docs/issue-239/01_要件定義.md`。
"""

from typing import Any

import pytest
from pydantic import BaseModel, ValidationError

from app.core.errors import validation_error_message
from app.schemas.assistant import AssistantCreateRequest, AssistantUpdateRequest
from app.schemas.assistant_category import (
    AssistantCategoryCreateRequest,
    AssistantCategoryUpdateRequest,
)
from app.schemas.auth import PasswordResetRequest
from app.schemas.feedback import (
    FeedbackMessageListRequest,
    FeedbackRoomListRequest,
    FeedbackUserListRequest,
)
from app.schemas.library import LibraryUpdateRequest
from app.schemas.library_tag import (
    LibraryTagCreateRequest,
    LibraryTagDeleteRequest,
    LibraryTagUpdateRequest,
)
from app.schemas.llm import LlmChatRequest, LlmEmbeddingRequest
from app.schemas.message import (
    MessageContentCreateRequest,
    MessageCreateRequest,
    ToolConfig,
)
from app.schemas.tenant import TenantAdminPatchRequest
from app.schemas.token_usage import TokenUsageListQuery, TokenUsagePeriodQuery
from app.schemas.user import UserCreateRequest

_ENDPOINT = {"id": "endpoint-1", "model": "gpt-4o"}
_ASSISTANT = {"type": "SECURE", "endpoints": [_ENDPOINT], "name": "アシスタント"}
_CHAT = {
    "deployName": "gpt-4o",
    "messages": [{"role": "user", "content": "こんにちは"}],
}
_EMBEDDING = {"deployName": "text-embedding", "input": "テキスト"}
_PASSWORD_RESET = {
    "loginId": "user",
    "oldPassword": "OldPassword123!",
    "newPassword": "NewPassword123!",
}
_USER = {"loginId": "user", "name": "ユーザー", "role": "USER"}
_PERIOD = {"from": "2026-01-01T00:00:00Z", "to": "2026-01-02T00:00:00Z"}


def _without(data: dict[str, Any], key: str) -> dict[str, Any]:
    return {k: v for k, v in data.items() if k != key}


def _first_message(model: type[BaseModel], data: dict[str, Any]) -> str:
    with pytest.raises(ValidationError) as exc_info:
        model.model_validate(data)
    return validation_error_message(exc_info.value.errors())


CASES: list[tuple[str, type[BaseModel], dict[str, Any], str]] = [
    # アシスタントカテゴリ
    (
        "category_name_missing",
        AssistantCategoryCreateRequest,
        {},
        "カテゴリ名は必須です",
    ),
    (
        "category_name_null",
        AssistantCategoryUpdateRequest,
        {"name": None},
        "カテゴリ名は必須です",
    ),
    (
        "category_name_too_long",
        AssistantCategoryCreateRequest,
        {"name": "あ" * 17},
        "カテゴリ名は16文字以内で入力してください",
    ),
    (
        "category_description_too_long",
        AssistantCategoryUpdateRequest,
        {"name": "カテゴリ", "description": "あ" * 256},
        "説明は255文字以内で入力してください",
    ),
    # アシスタント
    (
        "assistant_type_missing",
        AssistantCreateRequest,
        _without(_ASSISTANT, "type"),
        "接続サーバー（タイプ）を指定してください。",
    ),
    (
        "assistant_endpoints_empty",
        AssistantCreateRequest,
        {**_ASSISTANT, "endpoints": []},
        "少なくとも1つのエンドポイントが必要です。",
    ),
    (
        "assistant_endpoints_missing",
        AssistantUpdateRequest,
        _without(_ASSISTANT, "endpoints"),
        "少なくとも1つのエンドポイントが必要です。",
    ),
    (
        "assistant_endpoint_id_missing",
        AssistantCreateRequest,
        {**_ASSISTANT, "endpoints": [{"model": "gpt-4o"}]},
        "エンドポイントIDは必須です",
    ),
    (
        "assistant_endpoint_model_null",
        AssistantCreateRequest,
        {**_ASSISTANT, "endpoints": [{"id": "endpoint-1", "model": None}]},
        "生成AIモデルは必須です",
    ),
    (
        "assistant_name_null",
        AssistantCreateRequest,
        {**_ASSISTANT, "name": None},
        "アシスタント表示名は必須です",
    ),
    (
        "assistant_name_too_long",
        AssistantCreateRequest,
        {**_ASSISTANT, "name": "あ" * 33},
        "アシスタント表示名は32文字以内で入力してください",
    ),
    (
        "assistant_update_name_too_long",
        AssistantUpdateRequest,
        {**_ASSISTANT, "name": "あ" * 33},
        "アシスタント表示名は32文字以内で入力してください",
    ),
    (
        "assistant_update_name_blank",
        AssistantUpdateRequest,
        {**_ASSISTANT, "name": "   "},
        "アシスタント表示名は空白にできません。",
    ),
    (
        "assistant_description_too_long",
        AssistantCreateRequest,
        {**_ASSISTANT, "description": "あ" * 1001},
        "アシスタントの説明は1000文字以内で入力してください",
    ),
    # メッセージ・ツール設定（移植元はメッセージ指定なしのため既定文言）
    ("tool_name_missing", ToolConfig, {}, "空白は許可されていません"),
    (
        "message_assistant_id_missing",
        MessageCreateRequest,
        {},
        "空要素は許可されていません",
    ),
    (
        "message_assistant_id_empty",
        MessageCreateRequest,
        {"assistantId": ""},
        "空要素は許可されていません",
    ),
    (
        "message_content_user_input_missing",
        MessageContentCreateRequest,
        {"messageId": "message-1"},
        "null は許可されていません",
    ),
    # フィードバック一覧
    (
        "feedback_user_sort_field",
        FeedbackUserListRequest,
        {"sortField": "x"},
        "ソート項目は updatedAt, name, count, review1, review2, review3, review4,"
        " review5 のいずれかを指定してください",
    ),
    (
        "feedback_message_sort_field",
        FeedbackMessageListRequest,
        {"sortField": "x"},
        "ソート項目は updatedAt, name, accuracy, add, folder のいずれかを指定してください",
    ),
    (
        "feedback_room_sort_field",
        FeedbackRoomListRequest,
        {"sortField": "x"},
        "ソート項目は updatedAt, chat, name, level のいずれかを指定してください",
    ),
    (
        "feedback_user_sort_order",
        FeedbackUserListRequest,
        {"sortOrder": "x"},
        "ソート順は asc または desc を指定してください",
    ),
    (
        "feedback_message_sort_order",
        FeedbackMessageListRequest,
        {"sortOrder": "x"},
        "ソート順は asc または desc を指定してください",
    ),
    (
        "feedback_room_sort_order",
        FeedbackRoomListRequest,
        {"sortOrder": "x"},
        "ソート順は asc または desc を指定してください",
    ),
    # ライブラリ・ライブラリタグ
    ("library_name_missing", LibraryUpdateRequest, {}, "ライブラリ名は必須です"),
    (
        "library_name_too_long",
        LibraryUpdateRequest,
        {"name": "あ" * 256},
        "ライブラリ名は255文字以内で入力してください",
    ),
    ("tag_name_missing", LibraryTagCreateRequest, {}, "タグ名は必須です"),
    (
        "tag_name_too_long",
        LibraryTagCreateRequest,
        {"name": "あ" * 256},
        "タグ名は255文字以内で入力してください",
    ),
    (
        "tag_update_name_too_long",
        LibraryTagUpdateRequest,
        {"name": "あ" * 256},
        "タグ名は255文字以内で入力してください",
    ),
    (
        "tag_delete_ids_empty",
        LibraryTagDeleteRequest,
        {"ids": []},
        "削除対象のIDを1件以上指定してください",
    ),
    (
        "tag_delete_ids_missing",
        LibraryTagDeleteRequest,
        {},
        "削除対象のIDを1件以上指定してください",
    ),
    # LLM チャット
    (
        "chat_deploy_name_missing",
        LlmChatRequest,
        _without(_CHAT, "deployName"),
        "deployName は必須です",
    ),
    (
        "chat_deploy_name_empty",
        LlmChatRequest,
        {**_CHAT, "deployName": ""},
        "deployName は必須です",
    ),
    (
        "chat_temperature_below_min",
        LlmChatRequest,
        {**_CHAT, "temperature": -0.1},
        "temperature は 0.0 以上である必要があります",
    ),
    (
        "chat_temperature_above_max",
        LlmChatRequest,
        {**_CHAT, "temperature": 1.1},
        "temperature は 1.0 以下である必要があります",
    ),
    (
        "chat_messages_empty",
        LlmChatRequest,
        {**_CHAT, "messages": []},
        "messages は1件以上必要です",
    ),
    (
        "chat_messages_null",
        LlmChatRequest,
        {**_CHAT, "messages": None},
        "messages は1件以上必要です",
    ),
    (
        "chat_role_missing",
        LlmChatRequest,
        {**_CHAT, "messages": [{"content": "こんにちは"}]},
        "role は必須です",
    ),
    (
        "chat_content_null",
        LlmChatRequest,
        {**_CHAT, "messages": [{"role": "user", "content": None}]},
        "content は必須です",
    ),
    # LLM 埋め込み
    (
        "embedding_deploy_name_missing",
        LlmEmbeddingRequest,
        _without(_EMBEDDING, "deployName"),
        "deployName は必須です",
    ),
    (
        "embedding_input_missing",
        LlmEmbeddingRequest,
        _without(_EMBEDDING, "input"),
        "input は必須です",
    ),
    (
        "embedding_input_blank",
        LlmEmbeddingRequest,
        {**_EMBEDDING, "input": "   "},
        "input は必須です",
    ),
    (
        "embedding_dimensions_below_min",
        LlmEmbeddingRequest,
        {**_EMBEDDING, "dimensions": 0},
        "dimensions は 1 以上である必要があります",
    ),
    (
        "embedding_dimensions_above_max",
        LlmEmbeddingRequest,
        {**_EMBEDDING, "dimensions": 32768},
        "dimensions は 32767 以下である必要があります",
    ),
    # パスワードリセット
    (
        "password_reset_login_id_missing",
        PasswordResetRequest,
        _without(_PASSWORD_RESET, "loginId"),
        "ログインIDの入力は必須です。",
    ),
    (
        "password_reset_username_null",
        PasswordResetRequest,
        {**_without(_PASSWORD_RESET, "loginId"), "username": None},
        "ログインIDの入力は必須です。",
    ),
    (
        "password_reset_old_password_missing",
        PasswordResetRequest,
        _without(_PASSWORD_RESET, "oldPassword"),
        "旧パスワードの入力は必須です。",
    ),
    (
        "password_reset_old_password_blank",
        PasswordResetRequest,
        {**_PASSWORD_RESET, "oldPassword": "   "},
        "旧パスワードの入力は必須です。",
    ),
    (
        "password_reset_new_password_missing",
        PasswordResetRequest,
        _without(_PASSWORD_RESET, "newPassword"),
        "新パスワードの入力は必須です。",
    ),
    # ユーザー作成（移植元はメッセージ指定なしのため既定文言）
    (
        "user_login_id_missing",
        UserCreateRequest,
        _without(_USER, "loginId"),
        "空白は許可されていません",
    ),
    (
        "user_name_null",
        UserCreateRequest,
        {**_USER, "name": None},
        "空白は許可されていません",
    ),
    (
        "user_role_null",
        UserCreateRequest,
        {**_USER, "role": None},
        "null は許可されていません",
    ),
    # テナント管理の更新
    (
        "tenant_max_credits_negative",
        TenantAdminPatchRequest,
        {"maxUsageBasedCreditsPerMonth": -1},
        "maxUsageBasedCreditsPerMonth は 0 以上である必要があります",
    ),
    # トークン使用量
    (
        "token_usage_from_missing",
        TokenUsagePeriodQuery,
        _without(_PERIOD, "from"),
        "開始日時は必須です",
    ),
    (
        "token_usage_from_empty",
        TokenUsagePeriodQuery,
        {**_PERIOD, "from": ""},
        "開始日時は必須です",
    ),
    (
        "token_usage_from_invalid",
        TokenUsagePeriodQuery,
        {**_PERIOD, "from": "2026/01/01"},
        "開始日時は YYYY-MM-DDTHH:mm:ssZ 形式で指定してください",
    ),
    (
        "token_usage_to_missing",
        TokenUsagePeriodQuery,
        _without(_PERIOD, "to"),
        "終了日時は必須です",
    ),
    (
        "token_usage_to_invalid",
        TokenUsageListQuery,
        {**_PERIOD, "to": "x"},
        "終了日時は YYYY-MM-DDTHH:mm:ssZ 形式で指定してください",
    ),
    (
        "token_usage_from_after_to",
        TokenUsagePeriodQuery,
        {"from": "2026-01-02T00:00:00Z", "to": "2026-01-01T00:00:00Z"},
        "開始日時は終了日時以前である必要があります",
    ),
    (
        "token_usage_period_too_long",
        TokenUsagePeriodQuery,
        {"from": "2026-01-01T00:00:00Z", "to": "2026-02-02T00:00:00Z"},
        "指定期間は31日以内である必要があります",
    ),
    (
        "token_usage_page_negative",
        TokenUsageListQuery,
        {**_PERIOD, "page": -1},
        "ページ番号は0以上である必要があります",
    ),
    (
        "token_usage_size_below_min",
        TokenUsageListQuery,
        {**_PERIOD, "size": 0},
        "件数は1以上である必要があります",
    ),
    (
        "token_usage_size_above_max",
        TokenUsageListQuery,
        {**_PERIOD, "size": 101},
        "件数は100以下である必要があります",
    ),
    (
        "token_usage_order_by",
        TokenUsageListQuery,
        {**_PERIOD, "orderBy": "x"},
        "ソート項目は createdAt または totalTokens のいずれかを指定してください",
    ),
]


@pytest.mark.parametrize(
    ("model", "data", "expected"),
    [case[1:] for case in CASES],
    ids=[case[0] for case in CASES],
)
def test_returns_source_message(
    model: type[BaseModel], data: dict[str, Any], expected: str
) -> None:
    """移植元のRequestクラスと同じ文言を返すこと"""
    assert _first_message(model, data) == expected


class TestBackendOnlyConstraints:
    def test_chat_content_empty_keeps_default_message(self):
        """チャットのcontentの空文字はbackend独自の制約のため、文言を置き換えないこと"""
        message = _first_message(
            LlmChatRequest, {**_CHAT, "messages": [{"role": "user", "content": ""}]}
        )

        assert message == "String should have at least 1 character"

    def test_tenant_name_too_long_keeps_default_message(self):
        """テナント名の32文字以内はbackend独自の制約のため、文言を置き換えないこと"""
        message = _first_message(TenantAdminPatchRequest, {"tenantName": "a" * 33})

        assert message == "String should have at most 32 characters"


class TestConstraintsUnchanged:
    def test_message_content_empty_user_input_is_accepted(self):
        """回答の生成のuserInputは移植元と同じく空文字を受け付けること（issue-245）"""
        request = MessageContentCreateRequest.model_validate(
            {"messageId": "message-1", "userInput": ""}
        )

        assert request.userInput == ""

    def test_category_name_at_max_length_is_accepted(self):
        """カテゴリ名16文字ちょうどは受け付けること"""
        request = AssistantCategoryCreateRequest.model_validate({"name": "あ" * 16})

        assert request.name == "あ" * 16

    def test_token_usage_list_bounds_are_accepted(self):
        """トークン使用量のページ番号0・件数100は受け付けること"""
        query = TokenUsageListQuery.model_validate({**_PERIOD, "page": 0, "size": 100})

        assert (query.page, query.size) == (0, 100)

    def test_chat_temperature_bounds_are_accepted(self):
        """チャットのtemperature 0.0・1.0は受け付けること"""
        for temperature in (0.0, 1.0):
            request = LlmChatRequest.model_validate(
                {**_CHAT, "temperature": temperature}
            )
            assert request.temperature == temperature
