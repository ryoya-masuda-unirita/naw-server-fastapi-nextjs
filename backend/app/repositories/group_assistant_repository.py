from sqlalchemy import delete, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.search import escape_like_pattern
from app.models.assistant import (
    Assistant,
    AssistantCategoryMapping,
    AssistantType,
    GroupAssistant,
)


class GroupAssistantRepository:
    @staticmethod
    async def find_one(
        group_id: str, tenant_id: str, assistant_id: str, session: AsyncSession
    ) -> GroupAssistant | None:
        """グループ・アシスタントの組み合わせでGroupAssistantを取得する。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            assistant_id: アシスタントID。
            session: 非同期DBセッション。

        Returns:
            該当する GroupAssistant。存在しない場合は None。
        """
        stmt = select(GroupAssistant).where(
            GroupAssistant.group_id == group_id,
            GroupAssistant.tenant_id == tenant_id,
            GroupAssistant.assistant_id == assistant_id,
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_page_by_group(
        group_id: str,
        tenant_id: str,
        assistant_type: AssistantType | None,
        category_id: str | None,
        search: str | None,
        sort_col_name: str,
        sort_dir: str,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> tuple[list[tuple[GroupAssistant, Assistant]], int]:
        """グループに紐づくアシスタントをページネーションで取得する（Assistantを結合）。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            assistant_type: アシスタント種別での絞り込み。
            category_id: カテゴリでの絞り込み。Noneなら条件なし、"NONE"ならカテゴリ未設定のみ。
            search: アシスタント名・説明の部分一致検索文字列。
            sort_col_name: ソート対象列名（"name"・"type"・"addedAt"など）。
            sort_dir: ソート方向（"asc" または "desc"）。
            page: ページ番号（0始まり）。
            size: 1ページあたりの件数。
            session: 非同期DBセッション。

        Returns:
            ((GroupAssistant, Assistant) のリスト, 総件数) のタプル。
        """
        stmt = (
            select(GroupAssistant, Assistant)
            .join(Assistant, Assistant.id == GroupAssistant.assistant_id)
            .where(
                GroupAssistant.group_id == group_id,
                GroupAssistant.tenant_id == tenant_id,
                Assistant.tenant_id == tenant_id,
            )
        )

        if assistant_type is not None:
            stmt = stmt.where(Assistant.type == assistant_type)

        if category_id == "NONE":
            stmt = stmt.where(
                ~exists().where(
                    AssistantCategoryMapping.assistant_id == Assistant.id,
                    AssistantCategoryMapping.tenant_id == tenant_id,
                )
            )
        elif category_id:
            stmt = stmt.where(
                exists().where(
                    AssistantCategoryMapping.assistant_id == Assistant.id,
                    AssistantCategoryMapping.category_id == category_id,
                    AssistantCategoryMapping.tenant_id == tenant_id,
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

        if sort_col_name in {"name", "assistant.name"}:
            sort_col = Assistant.name
        elif sort_col_name in {"type", "server", "assistantType"}:
            sort_col = Assistant.type
        else:
            sort_col = GroupAssistant.updated_at
        stmt = stmt.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())
        stmt = stmt.offset(page * size).limit(size)

        rows = (await session.execute(stmt)).all()
        return [(row[0], row[1]) for row in rows], total

    @staticmethod
    def add(
        group_id: str, tenant_id: str, assistant_id: str, session: AsyncSession
    ) -> None:
        """グループにアシスタントを追加する（セッションに登録するのみ。コミットは呼び出し側で行う）。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            assistant_id: 追加するアシスタントID。
            session: 非同期DBセッション。
        """
        session.add(
            GroupAssistant(
                group_id=group_id, tenant_id=tenant_id, assistant_id=assistant_id
            )
        )

    @staticmethod
    async def remove(group_assistant: GroupAssistant, session: AsyncSession) -> None:
        """グループからアシスタントを除外する。

        Args:
            group_assistant: 削除対象の GroupAssistant。
            session: 非同期DBセッション。
        """
        await session.delete(group_assistant)
        await session.commit()

    @staticmethod
    async def find_assistant_ids_by_group_ids(
        group_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> list[str]:
        """グループID一覧に紐づくアシスタントID一覧を重複排除して取得する。

        Args:
            group_ids: 対象のグループID一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            アシスタントID一覧（重複なし）。
        """
        if not group_ids:
            return []
        stmt = (
            select(GroupAssistant.assistant_id)
            .where(
                GroupAssistant.group_id.in_(group_ids),
                GroupAssistant.tenant_id == tenant_id,
            )
            .distinct()
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def find_group_ids_grouped_by_assistant_id(
        assistant_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> dict[str, list[str]]:
        """アシスタントID一覧に対して、それぞれの所属グループID一覧を1クエリでまとめて取得する。

        アシスタントごとに個別クエリを発行するとN+1になるため、対象アシスタントID一覧に対する
        (assistant_id, group_id) のペアを1クエリで取得しPython側で集約する。

        Args:
            assistant_ids: 対象のアシスタントID一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            アシスタントIDをキーとしたグループID一覧の辞書。
        """
        if not assistant_ids:
            return {}
        stmt = select(GroupAssistant.assistant_id, GroupAssistant.group_id).where(
            GroupAssistant.assistant_id.in_(assistant_ids),
            GroupAssistant.tenant_id == tenant_id,
        )
        result = await session.execute(stmt)

        grouped: dict[str, list[str]] = {
            assistant_id: [] for assistant_id in assistant_ids
        }
        for assistant_id, group_id in result.all():
            grouped[assistant_id].append(group_id)
        return grouped

    @staticmethod
    async def find_grouped_by_group_ids(
        group_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> dict[str, list[tuple[str, str]]]:
        """グループID一覧に対して、それぞれに紐づくアシスタント (id, name) 一覧を1クエリでまとめて取得する。

        グループごとに個別クエリを発行するとN+1になるため、対象グループID一覧に対する
        (group_id, assistant_id, assistant_name) の組を1クエリで取得しPython側で集約する。

        Args:
            group_ids: 対象のグループID一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            グループIDをキーとした (アシスタントID, アシスタント名) 一覧の辞書。
        """
        if not group_ids:
            return {}
        stmt = (
            select(GroupAssistant.group_id, Assistant.id, Assistant.name)
            .join(Assistant, Assistant.id == GroupAssistant.assistant_id)
            .where(
                GroupAssistant.group_id.in_(group_ids),
                GroupAssistant.tenant_id == tenant_id,
                Assistant.tenant_id == tenant_id,
            )
        )
        result = await session.execute(stmt)

        grouped: dict[str, list[tuple[str, str]]] = {gid: [] for gid in group_ids}
        for group_id, assistant_id, assistant_name in result.all():
            grouped[group_id].append((assistant_id, assistant_name))
        return grouped

    @staticmethod
    async def replace_groups_for_assistant(
        assistant_id: str,
        tenant_id: str,
        group_ids: set[str],
        session: AsyncSession,
    ) -> None:
        """対象アシスタントの既存グループ紐付けを全削除し、指定グループ集合で置き換える。

        コミットは呼び出し側で行う。

        Args:
            assistant_id: 対象のアシスタントID。
            tenant_id: テナントID。
            group_ids: 紐付け先のグループID集合（実在確認済みのものを渡すこと）。
            session: 非同期DBセッション。
        """
        await session.execute(
            delete(GroupAssistant).where(
                GroupAssistant.assistant_id == assistant_id,
                GroupAssistant.tenant_id == tenant_id,
            )
        )

        for group_id in group_ids:
            session.add(
                GroupAssistant(
                    group_id=group_id,
                    assistant_id=assistant_id,
                    tenant_id=tenant_id,
                )
            )
