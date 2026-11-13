"""移植元 SecuAiGentEmbeddingClientTest の移植（SecuAiGentCoreEmbeddingProvider を含む）。

移植元はローカルの HTTP サーバーを立てるが、Python 版は respx で HTTP をモックする。
"""

import json
from collections.abc import Callable, Iterator

import httpx
import pytest
import respx
from generative_ai_core.embedding import (
    CoreEmbeddingRequest,
    EmbeddingSource,
    create_embedding_runtime,
)
from generative_ai_core.network.setting import CoreNetworkSetting
from generative_ai_core.provider.clients.secuaigent import failure
from generative_ai_core.provider.clients.secuaigent.embedding import (
    SecuAiGentCoreEmbeddingProvider,
    SecuAiGentEmbeddingClient,
    parse_embedding,
    resolve_dimensions,
)
from generative_ai_core.provider.clients.secuaigent.keys import DIMENSIONS, TENANT_ID
from generative_ai_core.provider.model import (
    CoreCredential,
    CoreProviderId,
    RuntimeProviderConfiguration,
)

BASE_URL = "http://secuaigent.example.invalid"
LOGIN_KEY = "login-key-fixture"
TENANT = "tenant-fixture"
Factory = Callable[..., RuntimeProviderConfiguration]


class _Server:
    """移植元のテストが立てるローカルサーバーに当たる、respx のルートの組。"""

    def __init__(self, router: respx.MockRouter) -> None:
        """認証と埋め込みのルートを登録する。

        Parameters
        ----------
        router : respx.MockRouter
            HTTP をモックするルーター。
        """
        self.auth = router.post(f"{BASE_URL}/auth/login-key").mock(
            return_value=httpx.Response(
                200, json={"token": "fixture-jwt-token", "role": "SYSTEM"}
            )
        )
        self.embedding = router.post(f"{BASE_URL}/api/llm/embedding").mock(
            return_value=httpx.Response(200, json={"embedding": [0.1, 0.2]})
        )

    def respond_embedding(self, response: httpx.Response) -> None:
        """埋め込みの応答を差し替える。

        Parameters
        ----------
        response : httpx.Response
            返す応答。
        """
        self.embedding.mock(return_value=response)


@pytest.fixture
def router() -> Iterator[respx.MockRouter]:
    """HTTP をモックするルーターを返す。

    Yields
    ------
    respx.MockRouter
        呼ばれなくてもよいルーター。
    """
    with respx.mock(assert_all_called=False) as mock:
        yield mock


@pytest.fixture
def server(router: respx.MockRouter) -> _Server:
    """認証と埋め込みのルートを持つモックサーバーを返す。

    Parameters
    ----------
    router : respx.MockRouter
        HTTP をモックするルーター。

    Returns
    -------
    _Server
        モックサーバー。
    """
    return _Server(router)


def _configuration(
    make_configuration: Factory,
    endpoint: str = BASE_URL,
    dimensions: str | None = "2",
    credential: CoreCredential | None = None,
) -> RuntimeProviderConfiguration:
    """SecuAiGent の設定を作る。

    Parameters
    ----------
    make_configuration : Factory
        設定の工場。
    endpoint : str
        接続先。
    dimensions : str | None
        次元数の属性。None なら属性なし。
    credential : CoreCredential | None
        資格情報。省略時は loginKey。

    Returns
    -------
    RuntimeProviderConfiguration
        設定。
    """
    attributes = {TENANT_ID: TENANT}
    if dimensions is not None:
        attributes[DIMENSIONS] = dimensions
    return make_configuration(
        CoreProviderId.SecuAiGent,
        model_name="deploy-fixture",
        endpoint=endpoint,
        credential=credential or CoreCredential.api_key(LOGIN_KEY),
        attributes=attributes,
    )


def test_posts_embedding_request_with_bearer_tenant_and_dimensions(
    make_configuration: Factory, server: _Server
) -> None:
    """Bearer・テナント・dimensions を付けて埋め込みを送ること"""
    vector = SecuAiGentEmbeddingClient().embed(
        _configuration(make_configuration), "hello text"
    )

    assert server.auth.calls.last.request.headers["X-Tenant-ID"] == TENANT
    assert server.auth.call_count == 1
    sent = server.embedding.calls.last.request
    assert sent.headers["Authorization"] == "Bearer fixture-jwt-token"
    assert sent.headers["X-Tenant-ID"] == TENANT
    assert json.loads(sent.content) == {
        "deployName": "deploy-fixture",
        "input": "hello text",
        "dimensions": 2,
    }
    assert vector == [0.1, 0.2]


