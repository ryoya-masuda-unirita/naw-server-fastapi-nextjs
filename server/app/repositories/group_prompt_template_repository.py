from collections.abc import Sequence
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.search import escape_like_pattern
from app.core.sort import SortOrder, build_order_by
from app.models.group import Group
from app.models.prompt_template import GroupPromptTemplate, PromptTemplate

# 移植元(GroupService)は addedAt を所属レコードの更新日時、name をテンプレート名に読み替える。
# 対応表にないキーは従来どおり追加日時順にする。
_SORT_COLUMNS: dict[str, Any] = {
    "name": PromptTemplate.name,
    "addedAt": GroupPromptTemplate.updated_at,
}


class GroupPromptTemplateRepository:
    """グループとプロンプトテンプレートの紐付けのDBアクセスをまとめたリポジトリ。"""

    @staticmethod
    async def find_one(
        group_id: str, tenant_id: str, template_id: str, session: AsyncSession
    ) -> GroupPromptTemplate | None:
        """グループ・テンプレートの組み合わせでGroupPromptTemplateを取得する。

        Parameters
        ----------
        group_id : str
            グループID。
        tenant_id : str
            テナントID。
        template_id : str
            プロンプトテンプレートID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        GroupPromptTemplate | None
            該当する GroupPromptTemplate。存在しない場合は None。
        """
        stmt = select(GroupPromptTemplate).where(
            GroupPromptTemplate.group_id == group_id,
            GroupPromptTemplate.tenant_id == tenant_id,
            GroupPromptTemplate.prompt_template_id == template_id,
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_page_by_group(
        group_id: str,
        tenant_id: str,
        search: str | None,
        sort: Sequence[SortOrder],
        page: int,
        size: int,
        session: AsyncSession,
    ) -> tuple[list[tuple[GroupPromptTemplate, PromptTemplate]], int]:
        """グループに紐づくプロンプトテンプレートをページネーションで取得する（PromptTemplateを結合）。

        Parameters
        ----------
        group_id : str
            グループID。
        tenant_id : str
            テナントID。
        search : str | None
            テンプレート名・説明の部分一致検索文字列。
        sort : Sequence[SortOrder]
            並べ替え指定の並び（キーは"name"・"addedAt"。それ以外は追加日時順）。
        page : int
            ページ番号（0始まり）。
        size : int
            1ページあたりの件数。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        tuple[list[tuple[GroupPromptTemplate, PromptTemplate]], int]
            ((GroupPromptTemplate, PromptTemplate) のリスト, 総件数) のタプル。
        """
        stmt = (
            select(GroupPromptTemplate, PromptTemplate)
            .join(
                PromptTemplate,
                PromptTemplate.id == GroupPromptTemplate.prompt_template_id,
            )
            .where(
                GroupPromptTemplate.group_id == group_id,
                GroupPromptTemplate.tenant_id == tenant_id,
            )
        )

        if search:
            pattern = escape_like_pattern(search.lower())
            stmt = stmt.where(
                func.lower(PromptTemplate.name).like(pattern, escape="\\")
                | func.lower(PromptTemplate.description).like(pattern, escape="\\")
            )

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await session.execute(count_stmt)).scalar() or 0

        # 同名・同時刻のテンプレートの並びが不定にならないよう、IDを最終キーにする
        stmt = stmt.order_by(
            *build_order_by(
                sort,
                _SORT_COLUMNS,
                fallback=GroupPromptTemplate.updated_at,
                tie_breaker=GroupPromptTemplate.prompt_template_id,
            )
        )
        stmt = stmt.offset(page * size).limit(size)

        rows = (await session.execute(stmt)).all()
        return [(row[0], row[1]) for row in rows], total

    @staticmethod
    def add(
        group_id: str, tenant_id: str, template_id: str, session: AsyncSession
    ) -> None:
        """グループにプロンプトテンプレートを追加する（セッションに登録するのみ。コミットは呼び出し側で行う）。

        Parameters
        ----------
        group_id : str
            グループID。
        tenant_id : str
            テナントID。
        template_id : str
            追加するプロンプトテンプレートID。
        session : AsyncSession
            非同期DBセッション。
        """
        session.add(
            GroupPromptTemplate(
                group_id=group_id, tenant_id=tenant_id, prompt_template_id=template_id
            )
        )

    @staticmethod
    async def remove(
        group_prompt_template: GroupPromptTemplate, session: AsyncSession
    ) -> None:
        """グループからプロンプトテンプレートを除外する。

        Parameters
        ----------
        group_prompt_template : GroupPromptTemplate
            削除対象の GroupPromptTemplate。
        session : AsyncSession
            非同期DBセッション。
        """
        await session.delete(group_prompt_template)
        await session.commit()

    @staticmethod
    async def find_groups_grouped_by_template_ids(
        template_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> dict[str, list[tuple[str, str]]]:
        """テンプレートID一覧に対して、それぞれの紐付けグループ (id, name) 一覧を1クエリでまとめて取得する。

        テンプレートごとに個別クエリを発行するとN+1になるため、対象テンプレートID一覧に対する
        (prompt_template_id, group_id, group_name) の組を1クエリで取得しPython側で集約する。

        Parameters
        ----------
        template_ids : list[str]
            対象のプロンプトテンプレートID一覧。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        dict[str, list[tuple[str, str]]]
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
    async def find_grouped_by_group_ids(
        group_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> dict[str, list[tuple[str, str]]]:
        """グループID一覧に対して、それぞれに紐づくプロンプトテンプレート (id, name) 一覧を1クエリでまとめて取得する。

        グループごとに個別クエリを発行するとN+1になるため、対象グループID一覧に対する
        (group_id, prompt_template_id, prompt_template_name) の組を1クエリで取得しPython側で集約する。

        Parameters
        ----------
        group_ids : list[str]
            対象のグループID一覧。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        dict[str, list[tuple[str, str]]]
            グループIDをキーとした (プロンプトテンプレートID, プロンプトテンプレート名) 一覧の辞書。
        """
        if not group_ids:
            return {}
        stmt = (
            select(
                GroupPromptTemplate.group_id,
                PromptTemplate.id,
                PromptTemplate.name,
            )
            .join(
                PromptTemplate,
                PromptTemplate.id == GroupPromptTemplate.prompt_template_id,
            )
            .where(
                GroupPromptTemplate.group_id.in_(group_ids),
                GroupPromptTemplate.tenant_id == tenant_id,
                PromptTemplate.tenant_id == tenant_id,
            )
        )
        result = await session.execute(stmt)

        grouped: dict[str, list[tuple[str, str]]] = {gid: [] for gid in group_ids}
        for group_id, template_id, template_name in result.all():
            grouped[group_id].append((template_id, template_name))
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

        Parameters
        ----------
        template_id : str
            対象のプロンプトテンプレートID。
        tenant_id : str
            テナントID。
        group_ids : set[str]
            紐付け先のグループID集合（実在確認済みのものを渡すこと）。
        session : AsyncSession
            非同期DBセッション。
        """
        await session.execute(
            delete(GroupPromptTemplate).where(
                GroupPromptTemplate.prompt_template_id == template_id,
                GroupPromptTemplate.tenant_id == tenant_id,
            )
        )

        # session.add()はここではSQLを発行せず、commit/flush時にSQLAlchemyの
        # insertmanyvaluesにより複数行が1回のINSERTにまとめられるため、
        # ループしてもN回のラウンドトリップにはならない。
        for group_id in group_ids:
            session.add(
                GroupPromptTemplate(
                    group_id=group_id,
                    prompt_template_id=template_id,
                    tenant_id=tenant_id,
                )
            )
