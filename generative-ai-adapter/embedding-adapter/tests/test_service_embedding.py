"""埋め込みモデルとその設定変換の単体テスト。

移植元 embedding-adapter/src/test の service/EmbeddingSelectorServiceTest、
service/embedding/（OpenAI・AzureOpenAI の EmbeddingServiceTest）、
service/core/CoreDelegatingEmbeddingModelTest、
service/core/EmbeddingCoreConfigurationMapperTest を移したもの。
"""

import pytest
from embedding_adapter.domain import (
    EmbeddingNetworkProperties,
    EmbeddingProviderProperties,
)
from embedding_adapter.service.core.configuration import (
    EmbeddingCoreConfigurationMapper,
    resolve_embedding_dimensions,
)
from embedding_adapter.service.core.embedding import CoreDelegatingEmbeddingModel
from embedding_adapter.service.embedding import (
    AzureOpenAIEmbeddingService,
    EmbeddingSelectorService,
    OpenAIEmbeddingService,
)
from generative_ai_core.embedding import (
    CoreEmbeddingRequest,
    CoreEmbeddingResult,
    CoreEmbeddingRuntime,
)
from generative_ai_core.failure import CoreFailure
from generative_ai_core.network import ProxyMode
from generative_ai_core.provider.clients.secuaigent.keys import DIMENSIONS, TENANT_ID
from generative_ai_core.provider.model import Capability, CredentialKind
from generative_ai_core.provider.runtime import CoreProviderRuntime


def _provider(vendor: str, model: str = "model") -> EmbeddingProviderProperties:
    """テスト用のプロバイダのプロパティを作る。

    Parameters
    ----------
    vendor : str
        ベンダー名。
    model : str
        モデル名。

    Returns
    -------
    EmbeddingProviderProperties
        プロパティ。
    """
    return EmbeddingProviderProperties(
        "https://example.invalid", "", "api-key", model, vendor
    )


def _model_returning(result: CoreEmbeddingResult) -> CoreDelegatingEmbeddingModel:
    """固定の結果を返す core の runtime を使うモデルを作る。

    Parameters
    ----------
    result : CoreEmbeddingResult
        返す結果。

    Returns
    -------
    CoreDelegatingEmbeddingModel
        モデル。
    """
    runtime = CoreEmbeddingRuntime(
        CoreProviderRuntime.builder()
        .register(
            "OpenAI",
            Capability.EMBEDDING,
            CoreEmbeddingRequest,
            lambda request, context: result,
        )
        .build()
    )
    return CoreDelegatingEmbeddingModel.from_runtime("OpenAI", None, runtime)


def test_selector_creates_core_delegating_model_for_azure() -> None:
    """AzureOpenAI では core に委譲するモデルが作られること"""
    proxy = EmbeddingNetworkProperties(
        proxy_host="proxy.example.com",
        proxy_port=8080,
        proxy_id="proxyUser",
        proxy_pass="proxyPass",
    )
    credential = EmbeddingProviderProperties(
        url="https://api.example.com", api_key="your-api-key", vendor_name="AzureOpenAI"
    )
    model = EmbeddingSelectorService.create_embedding_model(proxy, credential)
    assert isinstance(model, CoreDelegatingEmbeddingModel)


def test_selector_rejects_unsupported_vendor() -> None:
    """対応外のベンダーは ValueError になること"""
    credential = EmbeddingProviderProperties(
        url="https://api.example.com",
        api_key="your-api-key",
        vendor_name="UnsupportedVendor",
    )
    with pytest.raises(ValueError, match="Unsupported vendor"):
        EmbeddingSelectorService.create_embedding_model(
            EmbeddingNetworkProperties(), credential
        )


