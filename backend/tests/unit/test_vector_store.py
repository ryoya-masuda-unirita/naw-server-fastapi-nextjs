from unittest.mock import AsyncMock, patch

import pytest
from azure.core.exceptions import HttpResponseError, ServiceRequestError
from fastapi import HTTPException

from app.core.vector_store import AzureAiSearchVectorStoreClient, VectorSearchResult
from unittest.mock import MagicMock
from typing import Any
from collections.abc import AsyncIterator


class _AsyncResultIterator:
    """検索結果を非同期イテレータとして返すテスト用フェイク"""

    def __init__(self, items: list[dict]) -> None:
        """検索結果を保持する。

        Parameters
        ----------
        items : list[dict]
            返す検索結果。
        """
        self._items = items

    def __aiter__(self) -> AsyncIterator[Any]:
        """非同期イテレータを返す。

        Returns
        -------
        AsyncIterator[Any]
            検索結果を返すイテレータ。
        """
        return self._gen()

    async def _gen(self) -> AsyncIterator[Any]:
        """検索結果を 1 件ずつ返す。

        Yields
        ------
        Any
            検索結果の 1 件。
        """
        for item in self._items:
            yield item


def _mock_search_client(search_results: list[dict]) -> AsyncMock:
    """検索結果を返すモックの検索クライアントを生成する。

    Parameters
    ----------
    search_results : list[dict]
        検索が返す結果。

    Returns
    -------
    AsyncMock
        モックの検索クライアント。
    """
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.search.return_value = _AsyncResultIterator(search_results)
    return mock_client


class TestSimilaritySearch:
    """AzureAiSearchVectorStoreClient.similarity_search のテスト"""

    @patch("app.core.vector_store.SearchClient")
    async def test_returns_content_and_file_unique_id(
        self, mock_search_client_cls: MagicMock
    ) -> None:
        """content・metadataのfileUniqueIdからVectorSearchResultへ変換されること"""
        mock_search_client_cls.return_value = _mock_search_client(
            [{"content": "資料1", "metadata": '{"fileUniqueId": "f001"}'}]
        )

        results = await AzureAiSearchVectorStoreClient.similarity_search(
            "https://example.search.windows.net",
            "api-key",
            "tenant-1",
            [0.1, 0.2],
        )

        assert results == [VectorSearchResult(content="資料1", file_unique_id="f001")]

    @patch("app.core.vector_store.SearchClient")
    async def test_returns_none_file_unique_id_when_metadata_missing(
        self, mock_search_client_cls: MagicMock
    ) -> None:
        """metadataが空/fileUniqueIdを含まない場合、file_unique_idがNoneになること"""
        mock_search_client_cls.return_value = _mock_search_client(
            [{"content": "資料1", "metadata": None}, {"content": "資料2"}]
        )

        results = await AzureAiSearchVectorStoreClient.similarity_search(
            "https://example.search.windows.net", "api-key", "tenant-1", [0.1]
        )

        assert results == [
            VectorSearchResult(content="資料1", file_unique_id=None),
            VectorSearchResult(content="資料2", file_unique_id=None),
        ]

    @pytest.mark.parametrize("error_cls", [HttpResponseError, ServiceRequestError])
    @patch("app.core.vector_store.SearchClient")
    async def test_raises_400_on_azure_search_error(
        self, mock_search_client_cls: MagicMock, error_cls: Any
    ) -> None:
        """Azure AI Searchへの接続・検索に失敗した場合400になること"""
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.search.side_effect = error_cls("connection failed")
        mock_search_client_cls.return_value = mock_client

        with pytest.raises(HTTPException) as exc_info:
            await AzureAiSearchVectorStoreClient.similarity_search(
                "https://example.search.windows.net", "api-key", "tenant-1", [0.1]
            )

        assert exc_info.value.status_code == 400
