from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.library_tag_id import normalize_library_tag_id, normalize_library_tag_ids
from app.models.library_tag import LibraryTag
from app.repositories.library_tag_repository import LibraryTagRepository
from app.schemas.library_tag import (
    LibraryTagCreateRequest,
    LibraryTagPageResponse,
    LibraryTagResponse,
    LibraryTagUpdateRequest,
)


class LibraryTagService:
    """ライブラリタグに関するビジネスロジック。"""

    @staticmethod
    def _to_response(tag: LibraryTag) -> LibraryTagResponse:
        """ライブラリタグのモデルからレスポンスを組み立てる。

        Parameters
        ----------
        tag : LibraryTag
            ライブラリタグ。

        Returns
        -------
        LibraryTagResponse
            ライブラリタグのレスポンス。
        """
        return LibraryTagResponse(
            id=tag.id,
            tenantId=tag.tenant_id,
            name=tag.name,
            description=tag.description,
            createdAt=tag.created_at,
            updatedAt=tag.updated_at,
        )

    @staticmethod
    async def _get_tag_or_404(
        tag_id: str, tenant_id: str, session: AsyncSession
    ) -> LibraryTag:
        """IDとテナントIDでライブラリタグを取得し、存在しなければ404を送出する。

        Parameters
        ----------
        tag_id : str
            ライブラリタグID。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        LibraryTag
            該当するライブラリタグ。

        Raises
        ------
        HTTPException
            存在しない場合、またはID形式でない場合404を返す。
        """
        # ハイフン付き・なしのどちらでも同じタグに当たるよう保存形式に揃えて比べる。
        # 不正な形式は、ライブラリAPIのパス変数と同じく存在しないIDと同様に扱う（404）。
        tag = None
        normalized_id = normalize_library_tag_id(tag_id)
        if normalized_id is not None:
            tag = await LibraryTagRepository.find_by_id_and_tenant_id(
                normalized_id, tenant_id, session
            )
        if not tag:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Library tag not found",
            )
        return tag

    @staticmethod
    async def get_all_library_tags(
        tenant_id: str, session: AsyncSession
    ) -> list[LibraryTagResponse]:
        """テナント内のライブラリタグを名前順に全件取得する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        list[LibraryTagResponse]
            名前順のライブラリタグ一覧。
        """
        tags = await LibraryTagRepository.find_by_tenant_id_order_by_name(
            tenant_id, session
        )
        return [LibraryTagService._to_response(t) for t in tags]

    @staticmethod
    async def get_library_tags_page(
        tenant_id: str,
        search: str | None,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> LibraryTagPageResponse:
        """テナント内のライブラリタグをページング・検索付きで取得する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        search : str | None
            タグ名の部分一致検索文字列。
        page : int
            0始まりのページ番号。
        size : int
            1ページあたりの件数。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        LibraryTagPageResponse
            ページング済みのライブラリタグ一覧。
        """
        tags, total = await LibraryTagRepository.find_page(
            tenant_id, search, page, size, session
        )
        return LibraryTagPageResponse(
            content=[LibraryTagService._to_response(t) for t in tags],
            totalElements=total,
            number=page,
            size=size,
        )

    @staticmethod
    async def create_library_tag(
        tenant_id: str, req: LibraryTagCreateRequest, session: AsyncSession
    ) -> LibraryTagResponse:
        """ライブラリタグを新規作成する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        req : LibraryTagCreateRequest
            作成リクエスト。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        LibraryTagResponse
            作成したライブラリタグ。

        Raises
        ------
        HTTPException
            同一テナント内に同名のタグが既に存在する場合400を返す。
        """
        if await LibraryTagRepository.exists_by_tenant_id_and_name(
            tenant_id, req.name, session
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Library tag with name {req.name} already exists",
            )

        tag = LibraryTag(
            tenant_id=tenant_id, name=req.name, description=req.description
        )
        created = await LibraryTagRepository.create(tag, session)
        return LibraryTagService._to_response(created)

    @staticmethod
    async def update_library_tag(
        tag_id: str,
        tenant_id: str,
        req: LibraryTagUpdateRequest,
        session: AsyncSession,
    ) -> LibraryTagResponse:
        """ライブラリタグを更新する。未指定（空白のみ含む）の項目は現状維持する。

        Parameters
        ----------
        tag_id : str
            更新対象のライブラリタグID。
        tenant_id : str
            テナントID。
        req : LibraryTagUpdateRequest
            更新リクエスト。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        LibraryTagResponse
            更新後のライブラリタグ。

        Raises
        ------
        HTTPException
            存在しない場合404、同一テナント内に同名の別タグが
            既に存在する場合400を返す。
        """
        tag = await LibraryTagService._get_tag_or_404(tag_id, tenant_id, session)

        if req.name is not None and req.name.strip():
            # パスの値はハイフン付きの場合があり保存値と一致しないため、
            # 取得したタグの（保存形式の）IDで自分自身を除外する。
            if await LibraryTagRepository.exists_by_tenant_id_and_name(
                tenant_id, req.name, session, exclude_id=tag.id
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Library tag with name {req.name} already exists",
                )
            tag.name = req.name
        if req.description is not None and req.description.strip():
            tag.description = req.description

        updated = await LibraryTagRepository.update(tag, session)
        return LibraryTagService._to_response(updated)

    @staticmethod
    async def delete_library_tags(
        tenant_id: str, ids: list[str], session: AsyncSession
    ) -> None:
        """ライブラリタグを一括削除する。存在しないIDは無視する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        ids : list[str]
            削除対象のライブラリタグID一覧（ハイフンなし32桁またはUUID標準形式）。
        session : AsyncSession
            非同期DBセッション。

        Raises
        ------
        HTTPException
            どちらの形式でもないIDを含む場合400を返す（1件も削除しない）。
        """
        # 移植元は削除の前に全IDをUUIDへ変換し、失敗すれば400にするため、
        # 削除より先に全件を正規化する。
        normalized_ids = normalize_library_tag_ids(ids)
        await LibraryTagRepository.delete_by_tenant_id_and_ids(
            tenant_id, normalized_ids, session
        )
