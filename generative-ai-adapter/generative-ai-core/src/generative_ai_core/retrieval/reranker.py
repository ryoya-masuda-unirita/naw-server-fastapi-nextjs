"""検索結果の上位をプロバイダの LLM で並べ替える（移植元 ProviderLlmReranker）。

候補が 2 件以上で、PostgreSQL のハイブリッド検索かつリランクが有効なときだけ、候補の
抜粋を LLM に渡して `{"ordered_ids": […]}` の順に並べ替える。LLM の失敗・空の応答・不正な
並びのときは、ベクトルだけの並び（`vector_only_items`）に戻す。設定が不正なときは失敗にする。
"""

import hashlib
import json
import logging
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field

from generative_ai_core.chat.models import (
    CoreChatRequest,
    CoreChatRequestBuilder,
    CoreChatResult,
    CoreMessage,
    OutputModeHint,
)
from generative_ai_core.failure import CoreFailure
from generative_ai_core.network.setting import CoreNetworkSetting
from generative_ai_core.provider.clients.secuaigent.keys import TENANT_ID
from generative_ai_core.provider.factory import CoreProviderRuntimeFactory
from generative_ai_core.provider.model import (
    CoreCredential,
    CoreProviderId,
    RuntimeProviderConfiguration,
)
from generative_ai_core.retrieval.hybrid.models import MergedRetrievalItem
from generative_ai_core.retrieval.models import (
    CoreProviderLlmRerankAttributes,
    CoreRetrievalRequest,
)

logger = logging.getLogger(__name__)

SUPPORTED_PROVIDERS = frozenset(
    {CoreProviderId.OpenAI, CoreProviderId.AzureOpenAI, CoreProviderId.SecuAiGent}
)
SNIPPET_MAX_CHARS = 600
RUNTIME_CONFIGURATION_ATTRIBUTE = "rerank.runtimeConfiguration"
SYSTEM_PROMPT = 'Return JSON only: {"ordered_ids":[...]}'
POSTGRESQL_PROVIDER_ID = "PostgreSQL"

ChatFunction = Callable[[CoreChatRequest], CoreChatResult]


@dataclass(frozen=True)
class RerankResult:
    """リランクの結果。

    Attributes
    ----------
    items : tuple[MergedRetrievalItem, ...]
        並べ替え後（または元のまま）の候補。
    evidence : Mapping[str, str]
        リランクの証拠（`rerank.status` など）。
    failure : CoreFailure | None
        失敗（設定が不正なとき）。
    """

    items: Sequence[MergedRetrievalItem] = ()
    evidence: Mapping[str, str] = field(default_factory=dict)
    failure: CoreFailure | None = None

    def __post_init__(self) -> None:
        """項目を不変にする。"""
        object.__setattr__(self, "items", tuple(self.items or ()))
        object.__setattr__(self, "evidence", dict(self.evidence or {}))


def _attribute(request: CoreRetrievalRequest | None, key: str) -> str:
    """検索リクエストの属性を返す。

    Parameters
    ----------
    request : CoreRetrievalRequest | None
        検索リクエスト。
    key : str
        キー。

    Returns
    -------
    str
        値。なければ空文字。
    """
    if request is None or request.attributes is None:
        return ""
    return request.attributes.get(key, "")


def _digest(value: str) -> str:
    """文字列の SHA-256（16 進）を返す。

    Parameters
    ----------
    value : str
        文字列。

    Returns
    -------
    str
        16 進のダイジェスト。
    """
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _truncate(value: str | None) -> str:
    """抜粋を 600 文字までにする。

    Parameters
    ----------
    value : str | None
        抜粋。

    Returns
    -------
    str
        前後の空白を除いた 600 文字以内の文字列。
    """
    trimmed = "" if value is None else value.strip()
    return trimmed[:SNIPPET_MAX_CHARS]


