"""Graph Candidate 抽出に使う LLM の出力プロバイダと抽出器。

移植元の AdapterLlmCandidateOutputProviders・AdapterLlmCandidateExtractors・
ProviderRequiredLlmCandidateExtractor をまとめて移植している。
"""

import json
import re
from typing import Any

from generative_ai_core.chat.models import CoreChatRequestBuilder, CoreMessage
from generative_ai_core.chat.runtime import CoreChatRuntime
from generative_ai_core.failure import sanitize
from generative_ai_core.graphrag.ingestion.llm import (
    LlmCandidateExtraction,
    LlmCandidateExtractionRequest,
    LlmCandidateExtractor,
    LlmCandidateOutputException,
    LlmCandidateOutputProvider,
    LlmJsonCandidateExtractor,
)
from generative_ai_core.network import (
    DEFAULT_TIMEOUT_SECONDS,
    MAX_TIMEOUT_SECONDS,
    MIN_TIMEOUT_SECONDS,
    CoreNetworkSetting,
)
from generative_ai_core.provider.clients.secuaigent.keys import TENANT_ID
from generative_ai_core.provider.factory import CoreProviderRuntimeFactory
from generative_ai_core.provider.model import (
    CoreCredential,
    CoreProviderId,
    RuntimeProviderConfiguration,
)

from embedding_adapter.domain import (
    EmbeddingNetworkProperties,
    EmbeddingProviderProperties,
)

REQUEST_FAILED = "LLM_CANDIDATE_PROVIDER_REQUEST_FAILED"
PROVIDER_UNCONFIGURED = "LLM_CANDIDATE_PROVIDER_UNCONFIGURED"
SUPPORTED_PROVIDERS = frozenset({"OpenAI", "AzureOpenAI", "SecuAiGent"})
MAX_REPAIR_VALUE_LENGTH = 128
REDACTED = "redacted"
EMPTY_CANDIDATE_JSON = '{"entities":[],"edges":[]}'

UNSAFE_REPAIR_VALUE = re.compile(
    r"([A-Za-z]:\\|/(mnt|home|users|var|tmp|workspace)/|"
    r"\b\w+(Exception|Error)\b|\bat\s+[\w.$]+\(|"
    r"raw[-_\s]?prompt|raw[-_\s]?provider|raw[-_\s]?response|"
    r"document[-_\s]?chunk|"
    r"chunk[-_\s]?text|document[-_\s]?text)",
    re.IGNORECASE,
)
REPAIR_ROOT_FIELDS = ("extraction_run_id",)
REPAIR_ENTITY_FIELDS = (
    "candidate_id",
    "entity_type",
    "label_hash",
    "evidence_id",
    "verification_status",
    "trust_level",
    "source_chunk_id",
)
REPAIR_EDGE_FIELDS = (
    "candidate_id",
    "source_entity_id",
    "target_entity_id",
    "edge_type",
    "evidence_id",
    "verification_status",
    "trust_level",
    "source_chunk_id",
)

SYSTEM_PROMPT = (
    "Return only one valid JSON object root fields extraction_run_id, entities, edges. "
    "No prose, markdown table, JSON schema, comments, provider metadata, credentials, "
    "or tenant/ACL/table/schema/column names. "
    "SAFE_ID fields are candidate_id, label_hash, extraction_run_id, and source_chunk_id. "
    "SAFE_ID values match [A-Za-z0-9._:-]{1,128}. "
    "label_hash must not contain prose, spaces, slashes, table names, schema names. "
    "label_hash is not a display label. It is an ASCII-safe stable slug. "
    "Never copy Japanese, prose, spaces, slashes, URLs, file paths, or raw document text "
    "into label_hash. Convert obvious Japanese or mixed labels to lowercase ASCII slugs "
    "with hyphen separators. Few-shot label_hash examples: "
    "XYZ-Webアプリケーション -> xyz-web-application; "
    "請求管理システム -> billing-management-system; 顧客DB -> customer-db; "
    "社内FAQ/検索 -> internal-faq-search. "
    "If you cannot produce a SAFE_ID label_hash confidently, omit that entity candidate "
    "and edges depending on it. "
    "When normalized_body includes [[ENTITY:TYPE:slug]], derive label_hash slug "
    "with only SAFE_ID characters. "
    "When normalized_body has no marker, still apply SAFE_ID fields, SAFE_ID rule, "
    "and label_hash prohibitions. "
    'Example JSON: {"extraction_run_id":"run-safe-001","entities":['
    '{"candidate_id":"entity-safe-001","entity_type":"SYSTEM",'
    '"label_hash":"billing-platform","evidence_id":"evidence-safe-001",'
    '"verification_status":"candidate","trust_level":"llm_suggested",'
    '"source_chunk_id":"chunk-safe-001"}],"edges":[]}. '
    "Entity fields are candidate_id, entity_type, label_hash, evidence_id, "
    "verification_status, trust_level, source_chunk_id. "
    "Edge fields are candidate_id, source_entity_id, target_entity_id, "
    "edge_type, evidence_id, verification_status, trust_level, source_chunk_id. "
    "candidate_id, source_entity_id, target_entity_id, evidence_id, label_hash, "
    "extraction_run_id, source_chunk_id must match "
    "[A-Za-z0-9._:-]{1,128}; entity_type edge_type must match "
    "[A-Z][A-Z0-9_]{0,63}. verification_status must be candidate "
    "trust_level must be llm_suggested. Do not emit self-loop edges, duplicate "
    "entities edges, cross-chunk references, more than 100 total candidates across "
    "entities and edges."
)

