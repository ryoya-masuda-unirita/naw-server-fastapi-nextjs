from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.core.search import escape_like_pattern
from app.models.file import File, FileStatus

_ORDER_BY_COLUMNS: dict[str, InstrumentedAttribute] = {
    "displayName": File.display_name,
    "updatedAt": File.updated_at,
}


class FileRepository:
    @staticmethod
    async def find_by_id_and_tenant_id(
        file_id: str, tenant_id: str, session: AsyncSession
    ) -> File | None:
        """ファイルIDとテナントIDでファイルを取得する。

        Args:
            file_id: ファイルID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            該当する File。存在しない場合は None。
        """
        stmt = select(File).where(File.id == file_id, File.tenant_id == tenant_id)
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_by_ids_and_tenant_id(
        file_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> list[File]:
        """ファイルID一覧とテナントIDでファイルをまとめて取得する。

        RAGのベクトル検索結果に対応するファイルを解決する際、結果件数分の
        個別クエリ（N+1）を発行しないよう、対象ファイルID一覧を1クエリでまとめて取得する。

        Args:
            file_ids: 取得対象のファイルID一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            該当するファイル一覧。
        """
        if not file_ids:
            return []
        stmt = select(File).where(File.id.in_(file_ids), File.tenant_id == tenant_id)
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    def _apply_name_filter(
        stmt: sa.Select, display_name: str | None, file_name: str | None
    ) -> sa.Select:
        """`displayName`/`fileName`による絞り込みを組み立てる。

        移植元（Spring Boot）`FileService.searchFiles`と同様、両方が指定され同一文字列
        の場合は`name`/`displayName`のいずれかに部分一致するものをOR結合で検索し、
        それ以外は個別条件（`displayName`は`display_name`列、`fileName`は`name`/
        `display_name`列へのOR部分一致）として扱う。

        Args:
            stmt: 組み立て対象のクエリ。
            display_name: 表示名の部分一致検索文字列。
            file_name: ファイル名の部分一致検索文字列。

        Returns:
            絞り込み条件を追加したクエリ。
        """
        if display_name and file_name and display_name == file_name:
            pattern = escape_like_pattern(display_name.lower())
            return stmt.where(
                func.lower(File.name).like(pattern, escape="\\")
                | func.lower(File.display_name).like(pattern, escape="\\")
            )

        if display_name:
            pattern = escape_like_pattern(display_name.lower())
            stmt = stmt.where(func.lower(File.display_name).like(pattern, escape="\\"))
        if file_name:
            pattern = escape_like_pattern(file_name.lower())
            stmt = stmt.where(
                func.lower(File.name).like(pattern, escape="\\")
                | func.lower(File.display_name).like(pattern, escape="\\")
            )
        return stmt

    @staticmethod
    async def find_page(
        index_id: str,
        tenant_id: str,
        display_name: str | None,
        file_name: str | None,
        user_id: object | None,
        status: FileStatus | None,
        updated_at_from: datetime | None,
        updated_at_to: datetime | None,
        sort_col_name: str,
        sort_dir: str,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> tuple[list[File], int]:
        """ファイル一覧をページネーションで取得する（移植元`FileService.searchFiles`相当）。

        Args:
            index_id: インデックスID。
            tenant_id: テナントID。
            display_name: 表示名の部分一致検索文字列。
            file_name: ファイル名の部分一致検索文字列。
            user_id: 絞り込み対象のユーザーID（解決済みUUID）。Noneなら絞り込まない。
            status: 絞り込み対象のステータス。Noneなら絞り込まない。
            updated_at_from: 更新日時の範囲開始（この値以上）。
            updated_at_to: 更新日時の範囲終了（この値以下）。
            sort_col_name: ソート対象列名（"displayName"または"updatedAt"）。
            sort_dir: ソート方向（"asc"または"desc"）。
            page: ページ番号（0始まり）。
            size: 1ページあたりの件数。
            session: 非同期DBセッション。

        Returns:
            (ファイル一覧, 総件数) のタプル。
        """
        stmt = select(File).where(
            File.tenant_id == tenant_id, File.index_id == index_id
        )
        stmt = FileRepository._apply_name_filter(stmt, display_name, file_name)
        if user_id is not None:
            stmt = stmt.where(File.user_id == user_id)
        if status is not None:
            stmt = stmt.where(File.status == status)
        if updated_at_from is not None:
            stmt = stmt.where(File.updated_at >= updated_at_from)
        if updated_at_to is not None:
            stmt = stmt.where(File.updated_at <= updated_at_to)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await session.execute(count_stmt)).scalar() or 0

        sort_col = _ORDER_BY_COLUMNS.get(sort_col_name, File.updated_at)
        stmt = stmt.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())
        stmt = stmt.offset(page * size).limit(size)

        files = (await session.execute(stmt)).scalars().all()
        return list(files), total

    @staticmethod
    async def create(file: File, session: AsyncSession) -> File:
        """ファイルを新規作成する。

        Args:
            file: 保存対象の File。
            session: 非同期DBセッション。

        Returns:
            保存後の File。
        """
        session.add(file)
        await session.commit()
        await session.refresh(file)
        return file

    @staticmethod
    async def save(file: File, session: AsyncSession) -> File:
        """ファイルの変更を永続化する。

        Args:
            file: 更新対象の File（属性は呼び出し側で変更済み）。
            session: 非同期DBセッション。

        Returns:
            更新後の File。
        """
        session.add(file)
        await session.commit()
        await session.refresh(file)
        return file

    @staticmethod
    async def delete(file: File, session: AsyncSession) -> None:
        """ファイルを物理削除する。

        Args:
            file: 削除対象の File。
            session: 非同期DBセッション。
        """
        await session.delete(file)
        await session.commit()
