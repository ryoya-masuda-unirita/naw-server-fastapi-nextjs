import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.library import LibraryTagMapping
from app.models.library_tag import LibraryTag


class LibraryTagMappingRepository:
    @staticmethod
    async def find_tags_grouped_by_library_ids(
        library_ids: list[uuid.UUID], tenant_id: str, session: AsyncSession
    ) -> dict[uuid.UUID, list[tuple[str, str]]]:
        """ライブラリID一覧に対して、それぞれの付与タグ(id, name)一覧を1クエリでまとめて取得する。

        ライブラリごとに個別クエリを発行するとN+1になるため、対象ライブラリID一覧に対する
        (library_id, tag_id, tag_name) の組を1クエリで取得しPython側で集約する。

        Args:
            library_ids: 対象のライブラリID一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            ライブラリIDをキーとした (タグID, タグ名) 一覧の辞書。
        """
        if not library_ids:
            return {}
        stmt = (
            select(LibraryTagMapping.library_id, LibraryTag.id, LibraryTag.name)
            .join(LibraryTag, LibraryTag.id == LibraryTagMapping.library_tag_id)
            .where(
                LibraryTagMapping.library_id.in_(library_ids),
                LibraryTagMapping.tenant_id == tenant_id,
            )
        )
        result = await session.execute(stmt)

        grouped: dict[uuid.UUID, list[tuple[str, str]]] = {
            library_id: [] for library_id in library_ids
        }
        for library_id, tag_id, tag_name in result.all():
            grouped[library_id].append((tag_id, tag_name))
        return grouped

    @staticmethod
    async def replace_tags_for_library(
        library_id: uuid.UUID,
        tenant_id: str,
        tag_ids: list[str],
        session: AsyncSession,
    ) -> None:
        """対象ライブラリの既存の付与タグを全削除し、指定タグ一覧で置き換える。

        コミットは呼び出し側で行う。

        Args:
            library_id: 対象のライブラリID。
            tenant_id: テナントID。
            tag_ids: 付与するタグID一覧（実在確認済みのものを渡すこと）。
            session: 非同期DBセッション。
        """
        await session.execute(
            delete(LibraryTagMapping).where(
                LibraryTagMapping.library_id == library_id,
                LibraryTagMapping.tenant_id == tenant_id,
            )
        )
        for tag_id in tag_ids:
            session.add(
                LibraryTagMapping(
                    tenant_id=tenant_id, library_id=library_id, library_tag_id=tag_id
                )
            )