REPAIR_SYSTEM_PROMPT = (
    "Repair candidate JSON. Return only one valid JSON object root fields "
    "extraction_run_id, entities, edges. No prose, markdown table, comments, "
    "provider metadata, credentials, source paths, raw prompts, raw provider responses, "
    "stack traces, or document text. Preserve the same validator rules: SAFE_ID values "
    "match [A-Za-z0-9._:-]{1,128}; entity_type and edge_type match "
    "[A-Z][A-Z0-9_]{0,63}; verification_status must be candidate; trust_level must be "
    "llm_suggested; no self-loop edges, duplicate candidates, cross-chunk references, "
    "or more than 100 total candidates across entities and edges. You may change fields, "
    "ids, references, status, trust, and JSON shape or delete invalid candidates, but do "
    "not add entity, edge, or evidence candidates absent from the input JSON. "
    "Critical label_hash repair rule: label_hash is an ASCII-safe stable slug, not "
    "a display label. If label_hash contains Japanese, prose, spaces, slashes, URLs, "
    "file paths, or raw document text, repair obvious cases: "
    "XYZ-Webアプリケーション -> xyz-web-application; "
    "請求管理システム -> billing-management-system; 顧客DB -> customer-db; "
    "社内FAQ/検索 -> internal-faq-search. If no safe slug is obvious, delete that "
    "entity candidate and delete any edge depending on it."
)

REPAIR_USER_PROMPT_RULES = (
    "Return JSON with extraction_run_id, entities array, edges array. "
    "Each entity has candidate_id, entity_type, label_hash, evidence_id, "
    "verification_status, trust_level, source_chunk_id. Each edge has candidate_id, "
    "source_entity_id, target_entity_id, edge_type, evidence_id, verification_status, "
    "trust_level, source_chunk_id. SAFE_ID fields must match [A-Za-z0-9._:-]{1,128}. "
    "Do not add entity, edge, or evidence candidates absent from candidate_json.\n"
)


def _has_text(value: str | None) -> bool:
    """空白以外の文字があるか判定する。

    Parameters
    ----------
    value : str | None
        判定する文字列。

    Returns
    -------
    bool
        空白以外の文字があれば True。
    """
    return value is not None and value.strip() != ""


def _copy_allowed_string(
    source: dict[str, Any], target: dict[str, Any], allowed: tuple[str, ...], name: str
) -> None:
    """許可された項目の文字列値だけを、伏せ字にしてコピーする。

    Parameters
    ----------
    source : dict[str, Any]
        コピー元。
    target : dict[str, Any]
        コピー先。
    allowed : tuple[str, ...]
        許可する項目名。
    name : str
        コピーする項目名。
    """
    value = source.get(name)
    if name not in allowed or value is None or isinstance(value, (dict, list)):
        return
    target[name] = _sanitize_repair_value(_primitive_as_string(value))


