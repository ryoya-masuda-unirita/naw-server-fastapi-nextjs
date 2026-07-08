from collections.abc import Collection

from sqlalchemy import delete, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.core.search import escape_like_pattern
from app.models.index import Index, IndexEndpoint, IndexGroup, IndexType
from app.models.tenant_endpoint import TenantEndpoint


class IndexRepository:
    @staticmethod
    async def find_by_id_and_tenant_id(
        index_id: str, tenant_id: str, session: AsyncSession
    ) -> Index | None:
        """インデックスIDとテナントIDでインデックスを取得する。

        Args:
            index_id: インデックスID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            該当するIndex。存在しない場合はNone。
        """
        stmt = select(Index).where(Index.id == index_id, Index.tenant_id == tenant_id)
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    def _apply_search(stmt: Select, search: str | None) -> Select:
        if not search:
            return stmt
        pattern = escape_like_pattern(search.lower())
        return stmt.where(
            func.lower(Index.name).like(pattern, escape="\\")
            | func.lower(Index.description).like(pattern, escape="\\")
        )

    @staticmethod
    async def find_page(
        tenant_id: str,
        search: str | None,
        group_id: str | None,
        allowed_index_ids: Collection[str] | None,
        allowed_group_ids: Collection[str] | None,
        sort_col_name: str,
        sort_dir: str,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> tuple[list[Index], int]:
        """インデックス一覧をページネーションで取得する。

        移植元（Spring Boot）の`IndexService.getIndexes`/`searchIndexes`相当。
        グループ管理者向けの可視性スコープ（`allowed_index_ids`・`allowed_group_ids`が
        両方Noneでない場合）は、「自分の管理グループのアシスタントが使用しているインデックス」
        と「自分の管理グループに直接紐づくインデックス」の和集合として絞り込む。

        Args:
            tenant_id: テナントID。
            search: 名前・説明の部分一致検索文字列。
            group_id: グループIDでの絞り込み（指定時は`allowed_index_ids`/`allowed_group_ids`は無視する）。
            allowed_index_ids: グループ管理者向けスコープ（アシスタント経由）。Noneなら絞り込みなし。
            allowed_group_ids: グループ管理者向けスコープ（グループ直接紐付け経由）。Noneなら絞り込みなし。
            sort_col_name: ソート対象列名（"name"・"type"・"updatedAt"）。
            sort_dir: ソート方向（"asc" または "desc"）。
            page: ページ番号（0始まり）。
            size: 1ページあたりの件数。
            session: 非同期DBセッション。

        Returns:
            (インデックス一覧, 総件数) のタプル。
        """
        stmt = select(Index).where(Index.tenant_id == tenant_id)

        if group_id:
            stmt = stmt.where(
                exists().where(
                    IndexGroup.index_id == Index.id,
                    IndexGroup.tenant_id == tenant_id,
                    IndexGroup.group_id == group_id,
                )
            )
        elif allowed_index_ids is not None or allowed_group_ids is not None:
            index_ids = allowed_index_ids or []
            group_ids = allowed_group_ids or []
            if not index_ids and not group_ids:
                return [], 0
            stmt = stmt.where(
                Index.id.in_(index_ids)
                | exists().where(
                    IndexGroup.index_id == Index.id,
                    IndexGroup.tenant_id == tenant_id,
                    IndexGroup.group_id.in_(group_ids),
                )
            )

        stmt = IndexRepository._apply_search(stmt, search)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await session.execute(count_stmt)).scalar() or 0

        if sort_col_name == "name":
            sort_col = Index.name
        elif sort_col_name == "type":
            sort_col = Index.type
        else:
            sort_col = Index.updated_at
        stmt = stmt.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())
        stmt = stmt.offset(page * size).limit(size)

        indexes = (await session.execute(stmt)).scalars().all()
        return list(indexes), total

    @staticmethod
    async def count_saas_indexes(tenant_id: str, session: AsyncSession) -> int:
        """テナント内のSAAS_GLOBALインデックス件数を取得する（新規作成時の上限チェック用）。

        Args:
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            SAAS_GLOBALインデックスの件数。
        """
        stmt = select(func.count()).where(
            Index.tenant_id == tenant_id, Index.type == IndexType.SAAS_GLOBAL
        )
        result = await session.execute(stmt)
        return result.scalar() or 0

    @staticmethod
    async def create(index: Index, session: AsyncSession) -> Index:
        """インデックスを新規作成する。

        Args:
            index: 作成するインデックス。
            session: 非同期DBセッション。

        Returns:
            作成したインデックス。
        """
        session.add(index)
        await session.commit()
        await session.refresh(index)
        return index

    @staticmethod
    async def update(index: Index, session: AsyncSession) -> Index:
        """インデックスを更新する。

        Args:
            index: 更新するインデックス。
            session: 非同期DBセッション。

        Returns:
            更新後のインデックス。
        """
        session.add(index)
        await session.commit()
        await session.refresh(index)
        return index

    @staticmethod
    async def delete(index: Index, session: AsyncSession) -> None:
        """インデックスを削除する。

        `indexes_endpoints`・`indexes_groups`はDBのON DELETE CASCADEにより連動削除される。

        Args:
            index: 削除するインデックス。
            session: 非同期DBセッション。
        """
        await session.delete(index)
        await session.commit()

    @staticmethod
    async def find_tenant_endpoints_grouped_by_index_ids(
        index_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> dict[str, list[TenantEndpoint]]:
        """インデックスID一覧に対応するテナントエンドポイントを1クエリでまとめて取得する。

        一覧表示時にインデックスごとの個別クエリを発行するとN+1になるため、
        対象インデックスID一覧に対する`(index_id, TenantEndpoint)`のペアを1クエリで
        取得しPython側で集約する。

        Args:
            index_ids: 対象のインデックスID一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            インデックスIDをキーとしたテナントエンドポイント一覧の辞書。
        """
        if not index_ids:
            return {}
        stmt = (
            select(IndexEndpoint.index_id, TenantEndpoint)
            .join(TenantEndpoint, TenantEndpoint.id == IndexEndpoint.endpoint_id)
            .where(
                IndexEndpoint.index_id.in_(index_ids),
                IndexEndpoint.tenant_id == tenant_id,
            )
        )
        result = await session.execute(stmt)

        grouped: dict[str, list[TenantEndpoint]] = {
            index_id: [] for index_id in index_ids
        }
        for index_id, endpoint in result.all():
            grouped[index_id].append(endpoint)
        return grouped

    @staticmethod
    async def find_group_ids_grouped_by_index_ids(
        index_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> dict[str, list[str]]:
        """インデックスID一覧に対応するグループID一覧を1クエリでまとめて取得する。

        Args:
            index_ids: 対象のインデックスID一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            インデックスIDをキーとしたグループID一覧の辞書。
        """
        if not index_ids:
            return {}
        stmt = select(IndexGroup.index_id, IndexGroup.group_id).where(
            IndexGroup.index_id.in_(index_ids), IndexGroup.tenant_id == tenant_id
        )
        result = await session.execute(stmt)

        grouped: dict[str, list[str]] = {index_id: [] for index_id in index_ids}
        for index_id, group_id in result.all():
            grouped[index_id].append(group_id)
        return grouped

    @staticmethod
    async def replace_endpoints_for_index(
        index_id: str,
        tenant_id: str,
        endpoint_ids: Collection[str],
        session: AsyncSession,
    ) -> None:
        """対象インデックスの既存エンドポイント紐付けを全削除し、指定エンドポイント集合で置き換える。

        コミットは呼び出し側で行う。

        Args:
            index_id: 対象のインデックスID。
            tenant_id: テナントID。
            endpoint_ids: 紐付け先のエンドポイントID集合（実在確認済みのものを渡すこと）。
            session: 非同期DBセッション。
        """
        await session.execute(
            delete(IndexEndpoint).where(
                IndexEndpoint.index_id == index_id,
                IndexEndpoint.tenant_id == tenant_id,
            )
        )
        for endpoint_id in endpoint_ids:
            session.add(
                IndexEndpoint(
                    index_id=index_id, tenant_id=tenant_id, endpoint_id=endpoint_id
                )
            )

    @staticmethod
    async def replace_groups_for_index(
        index_id: str,
        tenant_id: str,
        group_ids: Collection[str],
        session: AsyncSession,
    ) -> None:
        """対象インデックスの既存グループ紐付けを全削除し、指定グループ集合で置き換える。

        コミットは呼び出し側で行う。

        Args:
            index_id: 対象のインデックスID。
            tenant_id: テナントID。
            group_ids: 紐付け先のグループID集合（実在確認済みのものを渡すこと）。
            session: 非同期DBセッション。
        """
        await session.execute(
            delete(IndexGroup).where(
                IndexGroup.index_id == index_id, IndexGroup.tenant_id == tenant_id
            )
        )
        for group_id in group_ids:
            session.add(
                IndexGroup(index_id=index_id, tenant_id=tenant_id, group_id=group_id)
            )
