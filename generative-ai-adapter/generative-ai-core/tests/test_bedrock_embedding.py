"""Bedrock（Titan 埋め込み）の InvokeModel のテスト（Python 版だけの独自の拡張）。

移植元に対応する実装がないため、移植元のテストはない。外部通信は respx でモックし、
本物の Bedrock には接続しない。Bedrock の部品を消すとき（`bedrock-ext` の行と
`embedding/bedrock.py`）は、このファイルも一緒に削除する。
"""

import json
from collections.abc import Iterator

import httpx
import pytest
import respx
from generative_ai_core.embedding import (
    CoreEmbeddingRequest,
    EmbeddingSource,
    create_embedding_runtime,
)
from generative_ai_core.embedding.bedrock import (
    DimensionMismatchError,
    embed_vector,
    parse_vector,
    request_body,
    request_target,
)
from generative_ai_core.provider.clients.openai_compatible import ProviderHttpError
from generative_ai_core.provider.model import (
    CoreCredential,
    CoreProviderId,
    RuntimeProviderConfiguration,
)
from generative_ai_core.retrieval.query_embedding import (
    QueryEmbeddingError,
    embed_text,
)
from generative_ai_core.vector.schema import EMBEDDING_DIMENSIONS

ENDPOINT = "https://bedrock-runtime.example.invalid"
MODEL = "amazon.titan-embed-text-v1"
INVOKE_URL = f"{ENDPOINT}/model/{MODEL}/invoke"
API_KEY = "bedrock-key-fixture"
TEXT = "こんにちは"


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


def _configuration(
    endpoint: str = ENDPOINT, model: str = MODEL
) -> RuntimeProviderConfiguration:
    """Bedrock の埋め込みの設定を作る。

    Parameters
    ----------
    endpoint : str, optional
        接続先（Bedrock Runtime のホスト）。
    model : str, optional
        モデル ID。

    Returns
    -------
    RuntimeProviderConfiguration
        設定。
    """
    return RuntimeProviderConfiguration(
        CoreProviderId.Bedrock, model, endpoint, CoreCredential.api_key(API_KEY)
    )


def _vector(dimensions: int = EMBEDDING_DIMENSIONS) -> list[float]:
    """指定した次元数のベクトルを作る。

    Parameters
    ----------
    dimensions : int, optional
        次元数。

    Returns
    -------
    list[float]
        0.5 を並べたベクトル。
    """
    return [0.5] * dimensions


def _ok(dimensions: int = EMBEDDING_DIMENSIONS) -> httpx.Response:
    """Titan G1 の成功の応答を作る。

    Parameters
    ----------
    dimensions : int, optional
        返すベクトルの次元数。

    Returns
    -------
    httpx.Response
        `embedding` と `inputTextTokenCount` を持つ応答。
    """
    return httpx.Response(
        200, json={"embedding": _vector(dimensions), "inputTextTokenCount": 3}
    )


def _request() -> CoreEmbeddingRequest:
    """学習用の埋め込みリクエストを作る。

    Returns
    -------
    CoreEmbeddingRequest
        ファイルを元にしたリクエスト。
    """
    return (
        CoreEmbeddingRequest.builder("Bedrock")
        .source(EmbeddingSource.of_file("docs/a.txt", TEXT))
        .target_hint("row-1")
        .build()
    )


class TestRequestTarget:
    """接続先の URL と認証のヘッダー（接続先ごとの違いはここだけ）。"""

    def test_url_has_invoke_path_for_model(self) -> None:
        """接続先に /model/{モデル ID}/invoke が付き、末尾の / は重ならないこと"""
        url, _ = request_target(_configuration(f"{ENDPOINT}/"))

        assert url == INVOKE_URL

    def test_model_id_is_url_encoded(self) -> None:
        """モデル ID の記号（: など）が URL エンコードされること"""
        url, _ = request_target(_configuration(model="amazon.titan-embed-text-v2:0"))

        assert url.endswith("/model/amazon.titan-embed-text-v2%3A0/invoke")

    def test_headers_carry_bearer_only(self) -> None:
        """Bearer の API キーが付き、Mantle 向けのキー用ヘッダーは付かないこと"""
        _, headers = request_target(_configuration())

        assert headers["Authorization"] == f"Bearer {API_KEY}"
        assert "x-api-key" not in {name.lower() for name in headers}

    def test_body_has_only_input_text(self) -> None:
        """リクエスト本文は inputText だけであること（Titan G1 の形式）"""
        assert request_body(TEXT) == {"inputText": TEXT}


