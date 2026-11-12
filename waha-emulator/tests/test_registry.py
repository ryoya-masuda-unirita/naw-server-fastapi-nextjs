from waha_emulator.workflows import unsupported
from waha_emulator.workflows.base import WorkflowRequest
from waha_emulator.workflows.registry import WorkflowRegistry


class _NamedWorkflow:
    def __init__(self, name: str) -> None:
        self.name = name

    async def run(self, request: WorkflowRequest) -> str:
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
