from datetime import datetime

from pydantic import BaseModel


class GroupCreateRequest(BaseModel):
    """グループ作成のリクエスト。"""

    name: str


class GroupUpdateRequest(BaseModel):
    """グループ更新のリクエスト。"""

    name: str | None = None


class GroupUsersAddRequest(BaseModel):
    """グループへのユーザー追加のリクエスト。"""

    userIds: list[str]


class GroupAssistantsAddRequest(BaseModel):
    """グループへのアシスタント追加のリクエスト。"""

    assistantIds: list[str]


class GroupPromptTemplatesAddRequest(BaseModel):
    """グループへのプロンプトテンプレート追加のリクエスト。"""

    templateIds: list[str]


class GroupUserRoleUpdateRequest(BaseModel):
    """グループ内のユーザーの管理者フラグ更新のリクエスト。"""

    groupAdmin: bool


class GroupListItemResponse(BaseModel):
    """グループ一覧の1件分。"""

    id: str
    tenantId: str
    name: str
    users: list[str]
    adminUserIds: list[str]
    adminUserNames: list[str]
    userNames: list[str]
    assistants: list[str]
    assistantIds: list[str]
    promptTemplates: list[str]
    promptTemplateIds: list[str]
    updatedAt: datetime


class GroupListPageResponse(BaseModel):
    """グループ一覧のページ応答。"""

    data: list[GroupListItemResponse]
    total: int
    page: int
    size: int


class GroupDetailResponse(BaseModel):
    """グループ詳細の応答。"""

    id: str
    name: str
    tenantId: str
    updatedAt: datetime


class GroupMemberUserResponse(BaseModel):
    """グループ所属ユーザー1件分。ビリング関連フィールドは本スコープでは常にNone（レスポンスからは除外される）。"""

    userId: str
    name: str
    displayName: str | None = None
    role: str
    usedTokens: int | None = None
    totalCredits: int | None = None
    accountType: str | None = None
    email: str | None = None
    groupAdmin: bool
    updatedAt: datetime


class PagedGroupMemberResponse(BaseModel):
    """グループ所属ユーザー一覧のページ応答。"""

    content: list[GroupMemberUserResponse]
    totalElements: int
    number: int
    size: int
