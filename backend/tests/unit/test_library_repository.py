import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import asyncpg
from sqlalchemy.sql.compiler import SQLCompiler

from app.repositories.library_repository import LibraryRepository

# library_tag_mappings.library_tag_id に対するバインドパラメータ名の接頭辞
TAG_ID_BIND_PREFIX = "library_tag_id_"


async def _capture_find_page_statements(tag_ids: list[uuid.UUID]) -> list[sa.Select]:
    """find_page を実DBなしで呼び出し、session.execute に渡された文を返す。

    テストはインメモリSQLiteで動くが、SQLite方言はUUIDをhex文字列に変換してしまい
    PostgreSQLでの `varchar = uuid` の型不一致を再現できない。そのため実行される文を
    捕捉し、PostgreSQL（asyncpg）方言でコンパイルして検証できるようにする。
    """
    result = MagicMock()
    result.scalar_one.return_value = 0
    result.scalars.return_value.all.return_value = []
    session = AsyncMock()
    session.execute.return_value = result

    await LibraryRepository.find_page(
        tenant_id="tenant-1",
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
    return [call.args[0] for call in session.execute.await_args_list]


def _compile_for_asyncpg(stmt: sa.Select) -> SQLCompiler:
    return stmt.compile(dialect=asyncpg.dialect())


def _tag_id_bind_keys(compiled: SQLCompiler) -> list[str]:
    return [key for key in compiled.binds if key.startswith(TAG_ID_BIND_PREFIX)]


class TestFindPageTagIdsBinding:
    @pytest.mark.asyncio
    async def test_find_page_binds_tag_ids_as_string_for_postgresql(self):
        """PostgreSQL向けにタグIDが文字列型でバインドされること"""
        statements = await _capture_find_page_statements([uuid.uuid4()])

        # 件数取得・一覧取得の2文とも同じ絞り込み条件を持つ
        assert len(statements) == 2
        for stmt in statements:
            compiled = _compile_for_asyncpg(stmt)
            keys = _tag_id_bind_keys(compiled)
            assert len(keys) == 1
            bind_type = compiled.binds[keys[0]].type
            assert isinstance(bind_type, sa.String)
            assert not isinstance(bind_type, sa.Uuid)

    @pytest.mark.asyncio
    async def test_find_page_binds_tag_ids_as_hex_values(self):
        """タグIDがDB保存形式（ハイフンなし32桁hex）の文字列でバインドされること"""
        tag_ids = [uuid.uuid4(), uuid.uuid4()]

        statements = await _capture_find_page_statements(tag_ids)

        for stmt in statements:
            compiled = _compile_for_asyncpg(stmt)
            params = compiled.construct_params()
            (key,) = _tag_id_bind_keys(compiled)
            values = params[key]
            assert values == [tag_id.hex for tag_id in tag_ids]
            assert all(isinstance(value, str) for value in values)
