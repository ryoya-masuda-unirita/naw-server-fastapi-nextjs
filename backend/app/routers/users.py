from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user, get_verified_tenant_id, require_admin
from app.core.sort import SortOrder, sort_query
from app.models.user import User
from app.schemas.user import (
    PagedUserResponse,
    UserCreateRequest,
    UserCreateResponse,
    UserProfileUpdateRequest,
    UserResponse,
    UserUpdateRequest,
    UserUpdateResponse,
)
from app.services.user_service import UserService

admin_router = APIRouter(prefix="/api/admin/users", tags=["admin-users"])
user_router = APIRouter(prefix="/api/users", tags=["users"])

# 初期パスワードや設定したログインキーを平文で返す応答は、ブラウザやプロキシに
# 残らないようにする（移植元 UserController の作成・更新と同じ）。
NO_STORE_HEADER_VALUE = "no-store"


@admin_router.get(
    "",
    response_model=PagedUserResponse,
    response_model_exclude_none=True,
)
async def get_users(
    x_tenant_id: str = Depends(get_verified_tenant_id),
    page: int = Query(0, ge=0),
    size: int = Query(20, ge=1, le=1000),
    sort: list[SortOrder] = Depends(sort_query("created_at,desc")),
    searchText: str | None = Query(None),
    role: str | None = Query(None),
    excludeGroupId: str | None = Query(None),
    includeUsage: bool = Query(False),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> PagedUserResponse:
    """ユーザー一覧を取得する（テナント管理者のみ）。

    Parameters
    ----------
    x_tenant_id : str
        リクエストのテナントID。
    page : int
        ページ番号（0始まり）。
    size : int
        1ページあたりの件数。
    sort : list[SortOrder]
        並べ替え指定。
    searchText : str | None
        loginId・name の部分一致検索文字列。
    role : str | None
        ロールの絞り込み。
    excludeGroupId : str | None
        指定したグループの所属ユーザーを除く。
    includeUsage : bool
        True のとき請求期間内の totalCredits を付ける。
    current_user : User
        ログイン中の管理者。
    session : AsyncSession
        非同期DBセッション。

    Returns
    -------
    PagedUserResponse
        ユーザー一覧のページ。
    """
    return await UserService.get_users(
        x_tenant_id,
        page,
        size,
        sort,
        searchText,
        role,
        excludeGroupId,
        session,
        include_usage=includeUsage,
    )


@admin_router.post("", response_model=UserCreateResponse)
async def create_user(
    req: UserCreateRequest,
    response: Response,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> UserCreateResponse:
    """ユーザーを作成する（テナント管理者のみ）。

    Parameters
    ----------
    req : UserCreateRequest
        ユーザー作成のリクエスト。
    response : Response
        応答ヘッダーを設定するための応答オブジェクト。
    x_tenant_id : str
        リクエストのテナントID。
    current_user : User
        ログイン中の管理者。
    session : AsyncSession
        非同期DBセッション。

    Returns
    -------
    UserCreateResponse
        作成したユーザーと初期パスワード。
    """
    response.headers["Cache-Control"] = NO_STORE_HEADER_VALUE
    return await UserService.create_user(req, x_tenant_id, session)


@admin_router.patch("/{user_id}", response_model=UserUpdateResponse)
async def update_user(
    user_id: str,
    req: UserUpdateRequest,
    response: Response,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> UserUpdateResponse:
    """ユーザーを更新する（テナント管理者のみ）。

    Parameters
    ----------
    user_id : str
        更新するユーザーのloginId。
    req : UserUpdateRequest
        ユーザー更新のリクエスト。
    response : Response
        応答ヘッダーを設定するための応答オブジェクト。
    x_tenant_id : str
        リクエストのテナントID。
    current_user : User
        ログイン中の管理者。
    session : AsyncSession
        非同期DBセッション。

    Returns
    -------
    UserUpdateResponse
        更新後のユーザー。パスワードを再発行したときは初期パスワードも含む。
    """
    response.headers["Cache-Control"] = NO_STORE_HEADER_VALUE
    return await UserService.update_user(user_id, req, x_tenant_id, session)


@admin_router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> None:
    """ユーザーを削除する（テナント管理者のみ）。

    Parameters
    ----------
    user_id : str
        削除するユーザーのloginId。
    x_tenant_id : str
        リクエストのテナントID。
    current_user : User
        ログイン中の管理者。
    session : AsyncSession
        非同期DBセッション。
    """
    await UserService.delete_user(user_id, x_tenant_id, session)


# 移植元 UserResponse は @JsonInclude(NON_NULL) のため、null の項目（totalCredits）は返さない。
@user_router.get(
    "/profile", response_model=UserResponse, response_model_exclude_none=True
)
async def get_profile(
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> UserResponse:
    """ログイン中のユーザーのプロフィールを取得する。

    Parameters
    ----------
    x_tenant_id : str
        リクエストのテナントID。
    current_user : User
        ログイン中のユーザー。
    session : AsyncSession
        非同期DBセッション。

    Returns
    -------
    UserResponse
        ログイン中のユーザーのプロフィール。
    """
    return await UserService.get_profile(current_user.login_id, x_tenant_id, session)


@user_router.patch(
    "/profile", response_model=UserResponse, response_model_exclude_none=True
)
async def update_profile(
    req: UserProfileUpdateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> UserResponse:
    """ログイン中のユーザーのプロフィール（パスワード）を更新する。

    Parameters
    ----------
    req : UserProfileUpdateRequest
        プロフィール更新のリクエスト。
    x_tenant_id : str
        リクエストのテナントID。
    current_user : User
        ログイン中のユーザー。
    session : AsyncSession
        非同期DBセッション。

    Returns
    -------
    UserResponse
        更新後のプロフィール。
    """
    return await UserService.update_profile(
        current_user.login_id, req, x_tenant_id, session
    )
