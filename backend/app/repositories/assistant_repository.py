from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.search import escape_like_pattern
from app.models.assistant import (
    Assistant,
    AssistantCategoryMapping,
    AssistantType,
    GroupAssistant,
)


class AssistantRepository:
    @staticmethod
    async def find_by_ids_and_tenant_id(
        assistant_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> list[Assistant]:
        """アシスタントID一覧とテナントIDでアシスタントを取得する。

        Args:
            assistant_ids: 取得対象のアシスタントID一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            アシスタント一覧。
        """
        if not assistant_ids:
            return []
        stmt = select(Assistant).where(
            Assistant.id.in_(assistant_ids), Assistant.tenant_id == tenant_id
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def find_by_id_and_tenant_id(
        assistant_id: str, tenant_id: str, session: AsyncSession
    ) -> Assistant | None:
        """アシスタントIDとテナントIDでアシスタントを取得する。

        Args:
            assistant_id: アシスタントID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            該当するアシスタント。存在しない場合はNone。
        """
        stmt = select(Assistant).where(
            Assistant.id == assistant_id, Assistant.tenant_id == tenant_id
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_distinct_index_ids_by_ids(
        assistant_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> list[str]:
        """アシスタントID一覧から、紐づくインデックスID一覧を重複排除して取得する。

        移植元（Spring Boot）の`AssistantSpecification.inGroups`経由で取得した
        アシスタント一覧から`indexId`を抽出する処理に相当。`index_id`カラムのみを
        `IN`句でまとめて取得し、アシスタント本体は取得しないことでN+1を避ける。

        Args:
            assistant_ids: 対象のアシスタントID一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            重複なしのインデックスID一覧（`index_id`がNoneのものは除外）。
        """
        if not assistant_ids:
            return []
        stmt = (
            select(Assistant.index_id)
            .where(
                Assistant.id.in_(assistant_ids),
                Assistant.tenant_id == tenant_id,
                Assistant.index_id.is_not(None),
            )
            .distinct()
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def create(assistant: Assistant, session: AsyncSession) -> Assistant:
        """アシスタントを新規作成する。

        Args:
            assistant: 作成するアシスタント。
            session: 非同期DBセッション。

        Returns:
            作成したアシスタント。
        """
        session.add(assistant)
        await session.commit()
        await session.refresh(assistant)
        return assistant

    @staticmethod
    async def update(assistant: Assistant, session: AsyncSession) -> Assistant:
        """アシスタントを更新する。

        Args:
            assistant: 更新するアシスタント。
            session: 非同期DBセッション。

        Returns:
            更新後のアシスタント。
        """
        session.add(assistant)
        await session.commit()
        await session.refresh(assistant)
        return assistant

    @staticmethod
    async def delete(assistant: Assistant, session: AsyncSession) -> None:
        """アシスタントを削除する。

        Args:
            assistant: 削除するアシスタント。
            session: 非同期DBセッション。
        """
        await session.delete(assistant)
        await session.commit()

    @staticmethod
    async def find_page(
        tenant_id: str,
        search: str | None,
        assistant_type: AssistantType | None,
        category_id: str | None,
        group_id: str | None,
        exclude_group_id: str | None,
        allowed_group_ids: list[str] | None,
        sort_col_name: str,
        sort_dir: str,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> tuple[list[Assistant], int]:
        """管理者向けアシスタント一覧をページネーションで取得する。

        Args:
            tenant_id: テナントID。
            search: 名前・説明の部分一致検索文字列。
            assistant_type: 種別での絞り込み（Noneなら条件なし）。
            category_id: カテゴリでの絞り込み。Noneなら条件なし、"NONE"ならカテゴリ未設定のみ。
            group_id: グループでの絞り込み。Noneなら条件なし、"NONE"なら未所属のみ。
            exclude_group_id: 指定グループに所属していないものに絞り込む（Noneなら条件なし）。
            allowed_group_ids: 絞り込み対象のグループID一覧（グループ管理者が非テナント管理者の場合に指定）。
                Noneの場合は絞り込みなし。空リストの場合は該当なしとして早期リターンする。
            sort_col_name: ソート対象列名（"name"・"type"・"updatedAt"）。
            sort_dir: ソート方向（"asc" または "desc"）。
            page: ページ番号（0始まり）。
            size: 1ページあたりの件数。
            session: 非同期DBセッション。

        Returns:
            (アシスタント一覧, 総件数) のタプル。
        """
        if allowed_group_ids is not None and not allowed_group_ids:
            return [], 0

        stmt = select(Assistant).where(Assistant.tenant_id == tenant_id)

        if assistant_type is not None:
            stmt = stmt.where(Assistant.type == assistant_type)

        if category_id == "NONE":
            stmt = stmt.where(
                ~exists().where(
                    AssistantCategoryMapping.assistant_id == Assistant.id,
                    AssistantCategoryMapping.tenant_id == tenant_id,
                )
            )
        elif category_id is not None:
            stmt = stmt.where(
                exists().where(
                    AssistantCategoryMapping.assistant_id == Assistant.id,
                    AssistantCategoryMapping.category_id == category_id,
                    AssistantCategoryMapping.tenant_id == tenant_id,
                )
            )

        if group_id == "NONE":
            stmt = stmt.where(
                ~exists().where(
                    GroupAssistant.assistant_id == Assistant.id,
                    GroupAssistant.tenant_id == tenant_id,
                )
            )
        elif group_id is not None:
            stmt = stmt.where(
                exists().where(
                    GroupAssistant.assistant_id == Assistant.id,
                    GroupAssistant.group_id == group_id,
                    GroupAssistant.tenant_id == tenant_id,
                )
            )

        if exclude_group_id:
            stmt = stmt.where(
                ~exists().where(
                    GroupAssistant.assistant_id == Assistant.id,
                    GroupAssistant.group_id == exclude_group_id,
                    GroupAssistant.tenant_id == tenant_id,
                )
            )

        if allowed_group_ids is not None:
            stmt = stmt.where(
                exists().where(
                    GroupAssistant.assistant_id == Assistant.id,
                    GroupAssistant.group_id.in_(allowed_group_ids),
                    GroupAssistant.tenant_id == tenant_id,
                )
            )

        if search:
            pattern = escape_like_pattern(search.lower())
            stmt = stmt.where(
                func.lower(Assistant.name).like(pattern, escape="\\")
                | func.lower(Assistant.description).like(pattern, escape="\\")
            )

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await session.execute(count_stmt)).scalar() or 0

        # カテゴリ名でのソート（移植元の`category`エイリアス）はM2Mの多重度により
        # 単純な列ソートに落とし込めないため、更新日時ソートにフォールバックする。
        if sort_col_name == "type":
            sort_col = Assistant.type
        elif sort_col_name == "name":
            sort_col = Assistant.name
        elif sort_col_name == "includeHistory":
            sort_col = Assistant.include_history
        else:
            sort_col = Assistant.updated_at
        stmt = stmt.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())
        stmt = stmt.offset(page * size).limit(size)

        assistants = (await session.execute(stmt)).scalars().all()
        return list(assistants), total