def _primitive_as_string(value: Any) -> str:
    """JSON のプリミティブを Gson の getAsString と同じ文字列にする。

    Parameters
    ----------
    value : Any
        JSON のプリミティブ値。

    Returns
    -------
    str
        文字列表現。真偽値は true/false。
    """
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _sanitize_repair_value(value: str | None) -> str:
    """修復用の値から秘密情報・長すぎる値・危険な値を除く。

    Parameters
    ----------
    value : str | None
        修復用の値。

    Returns
    -------
    str
        伏せ字にした値。長すぎる・危険な値は `redacted`。
    """
    sanitized = sanitize(value or "").strip()
    if len(sanitized) > MAX_REPAIR_VALUE_LENGTH or UNSAFE_REPAIR_VALUE.search(
        sanitized
    ):
        return REDACTED
    return sanitized


def _sanitized_candidate_array(
    source: Any, allowed_fields: tuple[str, ...]
) -> list[dict[str, Any]]:
    """候補の配列から許可された項目だけを残す。

    Parameters
    ----------
    source : Any
        元の配列（配列でなければ空として扱う）。
    allowed_fields : tuple[str, ...]
        許可する項目名。

    Returns
    -------
    list[dict[str, Any]]
        許可された項目だけを持つ候補の配列。
    """
    if not isinstance(source, list):
        return []
    result: list[dict[str, Any]] = []
    for element in source:
        if not isinstance(element, dict):
            continue
        candidate: dict[str, Any] = {}
        for name in allowed_fields:
            _copy_allowed_string(element, candidate, allowed_fields, name)
        result.append(candidate)
    return result


def _sanitized_repair_candidate_json(candidate_json_body: str) -> str:
    """修復の入力にする候補 JSON から、許可された項目だけを残す。

    Parameters
    ----------
    candidate_json_body : str
        拒否された候補 JSON。

    Returns
    -------
    str
        伏せ字にした候補 JSON。解釈できなければ空の候補。
    """
    try:
        root = json.loads(candidate_json_body)
        if not isinstance(root, dict):
            return EMPTY_CANDIDATE_JSON
        sanitized: dict[str, Any] = {}
        _copy_allowed_string(root, sanitized, REPAIR_ROOT_FIELDS, "extraction_run_id")
        sanitized["entities"] = _sanitized_candidate_array(
            root.get("entities"), REPAIR_ENTITY_FIELDS
        )
        sanitized["edges"] = _sanitized_candidate_array(
            root.get("edges"), REPAIR_EDGE_FIELDS
        )
        return json.dumps(sanitized, ensure_ascii=False, separators=(",", ":"))
    except ValueError:
        return EMPTY_CANDIDATE_JSON


def _first_choice_content(obj: dict[str, Any]) -> str | None:
    """OpenAI 互換の応答から最初の choice の本文を取り出す。

    Parameters
    ----------
    obj : dict[str, Any]
        応答の JSON。

    Returns
    -------
    str | None
        本文。なければ None。
    """
    choices = obj.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    first = choices[0]
    if not isinstance(first, dict):
        return None
    message = first.get("message")
    if isinstance(message, dict) and message.get("content") is not None:
        return str(message["content"])
    if first.get("text") is not None:
        return str(first["text"])
    return None


def extract_candidate_json(response: str | None) -> str | None:
    """応答が OpenAI 互換のラッパーなら、中の候補 JSON を取り出す。

    Parameters
    ----------
    response : str | None
        LLM の応答。

    Returns
    -------
    str | None
        候補 JSON の文字列。ラッパーでなければ応答そのまま。
    """
    if not _has_text(response):
        return response
    assert response is not None
    try:
        parsed = json.loads(response)
    except ValueError:
        return response
    if not isinstance(parsed, dict):
        return response
    if "entities" in parsed or "edges" in parsed:
        return response
    choice_content = _first_choice_content(parsed)
    if _has_text(choice_content):
        return choice_content
    output_text = parsed.get("output_text")
    if output_text is not None and _has_text(str(output_text)):
        return str(output_text)
    return response


def _invalid_candidate_response() -> LlmCandidateOutputException:
    """候補 JSON として不正な応答のときの例外を作る。

    Returns
    -------
    LlmCandidateOutputException
        拒否コード LLM_CANDIDATE_PROVIDER_REQUEST_FAILED の例外。
    """
    return LlmCandidateOutputException(
        REQUEST_FAILED,
        "LLM candidate provider response did not contain required candidate JSON object.",
    )


