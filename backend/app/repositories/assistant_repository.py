from collections.abc import Sequence
from typing import Any

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.search import escape_like_pattern
from app.core.sort import SortOrder, build_order_by, enum_as_string
from app.models.assistant import (
    Assistant,
    AssistantCategoryMapping,
    AssistantType,
    GroupAssistant,
)
from app.repositories.assistant_category_mapping_repository import (
    PRIMARY_CATEGORY_NAME,
)

# 移植元は種別を varchar で持つため、宣言順ではなく文字列順で並べる
_TYPE_SORT_COLUMN: Any = enum_as_string(Assistant.type)

# 移植元PageableSortUtil.remapSortのフロントエンド向けソートキーエイリアスを含む対応表。
# secuaigent-client（AssistantSortField）は実際に"assistantType"を送信するため、
# アシスタント種別の列に対応づける。"serverType"・"server"は移植元Javaのマップに
# 存在した別名で、念のため同様に扱う。
# "category"（カテゴリ名順）は移植元と同じく、先頭カテゴリ（カテゴリID昇順）の名前で並べる。
# 移植元は結合で行が重複しうるが、こちらは副問い合わせで1アシスタント1行に保つ。
# 対応表にないキーは更新日時順にする。
_SORT_COLUMNS: dict[str, Any] = {
    "name": Assistant.name,
    "type": _TYPE_SORT_COLUMN,
    "assistantType": _TYPE_SORT_COLUMN,
    "serverType": _TYPE_SORT_COLUMN,
    "server": _TYPE_SORT_COLUMN,
    "includeHistory": Assistant.include_history,
    "updatedAt": Assistant.updated_at,
    "category": PRIMARY_CATEGORY_NAME,
}


class AssistantRepository:
    """アシスタントのDBアクセスをまとめたリポジトリ。"""

    @staticmethod
    async def find_by_ids_and_tenant_id(
        assistant_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> list[Assistant]:
        """アシスタントID一覧とテナントIDでアシスタントを取得する。

        Parameters
        ----------
        assistant_ids : list[str]
            取得対象のアシスタントID一覧。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        list[Assistant]
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

        Parameters
        ----------
        assistant_id : str
            アシスタントID。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        Assistant | None
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

        Parameters
        ----------
        assistant_ids : list[str]
            対象のアシスタントID一覧。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        list[str]
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

        Parameters
        ----------
        assistant : Assistant
            作成するアシスタント。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        Assistant
            作成したアシスタント。
        """
        session.add(assistant)
        await session.commit()
        await session.refresh(assistant)
        return assistant

    @staticmethod
    async def update(assistant: Assistant, session: AsyncSession) -> Assistant:
        """アシスタントを更新する。

        Parameters
        ----------
        assistant : Assistant
            更新するアシスタント。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        Assistant
            更新後のアシスタント。
        """
        session.add(assistant)
        await session.commit()
        await session.refresh(assistant)
        return assistant

    @staticmethod
    async def delete(assistant: Assistant, session: AsyncSession) -> None:
        """アシスタントを削除する。

        Parameters
        ----------
        assistant : Assistant
            削除するアシスタント。
        session : AsyncSession
            非同期DBセッション。
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
        sort: Sequence[SortOrder],
        page: int,
        size: int,
        session: AsyncSession,
    ) -> tuple[list[Assistant], int]:
        """管理者向けアシスタント一覧をページネーションで取得する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        search : str | None
            名前・説明の部分一致検索文字列。
        assistant_type : AssistantType | None
            種別での絞り込み（Noneなら条件なし）。
        category_id : str | None
            カテゴリでの絞り込み。Noneなら条件なし、"NONE"ならカテゴリ未設定のみ。
        group_id : str | None
            グループでの絞り込み。Noneなら条件なし、"NONE"なら未所属のみ。
        exclude_group_id : str | None
            指定グループに所属していないものに絞り込む（Noneなら条件なし）。
        allowed_group_ids : list[str] | None
            絞り込み対象のグループID一覧（グループ管理者が非テナント管理者の場合に指定）。
            Noneの場合は絞り込みなし。空リストの場合は該当なしとして早期リターンする。
        sort : Sequence[SortOrder]
            並べ替え指定の並び（キーは"name"・"type"・"updatedAt"など）。
        page : int
            ページ番号（0始まり）。
        size : int
            1ページあたりの件数。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        tuple[list[Assistant], int]
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

        # 同名・同時刻のアシスタントの並びが不定にならないよう、IDを最終キーにする
        stmt = stmt.order_by(
            *build_order_by(
                sort,
                _SORT_COLUMNS,
                fallback=Assistant.updated_at,
                tie_breaker=Assistant.id,
            )
        )
        stmt = stmt.offset(page * size).limit(size)

        assistants = (await session.execute(stmt)).scalars().all()
        return list(assistants), total