def _network_setting(request: CoreRetrievalRequest) -> CoreNetworkSetting:
    """リランク用のネットワーク設定（タイムアウトを上書きする）を作る。

    Parameters
    ----------
    request : CoreRetrievalRequest
        検索リクエスト。

    Returns
    -------
    CoreNetworkSetting
        ネットワーク設定。
    """
    base = request.network_setting or CoreNetworkSetting.defaults()
    timeout = _attribute(request, CoreProviderLlmRerankAttributes.TIMEOUT_SECONDS)
    if not timeout.strip():
        return base
    return CoreNetworkSetting.from_seconds(
        base.proxy_setting, base.insecure_ssl_enabled, int(timeout)
    )


def _credential(
    request: CoreRetrievalRequest, provider_id: CoreProviderId
) -> CoreCredential:
    """リランク用の資格情報を作る。

    Parameters
    ----------
    request : CoreRetrievalRequest
        検索リクエスト。
    provider_id : CoreProviderId
        プロバイダ。

    Returns
    -------
    CoreCredential
        資格情報。SecuAiGent のアクセストークンなら bearer。
    """
    credential = _attribute(request, CoreProviderLlmRerankAttributes.CREDENTIAL)
    if (
        provider_id == CoreProviderId.SecuAiGent
        and _attribute(request, CoreProviderLlmRerankAttributes.CREDENTIAL_KIND)
        == "bearer_token"
    ):
        return CoreCredential.bearer_token(credential)
    return CoreCredential.api_key(credential, provider_id.canonical_name)


def runtime_configuration(
    request: CoreRetrievalRequest,
) -> RuntimeProviderConfiguration:
    """リランクに使うプロバイダの設定を属性から作る。

    Parameters
    ----------
    request : CoreRetrievalRequest
        検索リクエスト。

    Returns
    -------
    RuntimeProviderConfiguration
        プロバイダの設定。
    """
    provider_id = CoreProviderId.parse(
        _attribute(request, CoreProviderLlmRerankAttributes.PROVIDER)
    )
    attributes = {}
    if provider_id == CoreProviderId.SecuAiGent:
        attributes[TENANT_ID] = _attribute(
            request, CoreProviderLlmRerankAttributes.TENANT_ID
        )
    return RuntimeProviderConfiguration(
        provider_id,
        _attribute(request, CoreProviderLlmRerankAttributes.MODEL),
        _attribute(request, CoreProviderLlmRerankAttributes.ENDPOINT),
        _credential(request, provider_id),
        _network_setting(request),
        attributes,
    )


def _validate(request: CoreRetrievalRequest) -> str | None:
    """リランクの設定を検証する。

    Parameters
    ----------
    request : CoreRetrievalRequest
        検索リクエスト。

    Returns
    -------
    str | None
        不正な理由。問題なければ None。
    """
    provider = _attribute(request, CoreProviderLlmRerankAttributes.PROVIDER)
    if not provider.strip():
        return "missing_provider"
    try:
        provider_id = CoreProviderId.parse(provider)
    except ValueError:
        return "unsupported_provider"
    if provider_id not in SUPPORTED_PROVIDERS:
        return "unsupported_provider"
    if not _attribute(request, CoreProviderLlmRerankAttributes.ENDPOINT).strip():
        return "missing_endpoint"
    if not _attribute(request, CoreProviderLlmRerankAttributes.CREDENTIAL).strip():
        return "missing_credential"
    if not _attribute(request, CoreProviderLlmRerankAttributes.MODEL).strip():
        return "missing_model"
    if (
        provider_id == CoreProviderId.SecuAiGent
        and not _attribute(request, CoreProviderLlmRerankAttributes.TENANT_ID).strip()
    ):
        return "missing_tenant"
    timeout = _attribute(request, CoreProviderLlmRerankAttributes.TIMEOUT_SECONDS)
    if timeout.strip():
        try:
            CoreNetworkSetting.from_seconds(None, False, int(timeout))
        except ValueError:
            return "invalid_timeout"
    return None


