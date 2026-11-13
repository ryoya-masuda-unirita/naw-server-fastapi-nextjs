"""プロバイダ × 能力ごとの実行器の登録と呼び出し（移植元 CoreProviderRuntime）。"""

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, TypeVar

from generative_ai_core.network.setting import CoreNetworkSetting
from generative_ai_core.provider.model import Capability

ResultT = TypeVar("ResultT")


class ProviderExecutionError(RuntimeError):
    """プロバイダの実行に失敗したことを表す（移植元 ProviderExecutionException）。"""


def _normalize_provider_id(provider_id: str | None) -> str:
    """プロバイダ ID の前後の空白を取り除く。

    Parameters
    ----------
    provider_id : str | None
        プロバイダ ID。

    Returns
    -------
    str
        前後の空白を取り除いたプロバイダ ID。

    Raises
    ------
    ValueError
        プロバイダ ID が空の場合。
    """
    if provider_id is None or not provider_id.strip():
        raise ValueError("providerId must not be blank")
    return provider_id.strip()


@dataclass(frozen=True)
class ExecutionContext:
    """実行器に渡す実行時の文脈。

    Attributes
    ----------
    provider_id : str
        プロバイダ ID。
    capability : Capability
        実行する機能。
    network_setting : CoreNetworkSetting
        ネットワーク設定。
    """

    provider_id: str
    capability: Capability
    network_setting: CoreNetworkSetting = field(
        default_factory=CoreNetworkSetting.defaults
    )


ProviderExecutor = Callable[[Any, ExecutionContext], Any]


@dataclass(frozen=True)
class _ExecutorEntry:
    """実行器と、受け付けるリクエストの型の組。

    Attributes
    ----------
    request_type : type
        受け付けるリクエストの型。
    executor : ProviderExecutor
        実行器。
    """

    request_type: type
    executor: ProviderExecutor


class CoreProviderRuntime:
    """プロバイダ × 機能ごとの実行器を登録し、呼び出す。"""

    def __init__(self, executors: dict[tuple[str, Capability], _ExecutorEntry]) -> None:
        """実行器の登録内容を受け取る。

        Parameters
        ----------
        executors : dict[tuple[str, Capability], _ExecutorEntry]
            (プロバイダ ID, 機能) ごとの実行器。
        """
        self._executors = dict(executors)

    @classmethod
    def builder(cls) -> "CoreProviderRuntimeBuilder":
        """ビルダーを作る。

        Returns
        -------
        CoreProviderRuntimeBuilder
            新しいビルダー。
        """
        return CoreProviderRuntimeBuilder()

    def supports(self, provider_id: str, capability: Capability) -> bool:
        """指定のプロバイダ × 機能の実行器があるかを返す。

        Parameters
        ----------
        provider_id : str
            プロバイダ ID。
        capability : Capability
            機能。

        Returns
        -------
        bool
            実行器が登録されていれば True。

        Raises
        ------
        ValueError
            プロバイダ ID が空の場合。
        """
        return (_normalize_provider_id(provider_id), capability) in self._executors

    def providers(self) -> list[str]:
        """登録されているプロバイダ ID を返す。

        Returns
        -------
        list[str]
            登録順で重複のないプロバイダ ID。
        """
        return list(dict.fromkeys(key[0] for key in self._executors))

    def execute(
        self,
        provider_id: str,
        capability: Capability,
        request: object,
        network_setting: CoreNetworkSetting | None,
        result_type: type[ResultT],
    ) -> ResultT:
        """登録された実行器でリクエストを実行する。

        Parameters
        ----------
        provider_id : str
            プロバイダ ID。
        capability : Capability
            機能。
        request : object
            リクエスト。登録時の型と一致する必要がある。
        network_setting : CoreNetworkSetting | None
            ネットワーク設定。None なら既定値を使う。
        result_type : type[ResultT]
            期待する結果の型。

        Returns
        -------
        ResultT
            実行器の結果。

        Raises
        ------
        ValueError
            プロバイダ ID が空の場合。
        ProviderExecutionError
            実行器がない、リクエストの型が違う、実行に失敗した、
            または結果の型が違う場合。
        """
        normalized = _normalize_provider_id(provider_id)
        entry = self._executors.get((normalized, capability))
        if entry is None:
            raise ProviderExecutionError(
                f"No provider executor is registered for {normalized} / {capability}"
            )
        if not isinstance(request, entry.request_type):
            raise ProviderExecutionError(
                f"Provider executor request type mismatch for {normalized} / "
                f"{capability}"
            )
        context = ExecutionContext(
            normalized, capability, network_setting or CoreNetworkSetting.defaults()
        )
        try:
            result = entry.executor(request, context)
        except ProviderExecutionError:
            raise
        except Exception as e:
            raise ProviderExecutionError(
                f"Provider execution failed for {normalized} / {capability}"
            ) from e
        if not isinstance(result, result_type):
            # 移植元は Class.cast の失敗も「実行に失敗」として包む
            raise ProviderExecutionError(
                f"Provider execution failed for {normalized} / {capability}"
            )
        return result


class CoreProviderRuntimeBuilder:
    """CoreProviderRuntime に実行器を登録して組み立てる。"""

    def __init__(self) -> None:
        """空の登録内容で始める。"""
        self._executors: dict[tuple[str, Capability], _ExecutorEntry] = {}

    def register(
        self,
        provider_id: str,
        capability: Capability,
        request_type: type,
        executor: ProviderExecutor,
    ) -> "CoreProviderRuntimeBuilder":
        """実行器を登録する。同じプロバイダ × 機能は上書きする。

        Parameters
        ----------
        provider_id : str
            プロバイダ ID。
        capability : Capability
            機能。
        request_type : type
            受け付けるリクエストの型。
        executor : ProviderExecutor
            実行器。

        Returns
        -------
        CoreProviderRuntimeBuilder
            メソッドチェーン用の自分自身。

        Raises
        ------
        ValueError
            プロバイダ ID が空の場合。
        """
        key = (_normalize_provider_id(provider_id), capability)
        self._executors[key] = _ExecutorEntry(request_type, executor)
        return self

    def build(self) -> CoreProviderRuntime:
        """登録内容から CoreProviderRuntime を作る。

        Returns
        -------
        CoreProviderRuntime
            組み立てたランタイム。
        """
        return CoreProviderRuntime(self._executors)
