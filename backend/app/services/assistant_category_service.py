from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assistant_category import AssistantCategory
from app.models.user import User
from app.repositories.assistant_category_repository import (
    AssistantCategoryRepository,
)
from app.schemas.assistant_category import (
    AssistantCategoryCreateRequest,
    AssistantCategoryResponse,
    AssistantCategoryUpdateRequest,
)

# 移植元 AssistantCategoryService の EntityNotFoundException の文言に合わせる。
# 移植元は更新処理だけコロンの後に空白が入るため、文言を2つ持つ。
_NOT_FOUND_MESSAGE = "AssistantCategory not found with id:{category_id}"
_NOT_FOUND_MESSAGE_ON_UPDATE = "AssistantCategory not found with id: {category_id}"
# 移植元は同名カテゴリの一意制約違反（DataIntegrityViolationException）を
# APIControllerAdvice で扱わず、Spring Boot 既定の500（error: "Internal Server Error"）
# になる。状態コードと文言を合わせつつ、共通のエラー形式・CORSヘッダーで返すため
# HTTPException に変換する（未処理の例外のままだとCORSヘッダーの無い応答になる）。
_CONSTRAINT_VIOLATION_MESSAGE = "Internal Server Error"


class AssistantCategoryService:
    """アシスタントカテゴリの作成・取得・更新・削除を行うサービス。"""

    @staticmethod
    def _to_response(category: AssistantCategory) -> AssistantCategoryResponse:
        """アシスタントカテゴリを応答の形に変換する。

        Parameters
        ----------
        category : AssistantCategory
            変換するアシスタントカテゴリ。

        Returns
        -------
        AssistantCategoryResponse
            応答用のアシスタントカテゴリ。
        """
        return AssistantCategoryResponse(
            id=category.id,
            name=category.name,
            description=category.description,
            updatedAt=category.updated_at,
        )

    @staticmethod
    def _constraint_violation_error() -> HTTPException:
        """DB制約違反を表す、移植元と同じ500の例外を作る。

        Returns
        -------
        HTTPException
            500の例外。
        """
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_CONSTRAINT_VIOLATION_MESSAGE,
        )

    @staticmethod
    async def _get_category_or_404(
        category_id: str,
        tenant_id: str,
        session: AsyncSession,
        *,
        not_found_message: str = _NOT_FOUND_MESSAGE,
    ) -> AssistantCategory:
        """IDとテナントIDでアシスタントカテゴリを取得し、存在しなければ404を送出する。

        Parameters
        ----------
        category_id : str
            アシスタントカテゴリID。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。
        not_found_message : str
            存在しない場合の文言の雛形（`{category_id}` を埋める）。

        Returns
        -------
        AssistantCategory
            該当するアシスタントカテゴリ。

        Raises
        ------
        HTTPException
            存在しない場合404を返す。
        """
        category = await AssistantCategoryRepository.find_by_id_and_tenant_id(
            category_id, tenant_id, session
        )
        if not category:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=not_found_message.format(category_id=category_id),
            )
        return category

    @staticmethod
    async def create_assistant_category(
        tenant_id: str,
        current_user: User,
        req: AssistantCategoryCreateRequest,
        session: AsyncSession,
    ) -> AssistantCategoryResponse:
        """アシスタントカテゴリを新規作成する。

        移植元と同じく同名の事前チェックはしない。同一テナント内に同名のカテゴリが
        あると一意制約の違反になり、移植元と同じく500になる。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        current_user : User
            認証済みユーザー。
        req : AssistantCategoryCreateRequest
            作成リクエスト。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        AssistantCategoryResponse
            作成したアシスタントカテゴリ。

        Raises
        ------
        HTTPException
            同一テナント内に同名のカテゴリが既に存在する場合500を返す。
        """
        category = AssistantCategory(
            tenant_id=tenant_id,
            name=req.name,
            description=req.description,
            updated_user_id=current_user.id,
        )
        try:
            created = await AssistantCategoryRepository.create(category, session)
        except IntegrityError as exc:
            await session.rollback()
            raise AssistantCategoryService._constraint_violation_error() from exc
        return AssistantCategoryService._to_response(created)

    @staticmethod
    async def get_assistant_categories(
        tenant_id: str, session: AsyncSession
    ) -> list[AssistantCategoryResponse]:
        """テナント内の全アシスタントカテゴリを取得する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        list[AssistantCategoryResponse]
            アシスタントカテゴリ一覧。
        """
        categories = await AssistantCategoryRepository.find_by_tenant_id(
            tenant_id, session
        )
        return [AssistantCategoryService._to_response(c) for c in categories]

    @staticmethod
    async def get_assistant_category(
        category_id: str, tenant_id: str, session: AsyncSession
    ) -> AssistantCategoryResponse:
        """IDを指定してアシスタントカテゴリを取得する。

        Parameters
        ----------
        category_id : str
            アシスタントカテゴリID。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        AssistantCategoryResponse
            該当するアシスタントカテゴリ。

        Raises
        ------
        HTTPException
            存在しない場合404を返す。
        """
        category = await AssistantCategoryService._get_category_or_404(
            category_id, tenant_id, session
        )
        return AssistantCategoryService._to_response(category)

    @staticmethod
    async def update_assistant_category(
        category_id: str,
        tenant_id: str,
        current_user: User,
        req: AssistantCategoryUpdateRequest,
        session: AsyncSession,
    ) -> AssistantCategoryResponse:
        """アシスタントカテゴリを更新する。

        移植元と同じく、説明は空白でない値が来たときだけ上書きし、省略・空白なら
        元の説明を残す。名前は入力チェックで空白を弾いているため常に上書きする。
        同名の事前チェックはせず、同名の別カテゴリがあれば一意制約の違反で500になる。

        Parameters
        ----------
        category_id : str
            更新対象のアシスタントカテゴリID。
        tenant_id : str
            テナントID。
        current_user : User
            認証済みユーザー。
        req : AssistantCategoryUpdateRequest
            更新リクエスト。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        AssistantCategoryResponse
            更新後のアシスタントカテゴリ。

        Raises
        ------
        HTTPException
            存在しない場合404、同一テナント内に同名の別カテゴリが既に存在する場合
            500を返す。
        """
        category = await AssistantCategoryService._get_category_or_404(
            category_id,
            tenant_id,
            session,
            not_found_message=_NOT_FOUND_MESSAGE_ON_UPDATE,
        )

        category.name = req.name
        # 移植元 StringUtils.isNotBlank と同じく、None・空文字・空白だけなら残す
        if req.description and req.description.strip():
            category.description = req.description
        category.updated_user_id = current_user.id
        try:
            updated = await AssistantCategoryRepository.update(category, session)
        except IntegrityError as exc:
            await session.rollback()
            raise AssistantCategoryService._constraint_violation_error() from exc
        return AssistantCategoryService._to_response(updated)

    @staticmethod
    async def delete_assistant_category(
        category_id: str, tenant_id: str, session: AsyncSession
    ) -> None:
        """アシスタントカテゴリを削除する。

        Parameters
        ----------
        category_id : str
            削除対象のアシスタントカテゴリID。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Raises
        ------
        HTTPException
            存在しない場合404を返す。
        """
        category = await AssistantCategoryService._get_category_or_404(
            category_id, tenant_id, session
        )
        await AssistantCategoryRepository.delete(category, session)