def _prompt(request: CoreRetrievalRequest, items: Sequence[MergedRetrievalItem]) -> str:
    """LLM に渡すプロンプト（質問と候補の JSON）を作る。

    Parameters
    ----------
    request : CoreRetrievalRequest
        検索リクエスト。
    items : Sequence[MergedRetrievalItem]
        候補。

    Returns
    -------
    str
        JSON 文字列。
    """
    candidates = [
        {
            "id": item.candidate.chunk_id,
            "rank": item.merged_rank,
            "snippet": _truncate(item.candidate.sanitized_snippet),
            # Java の List.toString（`[A, B]`）と同じ表記
            "signals": "[" + ", ".join(c.name for c in item.channel_list()) + "]",
        }
        for item in items
    ]
    return json.dumps(
        {"question": request.query, "candidates": candidates},
        ensure_ascii=False,
        separators=(",", ":"),
    )


def _parse_ordered_ids(answer: str, items: Sequence[MergedRetrievalItem]) -> list[str]:
    """LLM の応答から並び順の ID を取り出す。

    Parameters
    ----------
    answer : str
        LLM の応答。
    items : Sequence[MergedRetrievalItem]
        元の候補。

    Returns
    -------
    list[str]
        候補をちょうど 1 回ずつ含む ID の並び。不正なら空。
    """
    try:
        root = json.loads(answer)
    except ValueError:
        return []
    if not isinstance(root, dict):
        return []
    ordered = root.get("ordered_ids")
    if not isinstance(ordered, list):
        return []
    allowed = dict.fromkeys(item.candidate.chunk_id for item in items)
    ids: list[str] = []
    seen: set[str] = set()
    for value in ordered:
        if not isinstance(value, str) or value not in allowed or value in seen:
            return []
        seen.add(value)
        ids.append(value)
    return ids if len(ids) == len(allowed) else []


def _base_evidence(
    request: CoreRetrievalRequest, count: int, status: str, reason: str | None
) -> dict[str, str]:
    """リランクの証拠の共通部分を作る。

    Parameters
    ----------
    request : CoreRetrievalRequest
        検索リクエスト。
    count : int
        候補数。
    status : str
        `applied`・`degraded`・`failed`。
    reason : str | None
        理由。

    Returns
    -------
    dict[str, str]
        証拠。
    """
    evidence = {"rerank.status": status}
    provider = _attribute(request, CoreProviderLlmRerankAttributes.PROVIDER)
    if provider.strip():
        evidence["rerank.provider"] = provider
    evidence["rerank.candidateCount"] = str(count)
    if reason and reason.strip():
        evidence["rerank.reason"] = reason
    return evidence


def _disabled(items: Sequence[MergedRetrievalItem], reason: str) -> RerankResult:
    """リランクしなかった結果を作る。

    Parameters
    ----------
    items : Sequence[MergedRetrievalItem]
        候補（そのまま）。
    reason : str
        理由。

    Returns
    -------
    RerankResult
        結果。
    """
    return RerankResult(items, {"rerank.status": "disabled", "rerank.reason": reason})


def _degraded(
    items: Sequence[MergedRetrievalItem],
    request: CoreRetrievalRequest,
    count: int,
    reason: str,
    prompt_digest: str,
) -> RerankResult:
    """LLM が使えず、ベクトルだけの並びに戻した結果を作る。

    Parameters
    ----------
    items : Sequence[MergedRetrievalItem]
        ベクトルだけの並び。
    request : CoreRetrievalRequest
        検索リクエスト。
    count : int
        元の候補数。
    reason : str
        理由。
    prompt_digest : str
        プロンプトのダイジェスト。

    Returns
    -------
    RerankResult
        結果。
    """
    evidence = _base_evidence(request, count, "degraded", reason)
    evidence["rerank.fallback"] = "vector_only"
    evidence["rerank.promptDigest"] = prompt_digest
    return RerankResult(items, evidence)


