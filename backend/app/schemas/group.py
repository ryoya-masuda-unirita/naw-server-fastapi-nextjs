from datetime import datetime

from pydantic import BaseModel


class GroupCreateRequest(BaseModel):
    name: str


class GroupUpdateRequest(BaseModel):
    name: str | None = None


class GroupUsersAddRequest(BaseModel):
    userIds: list[str]


class GroupUserRoleUpdateRequest(BaseModel):
    groupAdmin: bool


class GroupListItemResponse(BaseModel):
    """グループ一覧の1件分。assistants/promptTemplates関連は未実装ドメインのため常に空リスト。"""

    id: str
    tenantId: str
    name: str
    users: list[str]
    adminUserIds: list[str]
    adminUserNames: list[str]
    userNames: list[str]
    assistants: list[str] = []
    assistantIds: list[str] = []
    promptTemplates: list[str] = []
    promptTemplateIds: list[str] = []
    updatedAt: datetime


class GroupListPageResponse(BaseModel):
    data: list[GroupListItemResponse]
    total: int
    page: int
    size: int


class GroupDetailResponse(BaseModel):
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
    loginKey: str | None
    accountType: str | None = None
    email: str | None = None
    groupAdmin: bool
    updatedAt: datetime


class PagedGroupMemberResponse(BaseModel):
    content: list[GroupMemberUserResponse]
    totalElements: int
    number: int
    size: int