def test_legacy_services_delegate_to_core(monkeypatch: pytest.MonkeyPatch) -> None:
    """OpenAI・AzureOpenAI の旧サービスが core のモデルに委譲すること"""
    runtime = CoreEmbeddingRuntime(
        CoreProviderRuntime.builder()
        .register(
            "OpenAI",
            Capability.EMBEDDING,
            CoreEmbeddingRequest,
            lambda request, context: CoreEmbeddingResult.success("", [0.5], "t"),
        )
        .build()
    )
    delegate = CoreDelegatingEmbeddingModel.from_runtime("OpenAI", None, runtime)
    open_ai = OpenAIEmbeddingService(
        _provider("OpenAI", "text-embedding-ada-002"), EmbeddingNetworkProperties()
    )
    azure = AzureOpenAIEmbeddingService(
        _provider("AzureOpenAI", "embedding-model"), EmbeddingNetworkProperties()
    )
    monkeypatch.setattr(open_ai, "_delegate", delegate)
    monkeypatch.setattr(azure, "_delegate", delegate)
    assert open_ai.create_embedding("x") == [0.5]
    assert azure.create_embedding("x") == [0.5]


def test_secu_ai_gent_access_token_uses_bearer_credential() -> None:
    """SecuAiGent でアクセストークンがあれば Bearer の資格情報になること"""
    credential = _provider("SecuAiGent")
    credential.tenant_id = "tenant"
    credential.secu_ai_gent_access_token = "access-token-fixture"
    mapped = EmbeddingCoreConfigurationMapper().map(credential, None)
    assert mapped.credential.kind == CredentialKind.BEARER_TOKEN
    assert mapped.credential.value == "access-token-fixture"


def test_create_embedding_returns_core_vector() -> None:
    """core のベクトルがそのまま返ること"""
    model = _model_returning(CoreEmbeddingResult.success("", [0.1, 0.2], "text"))
    assert model.create_embedding("hello") == [0.1, 0.2]


def test_create_embedding_treats_null_text_as_empty() -> None:
    """None のテキストは空文字列として扱われること"""
    model = _model_returning(CoreEmbeddingResult.success("", [0.1], "text"))
    assert model.create_embedding(None) == [0.1]


def test_create_embedding_raises_core_failure_summary() -> None:
    """core の失敗の要約が RuntimeError になること"""
    model = _model_returning(
        CoreEmbeddingResult.of_failure(CoreFailure.of("PROVIDER_FAILURE", "failed"))
    )
    with pytest.raises(RuntimeError, match="failed"):
        model.create_embedding("hello")


def test_secu_ai_gent_rejects_blank_tenant_id() -> None:
    """SecuAiGent の Tenant ID が空だと ValueError になること"""
    credential = _provider("SecuAiGent", "deploy-fixture")
    credential.tenant_id = ""
    with pytest.raises(ValueError, match="tenantId"):
        CoreDelegatingEmbeddingModel(credential, EmbeddingNetworkProperties())


def test_resolve_embedding_dimensions_uses_default_for_invalid_values() -> None:
    """次元数が未設定・0 以下なら 1536 になること"""
    assert resolve_embedding_dimensions(None) == 1536
    assert resolve_embedding_dimensions(0) == 1536
    assert resolve_embedding_dimensions(-1) == 1536
    assert resolve_embedding_dimensions(768) == 768


def test_constructor_accepts_proxy_modes_and_blank_model_name() -> None:
    """プロキシの各モードと空のモデル名でモデルが作れること"""

    def proxy(mode: int, creds: bool) -> EmbeddingNetworkProperties:
        """プロキシのプロパティを作る。

        Parameters
        ----------
        mode : int
            プロキシのモード。
        creds : bool
            認証を使うか。

        Returns
        -------
        EmbeddingNetworkProperties
            プロパティ。
        """
        return EmbeddingNetworkProperties(
            mode, "proxy.example", 8080, creds, "user", "pass"
        )

    credential = _provider("OpenAI", "")
    credential.timeout_seconds = 0
    CoreDelegatingEmbeddingModel(credential, proxy(0, False))
    for mode, creds in ((1, False), (1, True), (2, False)):
        CoreDelegatingEmbeddingModel(_provider("OpenAI"), proxy(mode, creds))
    secu = _provider("SecuAiGent", "deploy-fixture")
    secu.tenant_id = "tenant-fixture"
    secu.timeout_seconds = 10
    secu.embedding_dimensions = 768
    CoreDelegatingEmbeddingModel(secu, None)
    CoreDelegatingEmbeddingModel(secu, proxy(2, False))


