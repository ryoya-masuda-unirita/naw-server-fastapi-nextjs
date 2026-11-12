from collections.abc import Collection, Sequence

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.core.search import escape_like_pattern
from app.core.sort import SortOrder, build_order_by
from app.models.prompt_template import GroupPromptTemplate, PromptTemplate

NO_GROUP_FILTER = "__none__"

# 管理者向け一覧で並べ替えに使える項目（画面の「テンプレート名順」「更新日時順」）。
# キーは移植元（Spring Data `sort`）と同じエンティティのプロパティ名。
_ADMIN_SORT_COLUMNS = {
    "name": PromptTemplate.name,
    "updatedAt": PromptTemplate.updated_at,
}


class PromptTemplateRepository:
    @staticmethod
    async def find_by_id_and_tenant_id(
        template_id: str, tenant_id: str, session: AsyncSession
    ) -> PromptTemplate | None:
        """テンプレートIDとテナントIDでプロンプトテンプレートを取得する。

        Args:
            template_id: プロンプトテンプレートID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            該当する PromptTemplate。存在しない場合は None。
        """
        stmt = select(PromptTemplate).where(
            PromptTemplate.id == template_id, PromptTemplate.tenant_id == tenant_id
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    def _apply_search(stmt: Select, search: str | None) -> Select:
        if not search:
            return stmt
        pattern = escape_like_pattern(search.lower())
        return stmt.where(
            func.lower(PromptTemplate.name).like(pattern, escape="\\")
            | func.lower(PromptTemplate.description).like(pattern, escape="\\")
        )

    @staticmethod
    async def find_page_by_group_ids(
        group_ids: Collection[str],
        tenant_id: str,
        search: str | None,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> tuple[list[PromptTemplate], int]:
        """一般ユーザー向け: 所属グループに紐づくテンプレートをページネーションで取得する。

        Args:
            group_ids: ログインユーザーの所属グループID一覧。
            tenant_id: テナントID。
            search: 名前・説明の部分一致検索文字列。
            page: ページ番号（0始まり）。
            size: 1ページあたりの件数。
            session: 非同期DBセッション。

        Returns:
            (プロンプトテンプレート一覧, 総件数) のタプル。
        """
        if not group_ids:
            return [], 0

        stmt = select(PromptTemplate).where(
            PromptTemplate.tenant_id == tenant_id,
            exists().where(
                GroupPromptTemplate.prompt_template_id == PromptTemplate.id,
                GroupPromptTemplate.tenant_id == tenant_id,
                GroupPromptTemplate.group_id.in_(group_ids),
            ),
        )
        stmt = PromptTemplateRepository._apply_search(stmt, search)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await session.execute(count_stmt)).scalar() or 0

        # 同時刻のテンプレートがページ境界で入れ替わらないよう、IDを最終キーにする
        stmt = stmt.order_by(PromptTemplate.updated_at.desc(), PromptTemplate.id.desc())
        stmt = stmt.offset(page * size).limit(size)
        templates = (await session.execute(stmt)).scalars().all()
        return list(templates), total

    @staticmethod
    async def find_page_for_admin(
        tenant_id: str,
        search: str | None,
        group_filter: str | None,
        exclude_group_id: str | None,
        admin: bool,
        admin_group_ids: Collection[str],
        sort: Sequence[SortOrder],
        page: int,
        size: int,
        session: AsyncSession,
    ) -> tuple[list[PromptTemplate], int]:
        """管理者向け: 権限とフィルター条件に応じてプロンプトテンプレートをページネーションで取得する。

        Args:
            tenant_id: テナントID。
            search: 名前・説明の部分一致検索文字列。
            group_filter: チームフィルタ（グループID）。`"__none__"` の場合は未紐付けのテンプレートのみに絞り込む。
            exclude_group_id: 指定グループに紐付いていないテンプレートのみに絞り込む場合のグループID。
            admin: 全体管理者かどうか。
            admin_group_ids: グループ管理者が管理するグループID一覧（`admin` が False の場合に使用）。
            sort: 並べ替え指定の並び（キーは"name"・"updatedAt"。それ以外は"updatedAt"として扱う）。
            page: ページ番号（0始まり）。
            size: 1ページあたりの件数。
            session: 非同期DBセッション。

        Returns:
            (プロンプトテンプレート一覧, 総件数) のタプル。
        """
        stmt = select(PromptTemplate).where(PromptTemplate.tenant_id == tenant_id)
        stmt = PromptTemplateRepository._apply_search(stmt, search)

        if group_filter == NO_GROUP_FILTER:
            stmt = stmt.where(
                ~exists().where(
                    GroupPromptTemplate.prompt_template_id == PromptTemplate.id,
                    GroupPromptTemplate.tenant_id == tenant_id,
                )
            )
        elif group_filter:
            stmt = stmt.where(
                exists().where(
                    GroupPromptTemplate.prompt_template_id == PromptTemplate.id,
                    GroupPromptTemplate.tenant_id == tenant_id,
                    GroupPromptTemplate.group_id == group_filter,
                )
            )
        elif not admin:
            if not admin_group_ids:
                return [], 0
            stmt = stmt.where(
                exists().where(
                    GroupPromptTemplate.prompt_template_id == PromptTemplate.id,
                    GroupPromptTemplate.tenant_id == tenant_id,
                    GroupPromptTemplate.group_id.in_(admin_group_ids),
                )
            )

        if exclude_group_id:
            stmt = stmt.where(
                ~exists().where(
                    GroupPromptTemplate.prompt_template_id == PromptTemplate.id,
                    GroupPromptTemplate.tenant_id == tenant_id,
                    GroupPromptTemplate.group_id == exclude_group_id,
                )
            )

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await session.execute(count_stmt)).scalar() or 0

        # 同名・同時刻のテンプレートがページ境界で入れ替わらないよう、IDを最終キーにして
        # 順序を確定させる（#170 で決めた常に昇順の挙動を維持する）
        stmt = stmt.order_by(
            *build_order_by(
                sort,
                _ADMIN_SORT_COLUMNS,
                fallback=PromptTemplate.updated_at,
                tie_breaker=PromptTemplate.id,
                tie_breaker_ascending=True,
            )
        )
        stmt = stmt.offset(page * size).limit(size)
        templates = (await session.execute(stmt)).scalars().all()
        return list(templates), total

    @staticmethod
    async def find_by_ids_and_tenant_id(
        ids: list[str], tenant_id: str, session: AsyncSession
    ) -> list[PromptTemplate]:
        """テンプレートID一覧とテナントIDに合致するプロンプトテンプレートを取得する。

        存在しないIDは無視される（呼び出し側で件数を比較して存在確認を行うこと）。

        Args:
            ids: 対象のプロンプトテンプレートID一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            該当するプロンプトテンプレート一覧。
        """
        if not ids:
            return []
        stmt = select(PromptTemplate).where(
            PromptTemplate.tenant_id == tenant_id, PromptTemplate.id.in_(ids)
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def delete_by_id_and_tenant_id(
        template_id: str, tenant_id: str, session: AsyncSession
    ) -> None:
        """テンプレートIDとテナントIDでプロンプトテンプレートを削除する。存在しない場合は何もしない。

        Args:
            template_id: プロンプトテンプレートID。
            tenant_id: テナントID。
            session: 非同期DBセッション。
        """
        template = await PromptTemplateRepository.find_by_id_and_tenant_id(
            template_id, tenant_id, session
        )
        if template:
            await session.delete(template)
            await session.commit()