class ProviderLlmReranker:
    """プロバイダの LLM で候補を並べ替える。"""

    def __init__(self, chat: ChatFunction | None = None) -> None:
        """LLM の呼び出しを受け取る（テストで差し替える）。

        Parameters
        ----------
        chat : ChatFunction | None
            チャットのリクエストを実行する関数。省略すると、リクエストの属性にある
            プロバイダの設定でチャットのランタイムを作って呼ぶ。
        """
        self._chat = chat or self._default_chat

    @staticmethod
    def _default_chat(request: CoreChatRequest) -> CoreChatResult:
        """属性のプロバイダ設定でチャットを実行する。

        Parameters
        ----------
        request : CoreChatRequest
            チャットのリクエスト。

        Returns
        -------
        CoreChatResult
            結果。
        """
        configuration = request.attributes[RUNTIME_CONFIGURATION_ATTRIBUTE]
        assert isinstance(configuration, RuntimeProviderConfiguration)
        return CoreProviderRuntimeFactory.create_chat_runtime(configuration).chat(
            request
        )

    def rerank(
        self,
        request: CoreRetrievalRequest | None,
        items: Sequence[MergedRetrievalItem] | None,
        vector_only_items: Sequence[MergedRetrievalItem] | None = None,
    ) -> RerankResult:
        """候補を LLM で並べ替える。

        Parameters
        ----------
        request : CoreRetrievalRequest | None
            検索リクエスト。
        items : Sequence[MergedRetrievalItem] | None
            ハイブリッド検索の候補。
        vector_only_items : Sequence[MergedRetrievalItem] | None
            LLM が使えないときに戻すベクトルだけの並び（省略すると `items`）。

        Returns
        -------
        RerankResult
            結果。無効・候補 1 件以下はそのまま、設定不正は失敗、LLM の不調は
            ベクトルだけの並び。
        """
        original = list(items or ())
        vector_only = original if vector_only_items is None else list(vector_only_items)
        if request is None or request.provider_id != POSTGRESQL_PROVIDER_ID:
            return _disabled(original, "non_postgresql")
        if (
            _attribute(request, CoreProviderLlmRerankAttributes.ENABLED).lower()
            != "enabled"
        ):
            return _disabled(original, "not_enabled")
        if len(original) <= 1:
            return _disabled(original, "candidate_count_le_1")
        reason = _validate(request)
        if reason is not None:
            return RerankResult(
                original,
                _base_evidence(request, len(original), "failed", reason),
                CoreFailure.of(
                    "RERANK_PROVIDER_CONFIGURATION_INVALID",
                    f"provider LLM rerank configuration invalid: {reason}",
                ),
            )
        prompt = _prompt(request, original)
        prompt_digest = _digest(prompt)
        try:
            chat_result = self._chat(self._chat_request(request, prompt))
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            logger.warning("provider LLM rerank failed: %s", type(e).__name__)
            return _degraded(
                vector_only, request, len(original), "provider_failure", prompt_digest
            )
        if chat_result is None or chat_result.failure is not None:
            return _degraded(
                vector_only, request, len(original), "provider_failure", prompt_digest
            )
        if not chat_result.answer_present or not chat_result.answer.strip():
            return _degraded(
                vector_only, request, len(original), "empty_response", prompt_digest
            )
        ordered_ids = _parse_ordered_ids(chat_result.answer, original)
        if not ordered_ids:
            return _degraded(
                vector_only, request, len(original), "invalid_order", prompt_digest
            )
        by_id = {item.candidate.chunk_id: item for item in original}
        evidence = _base_evidence(request, len(original), "applied", None)
        evidence["rerank.promptDigest"] = prompt_digest
        return RerankResult([by_id[i] for i in ordered_ids], evidence)

    @staticmethod
    def _chat_request(request: CoreRetrievalRequest, prompt: str) -> CoreChatRequest:
        """リランク用のチャットのリクエストを作る。

        Parameters
        ----------
        request : CoreRetrievalRequest
            検索リクエスト。
        prompt : str
            プロンプト。

        Returns
        -------
        CoreChatRequest
            チャットのリクエスト。
        """
        configuration = runtime_configuration(request)
        return (
            CoreChatRequestBuilder(configuration.provider_id.canonical_name)
            .network_setting(request.network_setting or CoreNetworkSetting.defaults())
            .output_mode_hint(OutputModeHint.CHAT_TEXT)
            .add_message(CoreMessage.system(SYSTEM_PROMPT))
            .add_message(CoreMessage.user(prompt))
            .candidate_json_response(True)
            .attribute(RUNTIME_CONFIGURATION_ATTRIBUTE, configuration)
            .build()
        )