def _require_candidate_json(response: str | None) -> str:
    """応答が必須項目を持つ JSON オブジェクトか確かめる。

    Parameters
    ----------
    response : str | None
        応答。

    Returns
    -------
    str
        そのままの応答。

    Raises
    ------
    LlmCandidateOutputException
        JSON オブジェクトでない、または必須項目がないとき。
    """
    try:
        parsed = json.loads(response or "")
    except ValueError as e:
        raise _invalid_candidate_response() from e
    if not isinstance(parsed, dict) or not all(
        key in parsed for key in ("extraction_run_id", "entities", "edges")
    ):
        raise _invalid_candidate_response()
    assert response is not None
    return response


class CoreChatCandidateOutputProvider:
    """core の chat で候補 JSON を LLM に出させる出力プロバイダ。"""

    def __init__(
        self,
        provider_id: str,
        network_setting: CoreNetworkSetting | None,
        runtime: CoreChatRuntime,
    ) -> None:
        """プロバイダ ID・ネットワーク設定・chat の runtime を受け取る。

        Parameters
        ----------
        provider_id : str
            プロバイダ ID。
        network_setting : CoreNetworkSetting | None
            ネットワーク設定。None なら既定。
        runtime : CoreChatRuntime
            chat の runtime。
        """
        self._provider_id = provider_id
        self._network_setting = (
            network_setting
            if network_setting is not None
            else CoreNetworkSetting.defaults()
        )
        self._runtime = runtime

    def __call__(self, request: LlmCandidateExtractionRequest) -> str:
        """LLM を呼んで候補 JSON を返す。

        Parameters
        ----------
        request : LlmCandidateExtractionRequest
            抽出の要求。

        Returns
        -------
        str
            候補 JSON。

        Raises
        ------
        LlmCandidateOutputException
            LLM の呼び出しが失敗した、または応答が候補 JSON でないとき。
        """
        return self.extract(request)

    def extract(self, request: LlmCandidateExtractionRequest) -> str:
        """LLM を呼んで候補 JSON を返す。

        Parameters
        ----------
        request : LlmCandidateExtractionRequest
            抽出の要求。

        Returns
        -------
        str
            候補 JSON。

        Raises
        ------
        LlmCandidateOutputException
            LLM の呼び出しが失敗した、または応答が候補 JSON でないとき。
        """
        try:
            result = self._runtime.chat(self._chat_request(request))
            if result.failure is not None:
                raise LlmCandidateOutputException(
                    REQUEST_FAILED, result.failure.summary
                )
            return _require_candidate_json(extract_candidate_json(result.answer))
        except LlmCandidateOutputException:
            raise
        except Exception as e:
            raise LlmCandidateOutputException(
                REQUEST_FAILED, sanitize(f"LLM candidate provider request failed: {e}")
            ) from e

    def _chat_request(self, request: LlmCandidateExtractionRequest) -> Any:
        """候補抽出用の chat リクエストを作る。

        Parameters
        ----------
        request : LlmCandidateExtractionRequest
            抽出の要求。

        Returns
        -------
        Any
            CoreChatRequest。
        """
        return (
            CoreChatRequestBuilder(self._provider_id)
            .network_setting(self._network_setting)
            .candidate_json_response(True)
            .add_message(CoreMessage.system(self._system_prompt(request)))
            .add_message(CoreMessage.user(self._user_prompt(request)))
            .build()
        )

    def _system_prompt(self, request: LlmCandidateExtractionRequest) -> str:
        """システムプロンプトを返す。

        Parameters
        ----------
        request : LlmCandidateExtractionRequest
            抽出の要求。

        Returns
        -------
        str
            修復の呼び出しなら修復用、そうでなければ通常のプロンプト。
        """
        return REPAIR_SYSTEM_PROMPT if request.repair_attempt() else SYSTEM_PROMPT

    def _user_prompt(self, request: LlmCandidateExtractionRequest) -> str:
        """ユーザープロンプトを組み立てる。

        Parameters
        ----------
        request : LlmCandidateExtractionRequest
            抽出の要求。

        Returns
        -------
        str
            ユーザープロンプト。
        """
        if request.repair_attempt():
            return self._repair_user_prompt(request)
        ingestion = request.ingestion_request
        extraction = request.deterministic_extraction
        return (
            f"source_chunk_id: {request.source_chunk_id}"
            f"\nextraction_run_id: {ingestion.deterministic_marker_context}"
            f"\ndeterministic_marker_context: {ingestion.deterministic_marker_context}"
            f"\nnormalized_body:\n{ingestion.normalized_body}"
            f"\nexisting_entity_count: {len(extraction.entities)}"
            f"\nexisting_edge_count: {len(extraction.edges)}"
            "\nEdges may reference deterministic entity IDs already present in context or "
            "entity candidate IDs emitted in same response."
        )

    def _repair_user_prompt(self, request: LlmCandidateExtractionRequest) -> str:
        """修復用のユーザープロンプトを組み立てる。

        Parameters
        ----------
        request : LlmCandidateExtractionRequest
            修復の文脈を持つ抽出の要求。

        Returns
        -------
        str
            修復用のユーザープロンプト。
        """
        context = request.repair_context
        assert context is not None
        candidate_json = _sanitized_repair_candidate_json(context.candidate_json_body)
        return (
            f"validator_error_code: {sanitize(context.failure_code)}"
            f"\nexpected_schema_rules:\n{REPAIR_USER_PROMPT_RULES}"
            f"candidate_json:\n{candidate_json}"
        )