def test_bearer_credential_skips_login(
    make_configuration: Factory, server: _Server
) -> None:
    """アクセストークンがあればログインせずそのまま Bearer に使うこと"""
    configuration = _configuration(
        make_configuration,
        credential=CoreCredential.bearer_token("direct-access-token"),
    )

    vector = SecuAiGentEmbeddingClient().embed(configuration, "hello text")

    assert server.auth.call_count == 0
    assert (
        server.embedding.calls.last.request.headers["Authorization"]
        == "Bearer direct-access-token"
    )
    assert vector == [0.1, 0.2]


def test_defaults_dimensions_when_attribute_missing(
    make_configuration: Factory, server: _Server
) -> None:
    """次元数の属性がなければ 1536 を要求すること"""
    server.respond_embedding(httpx.Response(200, json={"embedding": [0.1] * 1536}))

    SecuAiGentEmbeddingClient().embed(
        _configuration(make_configuration, dimensions=None), "text"
    )

    assert json.loads(server.embedding.calls.last.request.content)["dimensions"] == 1536


def test_resolve_dimensions_ignores_blank_non_positive_and_invalid(
    make_configuration: Factory,
) -> None:
    """次元数の属性が空・0 以下・数値でないときは既定にし、正の数ならその値にすること"""
    for value in (" ", "0", "-1", "not-number"):
        assert (
            resolve_dimensions(_configuration(make_configuration, dimensions=value))
            == 1536
        )
    assert resolve_dimensions(_configuration(make_configuration, dimensions="3")) == 3


def test_null_input_and_trailing_slash_endpoint(
    make_configuration: Factory, server: _Server
) -> None:
    """入力が None なら空文字列を送り、末尾の / があっても同じ URL に送ること"""
    vector = SecuAiGentEmbeddingClient().embed(
        _configuration(make_configuration, endpoint=BASE_URL + "/"), None
    )

    assert vector == [0.1, 0.2]
    assert json.loads(server.embedding.calls.last.request.content)["input"] == ""


def test_default_dimension_mismatch_is_secret_safe_failure(
    make_configuration: Factory, server: _Server
) -> None:
    """既定の次元数と合わない応答は DIMENSION_MISMATCH で、秘密情報を含まないこと"""
    configuration = _configuration(make_configuration, dimensions=None)

    with pytest.raises(failure.SecuAiGentIOError, match="DIMENSION_MISMATCH") as info:
        SecuAiGentEmbeddingClient().embed(configuration, "query-fixture")

    _assert_secret_safe(str(info.value))


def test_configured_dimension_mismatch_is_secret_safe_failure(
    make_configuration: Factory, server: _Server
) -> None:
    """設定した次元数と合わない応答は DIMENSION_MISMATCH になること"""
    with pytest.raises(failure.SecuAiGentIOError, match="DIMENSION_MISMATCH") as info:
        SecuAiGentEmbeddingClient().embed(
            _configuration(make_configuration, dimensions="3"), "query-fixture"
        )

    _assert_secret_safe(str(info.value))


def test_auth_failure_is_secret_safe(
    make_configuration: Factory, server: _Server
) -> None:
    """ログイン失敗は AUTH_FAILURE で、秘密情報を含まないこと"""
    server.auth.mock(return_value=httpx.Response(401, json={}))

    with pytest.raises(failure.SecuAiGentIOError, match="AUTH_FAILURE") as info:
        SecuAiGentEmbeddingClient().embed(
            _configuration(make_configuration, dimensions="1536"), "hello"
        )

    _assert_secret_safe(str(info.value))


def test_auth_proxy_failure_uses_proxy_failure_class(
    make_configuration: Factory, server: _Server
) -> None:
    """ログインが 407 なら PROXY_AUTH を示すこと"""
    server.auth.mock(return_value=httpx.Response(407, json={}))

    with pytest.raises(failure.SecuAiGentIOError, match="PROXY_AUTH") as info:
        SecuAiGentEmbeddingClient().embed(
            _configuration(make_configuration, dimensions="1536"), "hello"
        )

    _assert_secret_safe(str(info.value))


def test_embedding_http_failure_is_secret_safe(
    make_configuration: Factory, server: _Server
) -> None:
    """埋め込みが HTTP エラーなら UPSTREAM_EMBEDDING_FAILURE になること"""
    server.respond_embedding(httpx.Response(502, json={}))

    with pytest.raises(
        failure.SecuAiGentIOError, match="UPSTREAM_EMBEDDING_FAILURE"
    ) as info:
        SecuAiGentEmbeddingClient().embed(
            _configuration(make_configuration, dimensions="1536"), "hello"
        )

    assert failure.NETWORK_FAILURE in str(info.value)
    _assert_secret_safe(str(info.value))


def test_embedding_proxy_failure_uses_proxy_failure_class(
    make_configuration: Factory, server: _Server
) -> None:
    """埋め込みが 407 ならプロキシ認証の分類コードが入ること"""
    server.respond_embedding(httpx.Response(407, json={}))

    with pytest.raises(
        failure.SecuAiGentIOError, match="UPSTREAM_EMBEDDING_FAILURE"
    ) as info:
        SecuAiGentEmbeddingClient().embed(
            _configuration(make_configuration, dimensions="1536"), "hello"
        )

    assert failure.PROXY_AUTH_FAILURE in str(info.value)
    _assert_secret_safe(str(info.value))


