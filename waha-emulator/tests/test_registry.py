from collections.abc import Callable
from http import HTTPStatus

import pytest

from waha_emulator.errors import EmulatorError
from waha_emulator.workflows import unsupported
from waha_emulator.workflows.base import WorkflowRequest
from waha_emulator.workflows.registry import MAX_TEMPLATE_WORKFLOWS, WorkflowRegistry


class _NamedWorkflow:
    """どのワークフローが選ばれたかを名前で見分けるためのテスト用ワークフロー。"""

    def __init__(self, name: str) -> None:
        """名前を受け取って保持する。

        Parameters
        ----------
        name : str
            見分けるための名前。run の戻り値にもなる。
        """
        self.name = name

    async def run(self, request: WorkflowRequest) -> str:
        """入力は使わず、保持している名前を返す。

        Parameters
        ----------
        request : WorkflowRequest
            ワークフローへの入力（使わない）。

        Returns
        -------
        str
            保持している名前。
        """
        return self.name


DEFAULT = _NamedWorkflow("default")


def test_registered_workflow_takes_precedence() -> None:
    """登録したサービス ID のワークフローが、学習のパラメータより優先されること"""
    custom = _NamedWorkflow("custom")
    registry = WorkflowRegistry(default=DEFAULT)
    registry.register("rag-service", custom)

    resolved = registry.resolve("rag-service", {"splitLength": "500"})

    assert resolved is custom


def test_learning_params_resolve_to_unsupported() -> None:
    """splitLength・filepath 付きは学習（未対応）になること"""
    registry = WorkflowRegistry(default=DEFAULT)

    assert registry.resolve("svc", {"filepath": ""}) is unsupported.LEARNING


def test_sync_params_resolve_to_unsupported() -> None:
    """start・end 付きは同期（未対応）になること"""
    registry = WorkflowRegistry(default=DEFAULT)

    assert registry.resolve("svc", {"start": "0", "end": "10"}) is unsupported.SYNC


def test_default_workflow_is_used_otherwise() -> None:
    """登録がなく学習・同期のパラメータもなければ既定のワークフローになること"""
    registry = WorkflowRegistry(
        default=DEFAULT, by_service_id={"x": _NamedWorkflow("x")}
    )

    assert registry.resolve("gpt-4o", {"streamfilepath": "/tmp/s.txt"}) is DEFAULT


def _factory(kind: str) -> Callable[[str], _NamedWorkflow]:
    """接尾辞から、`kind:接尾辞` の名前を持つワークフローを作る関数を返す。

    Parameters
    ----------
    kind : str
        ワークフローの種類を表す名前。

    Returns
    -------
    Callable[[str], _NamedWorkflow]
        接尾辞を受け取ってワークフローを作る関数。
    """
    return lambda name: _NamedWorkflow(f"{kind}:{name}")


def test_template_substitutes_suffix() -> None:
    """ひな形に当てはまるサービス ID で、接尾辞を入れたワークフローが返ること"""
    registry = WorkflowRegistry(default=DEFAULT)
    registry.register_template("kb-learn-", _factory("learn"))

    resolved = registry.resolve("kb-learn-hr", {"splitLength": "500", "filepath": ""})

    assert isinstance(resolved, _NamedWorkflow)
    assert resolved.name == "learn:hr"


def test_templates_with_different_suffixes_resolve_independently() -> None:
    """接尾辞が違うサービス ID は、別のワークフローになること"""
    registry = WorkflowRegistry(default=DEFAULT)
    registry.register_template("kb-learn-", _factory("learn"))

    hr = registry.resolve("kb-learn-hr", {})
    expense = registry.resolve("kb-learn-expense", {})

    assert hr is not expense
    assert (hr.name, expense.name) == ("learn:hr", "learn:expense")  # type: ignore[attr-defined]


def test_four_services_with_same_suffix_share_the_suffix() -> None:
    """学習・取得・削除・質問で同じ接尾辞を付けると、すべて同じ接尾辞で作られること"""
    registry = WorkflowRegistry(default=DEFAULT)
    for kind in ("learn", "sync", "delete", "rag"):
        prefix = "bedrock-rag-" if kind == "rag" else f"kb-{kind}-"
        registry.register_template(prefix, _factory(kind))

    names = [
        registry.resolve(service_id, {}).name  # type: ignore[attr-defined]
        for service_id in (
            "kb-learn-hr",
            "kb-sync-hr",
            "kb-delete-hr",
            "bedrock-rag-hr",
        )
    ]

    assert names == ["learn:hr", "sync:hr", "delete:hr", "rag:hr"]


def test_template_workflow_is_reused_for_same_service_id() -> None:
    """同じサービス ID は、作ったワークフローを使い回すこと"""
    registry = WorkflowRegistry(default=DEFAULT)
    registry.register_template("kb-learn-", _factory("learn"))

    assert registry.resolve("kb-learn-hr", {}) is registry.resolve("kb-learn-hr", {})