def _core_network_setting(
    proxy_setting: EmbeddingNetworkProperties | None,
    access_credential: EmbeddingProviderProperties,
) -> CoreNetworkSetting:
    """プロキシ設定とタイムアウトから core のネットワーク設定を作る。

    Parameters
    ----------
    proxy_setting : EmbeddingNetworkProperties | None
        プロキシ・SSL の設定。
    access_credential : EmbeddingProviderProperties
        LLM の接続設定（タイムアウトを使う）。

    Returns
    -------
    CoreNetworkSetting
        ネットワーク設定。範囲外のタイムアウトは既定値にする。
    """
    network = (
        proxy_setting if proxy_setting is not None else EmbeddingNetworkProperties()
    )
    timeout = access_credential.timeout_seconds
    if timeout < MIN_TIMEOUT_SECONDS or timeout > MAX_TIMEOUT_SECONDS:
        timeout = DEFAULT_TIMEOUT_SECONDS
    return network.to_setting(timeout)


def _core_credential(
    access_credential: EmbeddingProviderProperties, provider_id: CoreProviderId
) -> CoreCredential:
    """資格情報を作る。SecuAiGent でアクセストークンがあれば Bearer にする。

    Parameters
    ----------
    access_credential : EmbeddingProviderProperties
        LLM の接続設定。
    provider_id : CoreProviderId
        プロバイダ。

    Returns
    -------
    CoreCredential
        資格情報。
    """
    token = access_credential.secu_ai_gent_access_token
    if provider_id == CoreProviderId.SecuAiGent and _has_text(token):
        return CoreCredential.bearer_token(token)
    return CoreCredential.api_key(access_credential.api_key, provider_id.canonical_name)


def _to_configuration(
    access_credential: EmbeddingProviderProperties,
    proxy_setting: EmbeddingNetworkProperties | None,
) -> RuntimeProviderConfiguration:
    """候補抽出用のプロバイダ設定を作る。

    Parameters
    ----------
    access_credential : EmbeddingProviderProperties
        LLM の接続設定。
    proxy_setting : EmbeddingNetworkProperties | None
        プロキシ・SSL の設定。

    Returns
    -------
    RuntimeProviderConfiguration
        プロバイダの実行時設定。

    Raises
    ------
    ValueError
        SecuAiGent でテナント ID が空のとき。
    """
    provider_id = CoreProviderId.parse(access_credential.vendor_name)
    attributes: dict[str, str] = {}
    if provider_id == CoreProviderId.SecuAiGent:
        if not _has_text(access_credential.tenant_id):
            raise ValueError("tenantId must not be blank for SecuAiGent")
        attributes[TENANT_ID] = access_credential.tenant_id or ""
    return RuntimeProviderConfiguration(
        provider_id,
        access_credential.model_name or "",
        access_credential.url or "",
        _core_credential(access_credential, provider_id),
        _core_network_setting(proxy_setting, access_credential),
        attributes,
    )