@pytest.mark.parametrize(
    "payload",
    [
        {"providerPayload": "fixture-sensitive-value"},
        {"embedding": []},
        {"embedding": "not-an-array"},
    ],
)
def test_invalid_embedding_payload_is_secret_safe_failure(
    make_configuration: Factory, server: _Server, payload: dict[str, object]
) -> None:
    """embedding がない・空・配列でない応答は UPSTREAM_EMBEDDING_FAILURE になること"""
    server.respond_embedding(httpx.Response(200, json=payload))

    with pytest.raises(
        failure.SecuAiGentIOError, match="UPSTREAM_EMBEDDING_FAILURE"
    ) as info:
        SecuAiGentEmbeddingClient().embed(
            _configuration(make_configuration, dimensions="1536"), "query-fixture"
        )

    assert "fixture-sensitive-value" not in str(info.value)
    _assert_secret_safe(str(info.value))


def test_non_json_response_is_secret_safe_failure(
    make_configuration: Factory, server: _Server
) -> None:
    """JSON でない応答も UPSTREAM_EMBEDDING_FAILURE になること"""
    server.respond_embedding(httpx.Response(200, text="not json"))

    with pytest.raises(failure.SecuAiGentIOError, match="UPSTREAM_EMBEDDING_FAILURE"):
        SecuAiGentEmbeddingClient().embed(
            _configuration(make_configuration, dimensions="1536"), "hello"
        )


def test_network_error_is_classified(make_configuration: Factory) -> None:
    """通信エラーは分類済みの IO エラーになること"""
    with respx.mock(assert_all_called=False) as router:
        router.post(f"{BASE_URL}/auth/login-key").mock(
            return_value=httpx.Response(200, json={"token": "t"})
        )
        router.post(f"{BASE_URL}/api/llm/embedding").mock(
            side_effect=httpx.ConnectError("boom")
        )
        with pytest.raises(failure.SecuAiGentIOError, match="NETWORK_FAILURE"):
            SecuAiGentEmbeddingClient().embed(
                _configuration(make_configuration, dimensions="1536"), "hello"
            )


def test_parse_embedding_reads_numbers() -> None:
    """embedding の配列を double のリストにすること"""
    assert parse_embedding('{"embedding":[1,2.5]}') == [1.0, 2.5]


def test_provider_returns_success_with_target_and_source(
    make_configuration: Factory, server: _Server
) -> None:
    """プロバイダが targetHint と表示名を持つ成功の結果を返すこと"""
    runtime = create_embedding_runtime(_configuration(make_configuration))

    result = runtime.embed(
        CoreEmbeddingRequest.builder("SecuAiGent")
        .network_setting(CoreNetworkSetting.defaults())
        .source(EmbeddingSource.of_file("docs/a.txt", "hello"))
        .target_hint("row-1")
        .build()
    )

    assert result.failure is None
    assert result.vector == (0.1, 0.2)
    assert result.target_id == "row-1"
    assert result.source_name == "docs/a.txt"


def test_provider_wraps_client_exception_as_provider_failure(
    make_configuration: Factory,
) -> None:
    """クライアントが失敗したら PROVIDER_FAILURE の結果にすること"""

    class FailingClient(SecuAiGentEmbeddingClient):
        """常に分類済みの失敗を投げるクライアント。"""

        def embed(
            self, configuration: RuntimeProviderConfiguration, input_text: str | None
        ) -> list[float]:
            """常に失敗する。

            Parameters
            ----------
            configuration : RuntimeProviderConfiguration
                設定（使わない）。
            input_text : str | None
                入力（使わない）。

            Raises
            ------
            SecuAiGentIOError
                常に送出する。
            """
            raise failure.SecuAiGentIOError("UPSTREAM_EMBEDDING_FAILURE: x")

    provider = SecuAiGentCoreEmbeddingProvider(
        _configuration(make_configuration), FailingClient()
    )

    result = provider.embed(
        CoreEmbeddingRequest.builder("SecuAiGent")
        .source(EmbeddingSource.of_text("hello"))
        .build()
    )

    assert result.failure is not None
    assert result.failure.code == "PROVIDER_FAILURE"


def _assert_secret_safe(message: str) -> None:
    """メッセージに秘密情報・接続先・入力が含まれないことを確かめる。

    Parameters
    ----------
    message : str
        確かめるメッセージ。
    """
    for secret in (
        LOGIN_KEY,
        "fixture-jwt-token",
        TENANT,
        BASE_URL,
        "query-fixture",
    ):
        assert secret not in message
