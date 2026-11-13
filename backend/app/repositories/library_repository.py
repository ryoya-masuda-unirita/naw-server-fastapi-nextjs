import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.search import escape_like_pattern
from app.models.group import GroupUser
from app.models.library import (
    Library,
    LibraryContent,
    LibraryTagMapping,
    ShareLibrary,
)
from app.models.message import Message
from app.models.user import User


def _visible_library_ids_subquery(tenant_id: str, current_user_id: uuid.UUID):
    """指定ユーザーの所属グループに共有されたライブラリID一覧を返すサブクエリを組み立てる。

    「所有 or 共有先グループ所属」の可視性判定で共通して使う（`find_page`・
    `is_visible_to_user`の両方から呼ばれる）。

    Parameters
    ----------
    tenant_id : str
        テナントID。
    current_user_id : uuid.UUID
        判定対象のユーザーID。

    Returns
    -------
    object
        可視なライブラリID一覧を返すサブクエリ。
    """
    return (
        select(ShareLibrary.library_id)
        .join(
            GroupUser,
            (GroupUser.group_id == ShareLibrary.group_id)
            & (GroupUser.tenant_id == ShareLibrary.tenant_id),
        )
        .where(
            ShareLibrary.tenant_id == tenant_id,
            GroupUser.user_id == current_user_id,
        )
    )


