"""Azure AI Search のコントローラー（移植元 AzureAISearchController）。"""

import json
import logging
from typing import Any

import httpx
from generative_ai_core.network import CoreHttpTransport, create_transport

from embedding_adapter.azure_schema import AISearchRequestSchema, VectorQuery
from embedding_adapter.domain import (
    AzureEmbedding,
    Embedding,
    EmbeddingNetworkProperties,
    VectorDBConfig,
)

logger = logging.getLogger(__name__)

API_VERSION = "2023-11-01"
DEFAULT_MAX_RESULTS = 3
SEARCH_ACTION_MERGE_OR_UPLOAD = "mergeOrUpload"
SEARCH_ACTION_DELETE = "delete"
INDEX_FAILED_MESSAGE = "インデックス操作に失敗しました。 "


class AzureAISearchController:
    """Azure AI Search のインデックスへの保存・削除・ベクトル検索を行う。"""

    def __init__(
        self,
        vector_db_config: VectorDBConfig,
        proxy_setting: EmbeddingNetworkProperties | None,
        transport: CoreHttpTransport | None = None,
    ) -> None:
        """接続先とネットワーク設定を受け取る。

        Parameters
        ----------
        vector_db_config : VectorDBConfig
            ベクトルDB の設定。
        proxy_setting : EmbeddingNetworkProperties | None
            プロキシ・SSL の設定。
        transport : CoreHttpTransport | None
            HTTP 送信。省略時はネットワーク設定から作る（テストでは差し替える）。
        """
        self._vector_db_config = vector_db_config
        self._transport = (
            transport
            if transport is not None
            else create_transport(
                None if proxy_setting is None else proxy_setting.to_setting(None)
            )
        )

    def httppost_json(self, url: str, json_body: str) -> str:
        """JSON を POST して応答本文を返す。

        Parameters
        ----------
        url : str
            送信先の URL。
        json_body : str
            リクエスト本文の JSON。

        Returns
        -------
        str
            応答本文。
        """
        return self._transport.post(
            url,
            {
                "Content-Type": "application/json",
                "api-key": self._vector_db_config.api_key or "",
            },
            json_body.encode("utf-8"),
        ).body

    def httpget(self, url: str, ignored: str) -> str:
        """api-key 付きで GET して応答本文を返す（移植元と同じくプロキシ設定は使わない）。

        Parameters
        ----------
        url : str
            送信先の URL。
        ignored : str
            使わない引数（移植元のシグネチャに合わせている）。

        Returns
        -------
        str
            応答本文。
        """
        response = httpx.get(
            url, headers={"api-key": self._vector_db_config.api_key or ""}
        )
        return response.text

    def _index_url(self, path: str) -> str:
        """インデックスの操作先 URL を作る。

        Parameters
        ----------
        path : str
            インデックス名の後ろのパス（`docs/search` など）。

        Returns
        -------
        str
            api-version 付きの URL。
        """
        return (
            f"{self._vector_db_config.url}/indexes/"
            f"{self._vector_db_config.get_effective_index_name()}/{path}"
            f"?api-version={API_VERSION}"
        )

    def test_connect(self) -> bool:
        """インデックスの統計を取得して接続を確かめる。

        Returns
        -------
        bool
            通信できれば True、通信エラーなら False。
        """
        try:
            self.httpget(self._index_url("stats"), "")
        except httpx.HTTPError:
            return False
        return True

    def find_related(
        self, embedding: Embedding, max_results: int = DEFAULT_MAX_RESULTS
    ) -> list[Embedding]:
        """ベクトルが近いドキュメントを検索する。

        Parameters
        ----------
        embedding : Embedding
            検索するベクトルを持つ Embedding。
        max_results : int
            返す件数。

        Returns
        -------
        list[Embedding]
            ID だけを持つ Embedding の一覧。
        """
        request = AISearchRequestSchema.of(
            VectorQuery.of(embedding.vector, max_results)
        )
        response = self.httppost_json(
            self._index_url("docs/search"), request.to_json_string()
        )
        self.check_error(response)
        return self.parse_response(response)

    def parse_response(self, response: str) -> list[Embedding]:
        """検索応答の `value` から Embedding の一覧を作る。

        Parameters
        ----------
        response : str
            検索応答の JSON。

        Returns
        -------
        list[Embedding]
            ID だけを持つ Embedding の一覧。`value` がなければ空。

        Raises
        ------
        RuntimeError
            応答を解釈できないとき。
        """
        try:
            parsed: Any = json.loads(response)
            value = parsed.get("value")
            if value is None:
                return []
            return [Embedding(id=item["id"]) for item in value]
        except (ValueError, AttributeError, KeyError, TypeError) as e:
            raise RuntimeError(f"Failed to parse response: {response}") from e

    def import_embedding(self, embedding: Embedding, id: str | None) -> str:
        """ドキュメントを mergeOrUpload で保存する。

        Parameters
        ----------
        embedding : Embedding
            保存するベクトルを持つ Embedding。
        id : str | None
            ドキュメント ID。

        Returns
        -------
        str
            保存したドキュメント ID。

        Raises
        ------
        ValueError
            ID が None のとき。
        """
        if id is None:
            raise ValueError("予期せぬ動作です。IDがnullです。")
        azure_embedding = AzureEmbedding(
            id, embedding.vector, SEARCH_ACTION_MERGE_OR_UPLOAD
        )
        response = self.httppost_json(
            self._index_url("docs/index"), azure_embedding.to_json()
        )
        self.check_error(response)
        return id

    def delete_embedding(self, id: str) -> str:
        """ドキュメントを削除する。

        Parameters
        ----------
        id : str
            削除するドキュメント ID。

        Returns
        -------
        str
            削除したドキュメント ID。
        """
        azure_embedding = AzureEmbedding(id, None, SEARCH_ACTION_DELETE)
        response = self.httppost_json(
            self._index_url("docs/index"), azure_embedding.to_json()
        )
        self.check_error(response)
        return id

    def check_error(self, response: str) -> None:
        """応答に `error` があれば失敗にする。

        Parameters
        ----------
        response : str
            応答本文の JSON。

        Raises
        ------
        RuntimeError
            `error` を含む、または解釈できない応答のとき。
        """
        try:
            parsed: Any = json.loads(response)
            if "error" in parsed:
                raise RuntimeError(str(parsed["error"]["message"]))
        except (ValueError, TypeError, KeyError, RuntimeError) as e:
            raise RuntimeError(f"{INDEX_FAILED_MESSAGE}{e}") from e
