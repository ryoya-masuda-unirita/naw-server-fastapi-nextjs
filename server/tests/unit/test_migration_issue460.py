"""マイグレーション issue460（`BEDROCK_EMBEDDING` の列挙型への追加）のテスト（`bedrock-ext`）。

列挙型の値の追加（`ALTER TYPE ... ADD VALUE`）は PostgreSQL 固有で、インメモリ SQLite では
動かないため、実行される SQL と、リビジョンの連鎖を確かめる。PostgreSQL での実行は
`docs/issue-460/08_動作確認.md` に記録する。
"""

import importlib.util
from pathlib import Path
from types import ModuleType
from unittest.mock import MagicMock, patch

from app.models.ai_model import AIModelEndpointType
from app.models.tenant_endpoint import EndpointType

_MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "alembic"
    / "versions"
    / "issue460_add_bedrock_embedding_endpoint_type.py"
)


def _load_migration() -> ModuleType:
    """マイグレーションのファイルをモジュールとして読み込む。

    Returns
    -------
    ModuleType
        読み込んだマイグレーションのモジュール。
    """
    spec = importlib.util.spec_from_file_location("issue460", _MIGRATION_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _executed(operation: str) -> list[str]:
    """`upgrade`・`downgrade` が実行する SQL の一覧を返す。

    Parameters
    ----------
    operation : str
        `upgrade` または `downgrade`。

    Returns
    -------
    list[str]
        実行された SQL。
    """
    module = _load_migration()
    with patch.object(module, "op", MagicMock()) as mock_op:
        getattr(module, operation)()
    return [call.args[0] for call in mock_op.execute.call_args_list]


def test_revision_follows_issue442() -> None:
    """リビジョンが issue442 の次につながること"""
    module = _load_migration()

    assert module.revision == "issue460"
    assert module.down_revision == "issue442"


def test_upgrade_adds_value_to_both_enums() -> None:
    """upgrade が、2 つの列挙型に BEDROCK_EMBEDDING を足すこと"""
    statements = _executed("upgrade")

    assert statements == [
        "ALTER TYPE endpointtype ADD VALUE IF NOT EXISTS 'BEDROCK_EMBEDDING'",
        "ALTER TYPE aimodelendpointtype ADD VALUE IF NOT EXISTS 'BEDROCK_EMBEDDING'",
    ]


def test_downgrade_removes_rows_then_recreates_enums_without_value() -> None:
    """downgrade が、該当の行を消し、BEDROCK_EMBEDDING を除いた列挙型を作り直すこと"""
    statements = _executed("downgrade")

    assert (
        statements[0] == "DELETE FROM tenant_endpoints WHERE type = 'BEDROCK_EMBEDDING'"
    )
    assert (
        statements[1]
        == "DELETE FROM ai_models WHERE endpoint_type = 'BEDROCK_EMBEDDING'"
    )
    created = [s for s in statements if s.startswith("CREATE TYPE")]
    assert len(created) == 2
    assert all("BEDROCK_EMBEDDING" not in s for s in created)
    assert all("BEDROCK_CHAT" in s for s in created)


def test_models_define_the_new_value() -> None:
    """モデルの列挙型に、マイグレーションと同じ値があること"""
    assert EndpointType.BEDROCK_EMBEDDING.value == "BEDROCK_EMBEDDING"
    assert AIModelEndpointType.BEDROCK_EMBEDDING.value == "BEDROCK_EMBEDDING"
