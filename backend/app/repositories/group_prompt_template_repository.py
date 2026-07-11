from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.search import escape_like_pattern
from app.models.group import Group
from app.models.prompt_template import GroupPromptTemplate, PromptTemplate


class GroupPromptTemplateRepository:
    @staticmethod
    async def find_one(
        group_id: str, tenant_id: str, template_id: str, session: AsyncSession
    ) -> GroupPromptTemplate | None:
        """グループ・テンプレートの組み合わせでGroupPromptTemplateを取得する。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            template_id: プロンプトテンプレートID。
            session: 非同期DBセッション。

        Returns:
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
        sort_col_name: str,
        sort_dir: str,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> tuple[list[tuple[GroupPromptTemplate, PromptTemplate]], int]:
        """グループに紐づくプロンプトテンプレートをページネーションで取得する（PromptTemplateを結合）。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            search: テンプレート名・説明の部分一致検索文字列。
            sort_col_name: ソート対象列名（"name" または "addedAt"）。
            sort_dir: ソート方向（"asc" または "desc"）。
            page: ページ番号（0始まり）。
            size: 1ページあたりの件数。
            session: 非同期DBセッション。

        Returns:
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

        sort_col = (
            PromptTemplate.name
            if sort_col_name == "name"
            else GroupPromptTemplate.updated_at
        )
        stmt = stmt.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())
        stmt = stmt.offset(page * size).limit(size)

        rows = (await session.execute(stmt)).all()
        return [(row[0], row[1]) for row in rows], total

    @staticmethod
    def add(
        group_id: str, tenant_id: str, template_id: str, session: AsyncSession
    ) -> None:
        """グループにプロンプトテンプレートを追加する（セッションに登録するのみ。コミットは呼び出し側で行う）。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            template_id: 追加するプロンプトテンプレートID。
            session: 非同期DBセッション。
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

        Args:
            group_prompt_template: 削除対象の GroupPromptTemplate。
            session: 非同期DBセッション。
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
    async def find_grouped_by_group_ids(
        group_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> dict[str, list[tuple[str, str]]]:
        """グループID一覧に対して、それぞれに紐づくプロンプトテンプレート (id, name) 一覧を1クエリでまとめて取得する。

        グループごとに個別クエリを発行するとN+1になるため、対象グループID一覧に対する
        (group_id, prompt_template_id, prompt_template_name) の組を1クエリで取得しPython側で集約する。

        Args:
            group_ids: 対象のグループID一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
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

        Args:
            template_id: 対象のプロンプトテンプレートID。
            tenant_id: テナントID。
            group_ids: 紐付け先のグループID集合（実在確認済みのものを渡すこと）。
            session: 非同期DBセッション。
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
