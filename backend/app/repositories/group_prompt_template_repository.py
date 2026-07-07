from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.group import Group
from app.models.prompt_template import GroupPromptTemplate


class GroupPromptTemplateRepository:
    @staticmethod
    async def find_template_ids_by_group_ids(
        group_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> list[str]:
        """グループID一覧に紐づくプロンプトテンプレートID一覧を重複排除して取得する。

        Args:
            group_ids: 対象のグループID一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            プロンプトテンプレートID一覧（重複なし）。
        """
        if not group_ids:
            return []
        stmt = (
            select(GroupPromptTemplate.prompt_template_id)
            .where(
                GroupPromptTemplate.group_id.in_(group_ids),
                GroupPromptTemplate.tenant_id == tenant_id,
            )
            .distinct()
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def find_groups_grouped_by_template_ids(
        template_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> dict[str, list[tuple[str, str]]]:
        """テンプレートID一覧に対して、それぞれの紐付けグループ (id, name) 一覧を1クエリでまとめて取得する。

        テンプレートごとに個別クエリを発行するとN+1になるため、対象テンプレートID一覧に対する
        (prompt_template_id, group_id, group_name) の組を1クエリで取得しPython側で集約する。

        Args:
            template_ids: 対象のプロンプトテンプレートID一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            プロンプトテンプレートIDをキーとした (グループID, グループ名) 一覧の辞書。
        """
        if not template_ids:
            return {}
        stmt = (
            select(
                GroupPromptTemplate.prompt_template_id,
                Group.id,
                Group.name,
            )
            .join(Group, Group.id == GroupPromptTemplate.group_id)
            .where(
                GroupPromptTemplate.prompt_template_id.in_(template_ids),
                GroupPromptTemplate.tenant_id == tenant_id,
            )
        )
        result = await session.execute(stmt)

        grouped: dict[str, list[tuple[str, str]]] = {
            template_id: [] for template_id in template_ids
        }
        for template_id, group_id, group_name in result.all():
            grouped[template_id].append((group_id, group_name))
        return grouped

    @staticmethod
    async def replace_groups_for_template(
        template_id: str,
        tenant_id: str,
        group_ids: set[str],
        session: AsyncSession,
    ) -> None:
        """対象テンプレートの既存グループ紐付けを全削除し、指定グループ集合で置き換える。

        コミットは呼び出し側で行う。

        Args:
            template_id: 対象のプロンプトテンプレートID。
            tenant_id: テナントID。
            group_ids: 紐付け先のグループID集合（実在確認済みのものを渡すこと）。
            session: 非同期DBセッション。
        """
        stmt = select(GroupPromptTemplate).where(
            GroupPromptTemplate.prompt_template_id == template_id,
            GroupPromptTemplate.tenant_id == tenant_id,
        )
        existing = (await session.execute(stmt)).scalars().all()
        for row in existing:
            await session.delete(row)

        for group_id in group_ids:
            session.add(
                GroupPromptTemplate(
                    group_id=group_id,
                    prompt_template_id=template_id,
                    tenant_id=tenant_id,
                )
            )
