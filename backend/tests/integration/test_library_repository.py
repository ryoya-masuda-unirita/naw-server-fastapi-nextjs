import uuid
from typing import cast

import sqlalchemy as sa
from sqlalchemy import event
from sqlalchemy.dialects.postgresql import asyncpg
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import ORMExecuteState
from sqlalchemy.sql import operators, visitors
from sqlalchemy.sql.elements import BinaryExpression, BindParameter

from app.models.library import LibraryTagMapping
from app.repositories.library_repository import LibraryRepository


async def _find_page_capturing_statements(
    session: AsyncSession, tag_ids: list[uuid.UUID]
) -> list[sa.Executable]:
    """find_page を実行し、実際にDBへ発行された文を返す。

    テストDBはインメモリSQLiteで、SQLite方言はUUIDをhex文字列に変換してしまうため
    PostgreSQLでの `varchar = uuid` の型不一致は実行しても再現しない。発行された文を
    捕捉し、PostgreSQL（asyncpg）方言で検証できるようにする。
    """
    statements: list[sa.Executable] = []

    def _capture(state: ORMExecuteState) -> None:
        statements.append(state.statement)

    event.listen(session.sync_session, "do_orm_execute", _capture)
    try:
        await LibraryRepository.find_page(
            tenant_id="tenant-library-repository-test",
            current_user_id=uuid.uuid4(),
            page=0,
            size=20,
            title=None,
            created_by=None,
            exclude_created_by=None,
            tag_ids=tag_ids,
            sort_by="updatedAt",
            sort_dir="desc",
            session=session,
        )
    finally:
        event.remove(session.sync_session, "do_orm_execute", _capture)
    return statements


def _tag_id_in_binds(stmt: sa.Executable) -> list[BindParameter]:
    """文中の `library_tag_mappings.library_tag_id IN (...)` の右辺バインドを返す。

    自動生成されるバインド名に依存せず、比較対象の列で特定する。ORM属性経由の列は
    アノテーション付きのコピーになり同一オブジェクトではないため、compare() で比較する。
    """
    # `__table__`はSQLModelの型定義に現れずmypyでエラーになるため、マッパー経由で列を取る。
    target_column = sa.inspect(LibraryTagMapping).columns["library_tag_id"]
    # 実行時は句要素(ClauseElement)だが、`Executable`の型定義は走査対象として
    # 宣言されていないため、`visitors.iterate`が受け取る型として明示する。
    traversible = cast(visitors.ExternallyTraversible, stmt)
    return [
        element.right
        for element in visitors.iterate(traversible)
        if isinstance(element, BinaryExpression)
        and element.operator is operators.in_op
        and element.left.compare(target_column)
        and isinstance(element.right, BindParameter)
    ]


class TestFindPageTagIdsBinding:
    async def test_find_page_binds_tag_ids_as_string_for_postgresql(self, session):
        """PostgreSQL向けにタグIDが文字列型でバインドされること"""
        statements = await _find_page_capturing_statements(session, [uuid.uuid4()])

        binds = [bind for stmt in statements for bind in _tag_id_in_binds(stmt)]
        assert binds
        for bind in binds:
            assert isinstance(bind.type, sa.String)
            assert not isinstance(bind.type, sa.Uuid)

    async def test_find_page_binds_tag_ids_as_hex_values(self, session):
        """タグIDがDB保存形式（ハイフンなし32桁hex）の文字列でasyncpgに渡ること"""
        tag_ids = [uuid.uuid4(), uuid.uuid4()]

        statements = await _find_page_capturing_statements(session, tag_ids)

        checked = 0
        for stmt in statements:
            compiled = stmt.compile(dialect=asyncpg.dialect())
            params = compiled.construct_params()
            for bind in _tag_id_in_binds(stmt):
                # 匿名バインドの実際の名前はコンパイル時に決まるため、コンパイル結果から引く
                values = params[compiled.bind_names[bind]]
                assert values == [tag_id.hex for tag_id in tag_ids]
                assert all(isinstance(value, str) for value in values)
                checked += 1
        assert checked > 0