def test_mapper_maps_api_key_model_and_default_network() -> None:
    """API キー・モデル名・既定のネットワークが変換されること"""
    mapper = EmbeddingCoreConfigurationMapper()
    properties = _provider("OpenAI")
    result = mapper.map(properties, None)
    assert result.provider_id.canonical_name == "OpenAI"
    assert result.credential.kind == CredentialKind.API_KEY
    assert result.network_setting.timeout_seconds == 180
    properties.model_name = " "
    assert mapper.map(properties, EmbeddingNetworkProperties()).model_name == (
        "embedding-model"
    )
    properties.model_name = None
    assert mapper.map(properties, None).model_name == "embedding-model"
    assert mapper.network(None, None).timeout_seconds == 180


def test_mapper_maps_secu_ai_gent_tenant_and_dimensions() -> None:
    """SecuAiGent の Tenant ID・次元数・Bearer が変換され、不足は失敗すること"""
    mapper = EmbeddingCoreConfigurationMapper()
    properties = _provider("SecuAiGent")
    properties.tenant_id = "tenant"
    properties.secu_ai_gent_access_token = "bearer"
    properties.embedding_dimensions = 256
    properties.timeout_seconds = 60
    result = mapper.map(properties, EmbeddingNetworkProperties())
    assert result.credential.kind == CredentialKind.BEARER_TOKEN
    assert result.attributes[TENANT_ID] == "tenant"
    assert result.attributes[DIMENSIONS] == "256"
    properties.secu_ai_gent_access_token = " "
    properties.embedding_dimensions = None
    assert mapper.map(properties, None).attributes[DIMENSIONS] == "1536"
    properties.embedding_dimensions = 0
    assert mapper.map(properties, None).attributes[DIMENSIONS] == "1536"
    properties.tenant_id = " "
    with pytest.raises(ValueError, match="tenantId"):
        mapper.map(properties, None)
    properties.tenant_id = None
    properties.secu_ai_gent_access_token = None
    with pytest.raises(ValueError, match="tenantId"):
        mapper.map(properties, None)


def test_mapper_never_exposes_raw_secrets() -> None:
    """設定の文字列表現に生の秘密が出ないこと"""
    properties = _provider("SecuAiGent")
    properties.tenant_id = "tenant-secret"
    properties.secu_ai_gent_access_token = "bearer-secret"
    properties.embedding_dimensions = 768
    network = EmbeddingNetworkProperties(
        1, "proxy.invalid", 8443, True, "proxy-user", "proxy-secret", True
    )
    result = EmbeddingCoreConfigurationMapper().map(properties, network)
    assert result.network_setting.insecure_ssl_enabled
    assert result.network_setting.proxy_setting.mode == ProxyMode.MANUAL
    assert "bearer-secret" not in str(result)
    assert "proxy-secret" not in str(result)
    assert "bearer-secret" not in str(result.credential)


def test_mapper_maps_every_proxy_mode_and_timeout_boundary() -> None:
    """Waha! のプロキシの各モードとタイムアウトの境界が変換されること"""
    mapper = EmbeddingCoreConfigurationMapper()
    properties = _provider("OpenAI")
    properties.timeout_seconds = 1
    manual = mapper.network(
        properties, EmbeddingNetworkProperties(1, "proxy", 8080, False)
    )
    assert manual.proxy_setting.mode == ProxyMode.MANUAL
    assert manual.timeout_seconds == 180
    properties.timeout_seconds = 60
    system = mapper.network(properties, EmbeddingNetworkProperties(use_proxy=2))
    assert system.proxy_setting.mode == ProxyMode.SYSTEM
    assert system.timeout_seconds == 60
    properties.timeout_seconds = 90000
    assert (
        mapper.network(properties, EmbeddingNetworkProperties()).timeout_seconds == 180
    )
