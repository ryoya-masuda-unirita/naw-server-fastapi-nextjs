"""Azure AI Searchへのベクトル類似検索を行うクライアント。

移植元(Spring Boot)版はSpring AIの`AzureVectorStore`（`VectorStoreFactory`経由）を使い、
インデックスのスキーマ自動作成も行うが、本モジュールでは検索のみを実装する（ファイル
アップロード時のインデックス登録・スキーマ管理はFile/Index管理API自体が未移植のため
別Issueで対応する。既存インデックスへの検索のみが対象）。

フィールド名（`content`・`metadata`・`embedding`）は移植元が使うSpring AI
`AzureVectorStore`の標準スキーマに合わせている。

`services/`配下の他サービスから呼び出す外部API連携のため、「serviceが別serviceを
呼ばない」規約に抵触しないよう`core/`（インフラ層）に配置する。Azure SDKの呼び出しを
このモジュールに閉じ込めることで、テスト時は`AzureAiSearchVectorStoreClient`のみを
モックすればよいようにする。
"""

import json
import logging
from dataclasses import dataclass
from urllib.parse import urlparse

from azure.core.credentials import AzureKeyCredential
from azure.core.exceptions import HttpResponseError, ServiceRequestError
from azure.search.documents.aio import SearchClient
from azure.search.documents.models import VectorizedQuery
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

# 移植元 `VectorStoreFactory.CustomMetaField.File_Unique_ID` の実体値。
FILE_UNIQUE_ID_METADATA_KEY = "fileUniqueId"

# Spring AI `SearchRequest` のデフォルトtop-k値を踏襲する。
DEFAULT_TOP_K = 4

# 移植元 `IndexNotFoundTolerantVectorStore` と同じ判定値。
_HTTP_NOT_FOUND = 404
_SEARCH_INDEXES_PATH = "/indexes"

_CONTENT_FIELD = "content"
_METADATA_FIELD = "metadata"
_EMBEDDING_FIELD = "embedding"


@dataclass(frozen=True)
class VectorSearchResult:
    """ベクトル類似検索の1件の結果。"""

    content: str
    file_unique_id: str | None


class AzureAiSearchVectorStoreClient:
    """Azure AI Searchへベクトル類似検索を実行するクライアント。"""

    @staticmethod
    async def similarity_search(
        endpoint: str,
        api_key: str,
        index_name: str,
        query_vector: list[float],
        top_k: int = DEFAULT_TOP_K,
    ) -> list[VectorSearchResult]:
        """クエリベクトルに類似するドキュメントをAzure AI Searchから検索する。

        Parameters
        ----------
        endpoint : str
            テナントに紐づくベクトルDB接続情報のエンドポイントURL。
        api_key : str
            テナントに紐づくベクトルDB接続情報のAPIキー。
        index_name : str
            検索対象のAzure Searchインデックス名
            （移植元同様、ベクトルDB接続情報が属するテナントIDを使う）。
        query_vector : list[float]
            検索クエリの埋め込みベクトル。
        top_k : int
            取得する類似ドキュメント件数の上限。

        Returns
        -------
        list[VectorSearchResult]
            類似度順の検索結果一覧。インデックスが無い場合は空リスト。

        Raises
        ------
        HTTPException
            Azure AI Searchへの接続・検索に失敗した場合は400
            （インデックスが無いことによる404を除く）。
        """
        try:
            async with SearchClient(
                endpoint=endpoint,
                index_name=index_name,
                credential=AzureKeyCredential(api_key),
            ) as client:
                vector_query = VectorizedQuery(
                    vector=query_vector,
                    k_nearest_neighbors=top_k,
                    fields=_EMBEDDING_FIELD,
                )
                results = await client.search(
                    search_text=None,
                    vector_queries=[vector_query],
                    select=[_CONTENT_FIELD, _METADATA_FIELD],
                    top=top_k,
                )
                return [_to_search_result(document) async for document in results]
        except HttpResponseError as error:
            if _is_index_not_found(error):
                # 学習データ未登録のテナントやVDB接続先変更直後はインデックスが無い。
                # 探す物が無いだけなので、チャットを止めず0件として扱う。
                logger.info(
                    "インデックスが無いため、学習データの検索を0件として扱います: index=%s",
                    index_name,
                )
                return []
            logger.exception("ベクトルDBへの接続・検索に失敗しました")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to connect to vector database",
            ) from None
        except ServiceRequestError:
            logger.exception("ベクトルDBへの接続・検索に失敗しました")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to connect to vector database",
            ) from None


def _is_index_not_found(error: HttpResponseError) -> bool:
    """検索の失敗が「Azure AI Searchのインデックスが無い」ことによるものか判定する。

    検索の途中で呼ばれる別のAPIの404（デプロイが無い等）は設定の誤りであり、
    0件にすると誤りが隠れるため、インデックスへの要求（`/indexes`配下）の404に限る。

    Parameters
    ----------
    error : HttpResponseError
        Azure SDKが送出した検索失敗の例外。

    Returns
    -------
    bool
        インデックスへの要求の404であればTrue。
    """
    if error.status_code != _HTTP_NOT_FOUND:
        return False
    request = getattr(error.response, "request", None)
    url = getattr(request, "url", None)
    if not isinstance(url, str):
        return False
    return urlparse(url).path.startswith(_SEARCH_INDEXES_PATH)


def _to_search_result(document: dict) -> VectorSearchResult:
    """Azure AI Searchの検索結果1件を`VectorSearchResult`へ変換する。

    Parameters
    ----------
    document : dict
        Azure AI Searchが返す1件分のフィールド辞書。

    Returns
    -------
    VectorSearchResult
        変換後の検索結果。
    """
    metadata_raw = document.get(_METADATA_FIELD)
    metadata: dict = json.loads(metadata_raw) if metadata_raw else {}
    return VectorSearchResult(
        content=document.get(_CONTENT_FIELD) or "",
        file_unique_id=metadata.get(FILE_UNIQUE_ID_METADATA_KEY),
    )
