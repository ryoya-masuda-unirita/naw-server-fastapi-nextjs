"""Azure AI Search のプロバイダ（移植元 AzureAiSearchCoreVectorDbProvider）。

移植元は Spring の RestClient + Gson。Python では httpx で同じ要求を送る。
ネットワーク設定（プロキシ・SSL・タイムアウト）は `generative_ai_core.network` で当てる。
"""

import json
import math
from collections.abc import Callable
from typing import Any

import httpx

from generative_ai_core.network.transport import client_options
from generative_ai_core.vector.model import (
    CoreVectorDbOperation,
    CoreVectorDbRequest,
    CoreVectorDbResult,
    CoreVectorSearchMatch,
)
from generative_ai_core.vector.pgvector import search_limit

PROVIDER_ID = "AzureAISearch"
API_VERSION = "2023-11-01"
API_KEY_HEADER = "api-key"
VECTOR_FIELD = "contentVector"

SearchExecutor = Callable[[CoreVectorDbRequest], str]


def _trim_trailing_slash(value: str) -> str:
    """末尾の `/` を 1 つ除く。

    Parameters
    ----------
    value : str
        URL。

    Returns
    -------
    str
        末尾の `/` を除いた URL。
    """
    return value.removesuffix("/")


class AzureAiSearchCoreVectorDbProvider:
    """Azure AI Search へのベクトルの保存・削除・検索。"""

    def __init__(self, search_executor: SearchExecutor | None = None) -> None:
        """検索の実行を差し替える関数を受け取る。

        Parameters
        ----------
        search_executor : SearchExecutor | None
            検索要求を受けて応答の JSON 文字列を返す関数（テスト用）。省略時は HTTP で送る。
        """
        self._search_executor = search_executor

    def provider_id(self) -> str:
        """プロバイダ ID を返す。

        Returns
        -------
        str
            `AzureAISearch`。
        """
        return PROVIDER_ID

    def execute(self, request: CoreVectorDbRequest) -> CoreVectorDbResult:
        """要求を実行する。

        Parameters
        ----------
        request : CoreVectorDbRequest
            要求。

        Returns
        -------
        CoreVectorDbResult
            結果。

        Raises
        ------
        RuntimeError
            Azure AI Search がエラーを返したとき。
        """
        if request.operation == CoreVectorDbOperation.SEARCH:
            return self._search(request)
        target = request.target
        endpoint = _trim_trailing_slash(target.required_endpoint())
        url = f"{endpoint}/indexes/{target.required_index_name()}/docs/index?api-version={API_VERSION}"
        is_delete = request.operation == CoreVectorDbOperation.DELETE
        document: dict[str, Any] = {"id": request.payload.id}
        if not is_delete:
            # Gson は null のフィールドを出力しないため、削除ではベクトルを付けない
            document[VECTOR_FIELD] = list(request.payload.vector)
        document["@search.action"] = "delete" if is_delete else "mergeOrUpload"
        response = self._post(request, url, {"value": [document]})
        self._fail_on_azure_error(response)
        return CoreVectorDbResult.ok(request.payload.id, request.operation)

    def _search(self, request: CoreVectorDbRequest) -> CoreVectorDbResult:
        """ベクトル検索を実行する。

        Parameters
        ----------
        request : CoreVectorDbRequest
            要求。

        Returns
        -------
        CoreVectorDbResult
            検索結果。
        """
        target = request.target
        endpoint = _trim_trailing_slash(target.required_endpoint())
        url = f"{endpoint}/indexes/{target.required_index_name()}/docs/search?api-version={API_VERSION}"
        body = {
            "vectorQueries": [
                {
                    "vector": list(request.payload.vector),
                    "k": search_limit(request),
                    "fields": VECTOR_FIELD,
                    "kind": "vector",
                    "exhaustive": True,
                }
            ]
        }
        if self._search_executor is None:
            response = self._post(request, url, body)
        else:
            response = self._search_executor(request)
        return CoreVectorDbResult.search_success(
            request.operation, self._parse_search_matches(response)
        )

    @staticmethod
    def _post(request: CoreVectorDbRequest, url: str, body: dict[str, Any]) -> str:
        """JSON を POST し、応答本文を返す。

        Parameters
        ----------
        request : CoreVectorDbRequest
            要求（接続先とネットワーク設定を使う）。
        url : str
            送信先。
        body : dict[str, Any]
            送る JSON。

        Returns
        -------
        str
            応答本文。

        Raises
        ------
        httpx.HTTPStatusError
            HTTP エラーが返ったとき。
        """
        with httpx.Client(**client_options(request.network_setting)) as client:
            response = client.post(
                url,
                content=json.dumps(body, ensure_ascii=False).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    API_KEY_HEADER: request.target.required_api_key(),
                },
            )
            response.raise_for_status()
            return response.text

    @staticmethod
    def _parse_search_matches(response: str | None) -> list[CoreVectorSearchMatch]:
        """検索応答の JSON を検索結果の行にする。

        Parameters
        ----------
        response : str | None
            応答本文。

        Returns
        -------
        list[CoreVectorSearchMatch]
            検索結果。

        Raises
        ------
        ValueError
            応答の形が不正なとき。
        """
        try:
            parsed = json.loads(response) if response and response.strip() else None
        except ValueError as e:
            raise ValueError("Malformed Azure AI Search response") from e
        if not isinstance(parsed, dict) or not isinstance(parsed.get("value"), list):
            raise ValueError("Malformed Azure AI Search response")  # noqa: TRY004
        matches: list[CoreVectorSearchMatch] = []
        for item in parsed["value"]:
            if not isinstance(item, dict):
                raise ValueError("Malformed Azure AI Search result item")  # noqa: TRY004
            matches.append(
                CoreVectorSearchMatch(
                    _string_value(item, "id"),
                    _string_value(item, "content"),
                    _vector_value(item, VECTOR_FIELD),
                    _string_value(item, "fileUniqueId"),
                )
            )
        return matches

    @staticmethod
    def _fail_on_azure_error(response: str | None) -> None:
        """応答にエラーや一部失敗があれば例外にする。

        Parameters
        ----------
        response : str | None
            応答本文。

        Raises
        ------
        RuntimeError
            応答に `error` があるとき、または `value` に失敗の項目があるとき。
        """
        if response is None or not response.strip():
            return
        parsed = json.loads(response)
        if not isinstance(parsed, dict):
            return
        if "error" in parsed:
            raise RuntimeError("Azure AI Search operation failed")
        values = parsed.get("value")
        if isinstance(values, list):
            for item in values:
                if "status" in item and not item["status"]:
                    raise RuntimeError("Azure AI Search partial operation failed")


def _string_value(item: dict[str, Any], name: str) -> str:
    """JSON オブジェクトから文字列を取り出す（なければ空）。

    Parameters
    ----------
    item : dict[str, Any]
        JSON オブジェクト。
    name : str
        キー。

    Returns
    -------
    str
        値。null・なしは空文字。
    """
    value = item.get(name)
    return "" if value is None else str(value)


def _vector_value(item: dict[str, Any], name: str) -> tuple[float, ...]:
    """JSON オブジェクトからベクトルを取り出す。

    Parameters
    ----------
    item : dict[str, Any]
        JSON オブジェクト。
    name : str
        キー。

    Returns
    -------
    tuple[float, ...]
        ベクトル。null・なしは空。

    Raises
    ------
    ValueError
        配列でない・非有限値を含むとき。
    """
    value = item.get(name)
    if value is None:
        return ()
    if not isinstance(value, list):
        raise ValueError("Malformed Azure AI Search vector field")  # noqa: TRY004
    result: list[float] = []
    for element in value:
        number = float(element)
        if math.isnan(number) or math.isinf(number):
            raise ValueError("Malformed Azure AI Search vector value")
        result.append(number)
    return tuple(result)
