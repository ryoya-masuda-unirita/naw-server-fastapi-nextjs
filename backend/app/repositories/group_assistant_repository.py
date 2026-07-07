from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assistant import GroupAssistant


class GroupAssistantRepository:
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