class TestParseVector:
    """応答の解釈と次元数の検査。"""

    def test_returns_vector_of_expected_dimensions(self) -> None:
        """1536 次元のベクトルがそのまま返ること"""
        assert parse_vector({"embedding": _vector()}) == _vector()

    @pytest.mark.parametrize("dimensions", [1024, 256, 1537])
    def test_other_dimensions_are_rejected(self, dimensions: int) -> None:
        """1536 でない次元数は、DIMENSION_MISMATCH の失敗になること"""
        with pytest.raises(DimensionMismatchError, match="DIMENSION_MISMATCH"):
            parse_vector({"embedding": _vector(dimensions)})

    @pytest.mark.parametrize(
        "body", [{}, {"embedding": []}, {"embedding": "x"}, {"embedding": None}]
    )
    def test_missing_embedding_is_type_error(self, body: dict[str, object]) -> None:
        """embedding がない・空・配列でない応答は TypeError になること"""
        with pytest.raises(TypeError, match="no result"):
            parse_vector(body)


class TestLearning:
    """学習用（文書のチャンクのベクトル化。埋め込みのランタイム経由）。"""

    def test_embeds_and_maps_result(self, router: respx.MockRouter) -> None:
        """InvokeModel に Bearer 付きで送り、結果に対象 ID とファイル名が入ること"""
        route = router.post(INVOKE_URL).mock(return_value=_ok())

        result = create_embedding_runtime(_configuration()).embed(_request())

        sent = route.calls.last.request
        assert sent.headers["Authorization"] == f"Bearer {API_KEY}"
        assert json.loads(sent.content) == {"inputText": TEXT}
        assert result.failure is None
        assert len(result.vector) == EMBEDDING_DIMENSIONS
        assert result.target_id == "row-1"
        assert result.source_name == "docs/a.txt"

    def test_dimension_mismatch_becomes_failure(self, router: respx.MockRouter) -> None:
        """次元数が違うと、保存の前に、原因が分かる失敗の結果になること"""
        router.post(INVOKE_URL).mock(return_value=_ok(1024))

        result = create_embedding_runtime(_configuration()).embed(_request())

        assert result.failure is not None
        assert "DIMENSION_MISMATCH" in result.failure.summary

    def test_http_error_becomes_failure_without_secret(
        self, router: respx.MockRouter
    ) -> None:
        """HTTP エラーが失敗の結果になり、Bearer つきのキーが伏せられること"""
        router.post(INVOKE_URL).mock(
            return_value=httpx.Response(403, text=f"denied Bearer {API_KEY}")
        )

        result = create_embedding_runtime(_configuration()).embed(_request())

        assert result.failure is not None
        assert "HTTP 403" in result.failure.summary
        assert API_KEY not in result.failure.summary


class TestQuery:
    """質問用（質問のベクトル化。`embed_text` 経由）。"""

    def test_embed_text_dispatches_to_bedrock(self, router: respx.MockRouter) -> None:
        """プロバイダが Bedrock のとき、InvokeModel でベクトルが作られること"""
        route = router.post(INVOKE_URL).mock(return_value=_ok())

        vector = embed_text(_configuration(), TEXT)

        assert route.called
        assert len(vector) == EMBEDDING_DIMENSIONS

    def test_query_and_learning_vectors_have_same_dimensions(
        self, router: respx.MockRouter
    ) -> None:
        """学習で保存するベクトルと、検索で作る質問のベクトルの次元数が合うこと"""
        router.post(INVOKE_URL).mock(return_value=_ok())

        learned = create_embedding_runtime(_configuration()).embed(_request()).vector

        assert len(learned) == len(embed_text(_configuration(), TEXT))

    def test_dimension_mismatch_is_query_embedding_error(
        self, router: respx.MockRouter
    ) -> None:
        """次元数が違うと、質問のベクトル化の失敗になること"""
        router.post(INVOKE_URL).mock(return_value=_ok(1024))

        with pytest.raises(QueryEmbeddingError, match="DIMENSION_MISMATCH"):
            embed_text(_configuration(), TEXT)

    def test_http_error_is_query_embedding_error(
        self, router: respx.MockRouter
    ) -> None:
        """HTTP エラーが、質問のベクトル化の失敗になること"""
        router.post(INVOKE_URL).mock(return_value=httpx.Response(401, text="no"))

        with pytest.raises(QueryEmbeddingError, match="HTTP 401"):
            embed_text(_configuration(), TEXT)


class TestEmbedVector:
    """学習用・質問用で共通の送信。"""

    def test_http_error_raises_provider_http_error(
        self, router: respx.MockRouter
    ) -> None:
        """HTTP エラーが ProviderHttpError になり、ステータスが入ること"""
        router.post(INVOKE_URL).mock(return_value=httpx.Response(429, text="slow"))

        with pytest.raises(ProviderHttpError, match="HTTP 429 - slow"):
            embed_vector(_configuration(), TEXT)

    def test_non_object_response_is_type_error(self, router: respx.MockRouter) -> None:
        """JSON のオブジェクトでない応答は、embedding なしとして TypeError になること"""
        router.post(INVOKE_URL).mock(return_value=httpx.Response(200, json=[1, 2]))

        with pytest.raises(TypeError, match="no result"):
            embed_vector(_configuration(), TEXT)