class LibraryRepository:
    """ライブラリのDBアクセスを行うリポジトリ。"""

    @staticmethod
    async def find_by_id_and_tenant_id(
        library_id: uuid.UUID, tenant_id: str, session: AsyncSession
    ) -> Library | None:
        """ライブラリIDとテナントIDでライブラリを取得する。

        Parameters
        ----------
        library_id : uuid.UUID
            対象のライブラリID。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        Library | None
            該当するライブラリ。存在しない場合はNone。
        """
        stmt = select(Library).where(
            Library.id == library_id, Library.tenant_id == tenant_id
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_page(
        tenant_id: str,
        current_user_id: uuid.UUID,
        page: int,
        size: int,
        title: str | None,
        created_by: str | None,
        exclude_created_by: str | None,
        tag_ids: list[uuid.UUID] | None,
        sort_by: str,
        sort_dir: str,
        session: AsyncSession,
    ) -> tuple[list[Library], int]:
        """自身が作成または所属グループに共有されたライブラリをページング・絞り込み付きで取得する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        current_user_id : uuid.UUID
            現在のログインユーザーID（可視性判定・所有者判定に使用）。
        page : int
            0始まりのページ番号。
        size : int
            1ページあたりの件数。
        title : str | None
            タイトルの部分一致検索文字列。Noneまたは空文字なら絞り込まない。
        created_by : str | None
            作成者のloginId。指定時はこの作成者のもののみに絞り込む。
        exclude_created_by : str | None
            除外する作成者のloginId。指定時はこの作成者以外に絞り込む。
        tag_ids : list[uuid.UUID] | None
            絞り込み対象のタグID一覧。指定時はこのいずれかのタグが付与されたもののみ。
        sort_by : str
            ソート対象列名（"title"以外は"updatedAt"扱い）。
        sort_dir : str
            ソート方向（"asc"以外は"desc"扱い）。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        tuple[list[Library], int]
            (該当ページのライブラリ一覧, 全体件数) のタプル。
        """
        visible_group_ids_subquery = _visible_library_ids_subquery(
            tenant_id, current_user_id
        )

        conditions = [
            Library.tenant_id == tenant_id,
            # 移植元 titleIsNotNull: スタブ（タイトル未確定）は一覧に出さない
            Library.title.is_not(None),
            (Library.user_id == current_user_id)
            | (Library.id.in_(visible_group_ids_subquery)),
        ]

        if title:
            conditions.append(
                func.lower(Library.title).like(
                    escape_like_pattern(title.lower()), escape="\\"
                )
            )

        if created_by:
            created_by_subquery = select(User.id).where(
                User.login_id == created_by, User.tenant_id == tenant_id
            )
            conditions.append(Library.user_id.in_(created_by_subquery))

        if exclude_created_by:
            exclude_subquery = select(User.id).where(
                User.login_id == exclude_created_by, User.tenant_id == tenant_id
            )
            conditions.append(Library.user_id.not_in(exclude_subquery))

        if tag_ids:
            # library_tag_id は String(32) でハイフンなしhexを保存している。UUIDのまま
            # in_() に渡すとバインド型がUuidと推論され、PostgreSQLでは
            # `varchar = uuid` の型不一致になるため、保存形式の文字列に揃えて比較する。
            tag_id_hexes = [tag_id.hex for tag_id in tag_ids]
            tag_subquery = select(LibraryTagMapping.library_id).where(
                LibraryTagMapping.library_tag_id.in_(tag_id_hexes),
                LibraryTagMapping.tenant_id == tenant_id,
            )
            conditions.append(Library.id.in_(tag_subquery))

        count_stmt = select(func.count()).select_from(Library).where(*conditions)
        total = (await session.execute(count_stmt)).scalar_one()

        sort_column = Library.title if sort_by == "title" else Library.updated_at
        order = sort_column.asc() if sort_dir.lower() == "asc" else sort_column.desc()

        stmt = (
            select(Library)
            .where(*conditions)
            .order_by(order)
            .offset(page * size)
            .limit(size)
        )
        result = await session.execute(stmt)
        return list(result.scalars().all()), total

    @staticmethod
    async def find_by_room_id_and_tenant_id(
        room_id: str, tenant_id: str, session: AsyncSession
    ) -> list[Library]:
        """ルームに紐づくライブラリ一覧を作成日時昇順で取得する。

        Parameters
        ----------
        room_id : str
            対象のルームID。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        list[Library]
            作成日時昇順のライブラリ一覧。
        """
        message_id_subquery = select(Message.id).where(
            Message.room_id == room_id, Message.tenant_id == tenant_id
        )
        stmt = (
            select(Library)
            .where(
                Library.message_id.in_(message_id_subquery),
                Library.tenant_id == tenant_id,
                Library.title.is_not(None),
            )
            .order_by(Library.created_at.asc())
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def is_visible_to_user(
        library_id: uuid.UUID,
        tenant_id: str,
        current_user_id: uuid.UUID,
        session: AsyncSession,
    ) -> bool:
        """ライブラリが指定ユーザーから見て可視かどうかを判定する（所有者 or 共有先グループ所属）。

        Parameters
        ----------
        library_id : uuid.UUID
            対象のライブラリID。
        tenant_id : str
            テナントID。
        current_user_id : uuid.UUID
            判定対象のユーザーID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        bool
            可視であればTrue。
        """
        visible_group_ids_subquery = _visible_library_ids_subquery(
            tenant_id, current_user_id
        )
        stmt = (
            select(func.count())
            .select_from(Library)
            .where(
                Library.id == library_id,
                Library.tenant_id == tenant_id,
                (Library.user_id == current_user_id)
                | (Library.id.in_(visible_group_ids_subquery)),
            )
        )
        result = await session.execute(stmt)
        return (result.scalar_one() or 0) > 0

    @staticmethod
    async def save(library: Library, session: AsyncSession) -> Library:
        """ライブラリをセッションに登録し、コミットする。

        Parameters
        ----------
        library : Library
            保存対象のライブラリ（新規または既存インスタンス）。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        Library
            保存後のライブラリ。
        """
        session.add(library)
        await session.commit()
        await session.refresh(library)
        return library

    @staticmethod
    async def create_with_content(
        library: Library, content: str, session: AsyncSession
    ) -> Library:
        """ライブラリと本文を1回のコミットでまとめて保存する。

        移植元`persistLibrary`と同じく、ライブラリと本文を同じトランザクションで保存する。

        Parameters
        ----------
        library : Library
            保存するライブラリ（新規）。
        content : str
            ライブラリの本文。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        Library
            保存後のライブラリ。
        """
        session.add(library)
        # ORMの関連を定義していないため、外部キーの親を先にINSERTさせる
        await session.flush()
        session.add(
            LibraryContent(
                library_id=library.id, tenant_id=library.tenant_id, content=content
            )
        )
        await session.commit()
        await session.refresh(library)
        return library

    @staticmethod
    async def delete(library: Library, session: AsyncSession) -> None:
        """ライブラリを削除する。

        共有先グループ・タグ紐づけはDBの`ON DELETE CASCADE`で連動削除される。

        Parameters
        ----------
        library : Library
            削除対象のライブラリ。
        session : AsyncSession
            非同期DBセッション。
        """
        await session.delete(library)
        await session.commit()