def _is_configured(access_credential: EmbeddingProviderProperties | None) -> bool:
    """ベンダー・URL・API キー・モデル名がそろっているか判定する。

    Parameters
    ----------
    access_credential : EmbeddingProviderProperties | None
        LLM の接続設定。

    Returns
    -------
    bool
        すべて空でなければ True。
    """
    return (
        access_credential is not None
        and _has_text(access_credential.vendor_name)
        and _has_text(access_credential.url)
        and _has_text(access_credential.api_key)
        and _has_text(access_credential.model_name)
    )


def _copy_credential(
    source: EmbeddingProviderProperties,
) -> EmbeddingProviderProperties:
    """接続設定のうち候補抽出に要る項目だけをコピーする。

    Parameters
    ----------
    source : EmbeddingProviderProperties
        コピー元。

    Returns
    -------
    EmbeddingProviderProperties
        コピー。
    """
    return EmbeddingProviderProperties(
        url=source.url,
        test_url=source.test_url,
        api_key=source.api_key,
        model_name=source.model_name,
        vendor_name=source.vendor_name,
        timeout_seconds=source.timeout_seconds,
        tenant_id=source.tenant_id,
    )


class AdapterLlmCandidateOutputProviders:
    """接続設定から候補抽出用の出力プロバイダを作る。"""

    @staticmethod
    def from_properties(
        access_credential: EmbeddingProviderProperties | None,
        proxy_setting: EmbeddingNetworkProperties | None,
    ) -> LlmCandidateOutputProvider | None:
        """接続設定から出力プロバイダを作る。

        Parameters
        ----------
        access_credential : EmbeddingProviderProperties | None
            LLM の接続設定。
        proxy_setting : EmbeddingNetworkProperties | None
            プロキシ・SSL の設定。

        Returns
        -------
        LlmCandidateOutputProvider | None
            未設定、または未対応のベンダーなら None。
        """
        if access_credential is None or not _is_configured(access_credential):
            return None
        if access_credential.vendor_name not in SUPPORTED_PROVIDERS:
            return None
        configuration = _to_configuration(
            _copy_credential(access_credential), proxy_setting
        )
        runtime = CoreProviderRuntimeFactory.create_chat_runtime(configuration)
        return CoreChatCandidateOutputProvider(
            configuration.provider_id.canonical_name,
            configuration.network_setting,
            runtime,
        )


class ProviderRequiredLlmCandidateExtractor:
    """プロバイダが未設定のとき、呼ばれたら必ず拒否する抽出器。"""

    FAILURE_CODE = PROVIDER_UNCONFIGURED

    def __call__(
        self, request: LlmCandidateExtractionRequest
    ) -> LlmCandidateExtraction:
        """常に未設定の拒否にする。

        Parameters
        ----------
        request : LlmCandidateExtractionRequest
            抽出の要求。

        Returns
        -------
        LlmCandidateExtraction
            返らない（常に例外を送出する）。

        Raises
        ------
        LlmCandidateOutputException
            常に送出する。
        """
        return self.extract(request)

    def extract(self, request: LlmCandidateExtractionRequest) -> LlmCandidateExtraction:
        """常に未設定の拒否にする。

        Parameters
        ----------
        request : LlmCandidateExtractionRequest
            抽出の要求。

        Returns
        -------
        LlmCandidateExtraction
            返らない（常に例外を送出する）。

        Raises
        ------
        LlmCandidateOutputException
            常に送出する。
        """
        raise LlmCandidateOutputException(
            self.FAILURE_CODE,
            "LLM candidate provider abstraction is not configured for production "
            "GraphRAG ingestion.",
        )


class AdapterLlmCandidateExtractors:
    """出力プロバイダの有無で候補抽出器を選ぶ。"""

    @staticmethod
    def configured(
        provider: LlmCandidateOutputProvider | None,
    ) -> LlmCandidateExtractor:
        """プロバイダがあれば JSON 抽出器、なければ未設定の抽出器を返す。

        Parameters
        ----------
        provider : LlmCandidateOutputProvider | None
            出力プロバイダ。

        Returns
        -------
        LlmCandidateExtractor
            候補抽出器。
        """
        if provider is None:
            return AdapterLlmCandidateExtractors.unconfigured()
        return LlmJsonCandidateExtractor(provider)

    @staticmethod
    def unconfigured() -> LlmCandidateExtractor:
        """未設定の抽出器を返す。

        Returns
        -------
        LlmCandidateExtractor
            呼ばれたら必ず拒否する抽出器。
        """
        return ProviderRequiredLlmCandidateExtractor()
