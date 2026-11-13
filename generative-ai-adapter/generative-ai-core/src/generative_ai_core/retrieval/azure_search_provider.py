"""Azure AI Search の検索プロバイダ（移植元 CoreAzureAiSearchRetrievalProvider）。

`POST {URL}/indexes/{インデックス}/docs/search?api-version=2023-11-01`（`api-key`）に、クエリの
ベクトルでのベクトル検索（`contentVector` を総当たり、`id` だけ返す）を送り、`value[].id` を
関連の高い順の ID にする。
"""

import json
import logging
from collections.abc import Sequence

from generative_ai_core.network.transport import create_transport
from generative_ai_core.retrieval.failure_sanitizer import CoreRetrievalFailureSanitizer
from generative_ai_core.retrieval.models import (
    CoreRetrievalRequest,
    CoreRetrievalResult,
)
from generative_ai_core.retrieval.query_embedding import (
    CoreDefaultQueryEmbeddingGenerator,
    QueryEmbeddingGenerator,
)
from generative_ai_core.vector.target import CoreVectorDbTarget

logger = logging.getLogger(__name__)

API_VERSION = "2023-11-01"
HTTP_ERROR_THRESHOLD = 400
VECTOR_FIELD = "contentVector"


class MalformedAzureSearchResultError(RuntimeError):
    """Azure AI Search の応答が想定の形でないこと。"""


class CoreAzureAiSearchRetrievalProvider:
    """Azure AI Search のベクトル検索。"""

    def __init__(
        self, embedding_generator: QueryEmbeddingGenerator | None = None
    ) -> None:
        """クエリのベクトル化を受け取る。

        Parameters
        ----------
        embedding_generator : QueryEmbeddingGenerator | None
            クエリのベクトル化。省略すると既定。
        """
        self._embedding_generator = (
            embedding_generator or CoreDefaultQueryEmbeddingGenerator()
        )
        self._failure_sanitizer = CoreRetrievalFailureSanitizer()

    def retrieve(self, request: CoreRetrievalRequest) -> CoreRetrievalResult:
        """検索する。例外は失敗の結果にする。

        Parameters
        ----------
        request : CoreRetrievalRequest
            検索リクエスト。

        Returns
        -------
        CoreRetrievalResult
            検索結果。ID の並びだけで、本文などの証拠はない。
        """
        try:
            target = self._require_target(request)
            endpoint = target.required_endpoint().removesuffix("/")
            url = (
                f"{endpoint}/indexes/{target.required_index_name()}"
                f"/docs/search?api-version={API_VERSION}"
            )
            body = self._search_body(
                self._embedding_generator.embed(request), request.max_results
            )
            logger.info("azure ai search: POST indexes/<index>/docs/search")
            response = create_transport(request.network_setting).post(
                url,
                {
                    "Content-Type": "application/json",
                    "api-key": target.required_api_key(),
                },
                body.encode("utf-8"),
            )
            if response.status_code >= HTTP_ERROR_THRESHOLD:
                raise RuntimeError(f"HTTP {response.status_code}")
            return self.parse_result(response.body)
        except MalformedAzureSearchResultError:
            return CoreRetrievalResult.of_failure(
                self._failure_sanitizer.malformed_result(
                    "retrieval provider result is malformed"
                )
            )
        except ValueError:
            return CoreRetrievalResult.of_failure(
                self._failure_sanitizer.malformed_result(
                    "retrieval provider configuration is invalid"
                )
            )
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            return CoreRetrievalResult.of_failure(
                self._failure_sanitizer.provider_failure(e)
            )

    def parse_result(self, response: str | None) -> CoreRetrievalResult:
        """応答から ID の並びを取り出して成功の結果にする。

        Parameters
        ----------
        response : str | None
            応答本文。

        Returns
        -------
        CoreRetrievalResult
            成功の結果。形が違えば `MALFORMED_RESULT` の失敗。
        """
        try:
            return CoreRetrievalResult.success(self.parse_ids(response), False)
        except (MalformedAzureSearchResultError, ValueError):
            return CoreRetrievalResult.of_failure(
                self._failure_sanitizer.malformed_result(
                    "retrieval provider result is malformed"
                )
            )

    @staticmethod
    def parse_ids(response: str | None) -> list[str]:
        """応答の `value[].id` を順に取り出す。

        Parameters
        ----------
        response : str | None
            応答本文。

        Returns
        -------
        list[str]
            ID の並び。

        Raises
        ------
        MalformedAzureSearchResultError
            空・`value` が配列でない・`id` が文字列でない/空のとき。
        """
        if response is None or not response.strip():
            raise MalformedAzureSearchResultError
        root = json.loads(response)
        if not isinstance(root, dict) or not isinstance(root.get("value"), list):
            raise MalformedAzureSearchResultError
        ids: list[str] = []
        for item in root["value"]:
            if not isinstance(item, dict):
                raise MalformedAzureSearchResultError
            identifier = item.get("id")
            if not isinstance(identifier, str) or not identifier.strip():
                raise MalformedAzureSearchResultError
            ids.append(identifier)
        return ids

    @staticmethod
    def _search_body(vector: Sequence[float], max_results: int) -> str:
        """検索のリクエスト本文を作る。

        Parameters
        ----------
        vector : Sequence[float]
            クエリのベクトル。
        max_results : int
            最大件数。

        Returns
        -------
        str
            JSON 文字列。
        """
        return json.dumps(
            {
                "count": True,
                "select": "id",
                "vectorQueries": [
                    {
                        "vector": list(vector),
                        "k": max_results,
                        "fields": VECTOR_FIELD,
                        "kind": "vector",
                        "exhaustive": True,
                    }
                ],
            }
        )

    @staticmethod
    def _require_target(request: CoreRetrievalRequest) -> CoreVectorDbTarget:
        """ベクトルDB の接続先を取り出す。

        Parameters
        ----------
        request : CoreRetrievalRequest
            検索リクエスト。

        Returns
        -------
        CoreVectorDbTarget
            接続先。

        Raises
        ------
        ValueError
            接続先がないとき。
        """
        if request.vector_db_target is None:
            raise ValueError("vectorDbTarget is required")
        return request.vector_db_target