def test_longest_prefix_template_wins() -> None:
    """前の部分が重なるひな形では、長いほうが選ばれること"""
    registry = WorkflowRegistry(default=DEFAULT)
    registry.register_template("kb-", _factory("short"))
    registry.register_template("kb-learn-", _factory("long"))

    assert registry.resolve("kb-learn-hr", {}).name == "long:hr"  # type: ignore[attr-defined]
    assert registry.resolve("kb-other", {}).name == "short:other"  # type: ignore[attr-defined]


def test_explicit_service_takes_precedence_over_template() -> None:
    """個別に登録したサービス ID は、ひな形に当てはまっても優先されること"""
    custom = _NamedWorkflow("custom")
    registry = WorkflowRegistry(default=DEFAULT)
    registry.register_template("kb-learn-", _factory("learn"))
    registry.register("kb-learn-special", custom)

    assert registry.resolve("kb-learn-special", {}) is custom


@pytest.mark.parametrize("service_id", ["kb-learn-", "kb-learn", "other-hr"])
def test_service_id_not_matching_template_falls_back(service_id: str) -> None:
    """接尾辞が空のものや前の部分が違うものは、ひな形でなく従来の解決になること"""
    registry = WorkflowRegistry(default=DEFAULT)
    registry.register_template("kb-learn-", _factory("learn"))

    assert registry.resolve(service_id, {}) is DEFAULT


@pytest.mark.parametrize(
    "suffix",
    [
        "HR",
        "hr-1",
        "hr 1",
        "hr;drop table docs",
        'hr"--',
        "ｈｒ",
        "a" * 41,
    ],
)
def test_invalid_suffix_is_rejected_without_building(suffix: str) -> None:
    """英小文字・数字・_ 以外や長すぎる接尾辞は、400 で拒否されワークフローが作られないこと"""
    built: list[str] = []

    def factory(name: str) -> _NamedWorkflow:
        """作った接尾辞を記録するワークフロー作成関数。"""
        built.append(name)
        return _NamedWorkflow(name)

    registry = WorkflowRegistry(default=DEFAULT)
    registry.register_template("kb-learn-", factory)

    with pytest.raises(EmulatorError) as raised:
        registry.resolve(f"kb-learn-{suffix}", {})

    assert raised.value.status == HTTPStatus.BAD_REQUEST
    assert built == []


def test_valid_suffix_boundary_is_accepted() -> None:
    """英小文字・数字・_ の 1 文字と 40 文字は受け付けられること"""
    registry = WorkflowRegistry(default=DEFAULT)
    registry.register_template("kb-learn-", _factory("learn"))

    assert registry.resolve("kb-learn-a", {}).name == "learn:a"  # type: ignore[attr-defined]
    long = "a_1" * 13 + "z"
    assert len(long) == 40
    assert registry.resolve(f"kb-learn-{long}", {}).name == f"learn:{long}"  # type: ignore[attr-defined]


def test_template_workflow_cache_is_bounded() -> None:
    """接尾辞を変えながら呼ばれても、覚えておくワークフローが上限を超えて増えないこと"""
    registry = WorkflowRegistry(default=DEFAULT)
    registry.register_template("kb-learn-", _factory("learn"))

    for index in range(MAX_TEMPLATE_WORKFLOWS + 50):
        registry.resolve(f"kb-learn-n{index}", {})

    assert len(registry._template_workflows) == MAX_TEMPLATE_WORKFLOWS
    assert registry.resolve("kb-learn-n0", {}).name == "learn:n0"  # type: ignore[attr-defined]


def test_dynamic_workflow_takes_precedence_over_registered() -> None:
    """保存したワークフローが、設定ファイルの同じサービス ID の定義より優先されること"""
    registry = WorkflowRegistry(
        _NamedWorkflow("default"), {"svc": _NamedWorkflow("config")}
    )
    dynamic = _NamedWorkflow("dynamic")

    registry.set_dynamic("svc", dynamic)

    assert registry.resolve("svc", {}) is dynamic


def test_removing_dynamic_workflow_restores_registered() -> None:
    """保存したワークフローを外すと、設定ファイルの定義に戻ること。外していないものを外しても失敗しないこと"""
    registered = _NamedWorkflow("config")
    registry = WorkflowRegistry(_NamedWorkflow("default"), {"svc": registered})
    registry.set_dynamic("svc", _NamedWorkflow("dynamic"))

    registry.remove_dynamic("svc")
    registry.remove_dynamic("svc")

    assert registry.resolve("svc", {}) is registered


def test_dynamic_workflow_takes_precedence_over_learning_params() -> None:
    """保存したワークフローが、学習のパラメータによる振り分けより優先されること"""
    registry = WorkflowRegistry(_NamedWorkflow("default"))
    dynamic = _NamedWorkflow("dynamic")
    registry.set_dynamic("svc", dynamic)

    assert registry.resolve("svc", {"splitLength": "100", "filepath": "/x"}) is dynamic
