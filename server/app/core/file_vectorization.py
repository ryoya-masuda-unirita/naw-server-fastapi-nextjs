"""学習データのファイルを、分割・埋め込み・ベクトルの保存まで行う部品（移植元 `FileService` の移植）。

移植元の `FileService.createFile` は、ファイルのテキストを取り出し（Tika）、分割長で分割し、
埋め込みを作ってベクトルストアに保存し、埋め込みのトークンをクレジットに数える。この部品は、
その処理を移したもの。

移植元と違う点（Python 版だけの拡張・簡略化）:

- ベクトルの保存先は pgvector（`pgvector_store`）。埋め込みは Azure OpenAI か Bedrock（Titan）
- テキストの取り出しは、Tika が使えるときは Tika（`tika_client`）、なければテキスト系の形式だけ
  （`extract_text`）
- ベクトル化できる設定（pgvector の VDB 接続先と、埋め込みの接続先）がないフォルダは、
  従来どおり、ファイルの記録だけを作る
"""

import logging
import re
import uuid
from dataclasses import dataclass
from html.parser import HTMLParser

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.bedrock_embedding import (  # bedrock-ext
    BEDROCK_EMBEDDING_MODEL_ID,
    BedrockLlmEmbeddingClient,
)
from app.core.config import get_llm_credit_settings
from app.core.llm_client import AzureLlmEmbeddingClient, EmbeddingResult
from app.core.pgvector_store import (  # pgvector-ext
    PgVectorStoreClient,
    VectorRow,
    is_pgvector_endpoint,
)
from app.core import tika_client
from app.core.token_usage_credit import embedding_credits, positive_token_weight
from app.models.ai_model import AIModelEndpointType
from app.models.tenant_endpoint import EndpointType, TenantEndpoint
from app.models.token_usage import TokenUsage
from app.repositories.ai_model_repository import AIModelRepository
from app.repositories.index_repository import IndexRepository
from app.repositories.tenant_endpoint_repository import TenantEndpointRepository

logger = logging.getLogger(__name__)

DEFAULT_SPLIT_LENGTH = 1000
# 1 つのファイルを分割できる数の上限。埋め込みは部分ごとに 1 回ずつ、順に呼ぶため、
# 巨大なファイルが、リクエストを長時間止めたり、埋め込みの回数制限に当たったりするのを防ぐ
MAX_CHUNKS_PER_FILE = 2000
MIN_SPLIT_LENGTH = 100
MAX_SPLIT_LENGTH = 10000
# 移植元 `MessageService.EMBEDDING_MODEL_NAME`。Azure の埋め込みのモデル名
AZURE_EMBEDDING_MODEL_NAME = "text-embedding-ada-002"
_SENTENCE_BOUNDARY = re.compile(r"[。.!?！？]")
_INTEGER = re.compile(r"[+-]?[0-9]+")
_TEXT_EXTENSIONS = frozenset(
    {
        ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".xml", ".html",
        ".htm", ".log", ".yaml", ".yml", ".ini", ".conf", ".rst",
    }
)  # fmt: skip
_TEXT_CONTENT_TYPES = frozenset(
    {"application/json", "application/xml", "application/x-yaml", "application/csv"}
)
_MARKUP_EXTENSIONS = frozenset({".html", ".htm", ".xml"})
_TEXT_ENCODINGS = ("utf-8-sig", "cp932")
TOO_MANY_CHUNKS_DETAIL = "ファイルが大きすぎます（分割数の上限は {limit}）。分割長を大きくするか、ファイルを分けてください。"
STORE_FAILED_DETAIL = "Failed to store vectors for file"
UNSUPPORTED_FORMAT_DETAIL = (
    "このファイル形式のテキストは取り出せません（対応: テキスト・Markdown・CSV・JSON・"
    "XML・HTML など）。"
)
EMBEDDING_FAILED_DETAIL = "Failed to create embedding for file"


def validate_split_length(split_length: str | None) -> int:
    """分割長を検証して、整数にする（移植元 `validateSplitLength`）。

    Parameters
    ----------
    split_length : str | None
        フォームの `splitLength`。空なら既定の 1000。

    Returns
    -------
    int
        分割長（100〜10000）。

    Raises
    ------
    HTTPException
        数値でない、または範囲外のとき（400）。
    """
    if not split_length:
        return DEFAULT_SPLIT_LENGTH
    if _INTEGER.fullmatch(split_length) is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="分割長には有効な数値（100〜10000）を指定してください。",
        )
    length = int(split_length)
    if length < MIN_SPLIT_LENGTH or length > MAX_SPLIT_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="分割長は100から10000の間で指定してください。",
        )
    return length


def split_content(content: str, split_length: int) -> list[str]:
    """文の区切りで、分割長ごとに分ける（移植元 `ContentSplitter.split` と同じ）。

    文の区切り（``。.!?！？``）で文に分け、分割長に収まるようにつなぐ。分割長を超える文は、
    分割長ごとに強制的に分ける。区切りは取り除かれ、つないだ文の後ろには ``。`` が付く。

    Parameters
    ----------
    content : str
        分割する文章。
    split_length : int
        1 つの部分の長さの上限。

    Returns
    -------
    list[str]
        分割した部分。空文字や分割長が 0 以下のときは、元の文章 1 つ。
    """
    if not content or split_length <= 0:
        return [content]
    parts: list[str] = []
    current: list[str] = []
    current_length = 0
    sentences = _SENTENCE_BOUNDARY.split(content)
    # Java の String 分割と同じく、末尾の空の要素は捨てる
    while sentences and sentences[-1] == "":
        sentences.pop()
    for sentence in sentences:
        if current_length + len(sentence) > split_length:
            if current:
                parts.append("".join(current).strip())
                current, current_length = [], 0
            if len(sentence) > split_length:
                # 文が分割長より長い場合は、強制的に分割する
                for start in range(0, len(sentence), split_length):
                    parts.append(sentence[start : start + split_length])
                continue
        current.append(sentence + "。")
        current_length += len(sentence) + 1
    if current:
        parts.append("".join(current).strip())
    return parts


class _TextExtractor(HTMLParser):
    """HTML・XML から、タグを除いた本文を集める。"""

    def __init__(self) -> None:
        """集めた本文の入れ物を用意する。"""
        super().__init__()
        self.chunks: list[str] = []

    def handle_data(self, data: str) -> None:
        """本文の文字列を集める。

        Parameters
        ----------
        data : str
            タグの間の文字列。
        """
        if data.strip():
            self.chunks.append(data.strip())


def extract_text(filename: str, content_type: str | None, data: bytes) -> str:
    """ファイルから、テキストを取り出す（移植元の Tika の代わり。テキスト系だけ）。

    Parameters
    ----------
    filename : str
        ファイル名（拡張子で形式を判断する）。
    content_type : str | None
        アップロードの Content-Type。
    data : bytes
        ファイルの中身。

    Returns
    -------
    str
        取り出したテキスト。

    Raises
    ------
    HTTPException
        対応していない形式、または文字コードを判別できないとき（400）。
    """
    extension = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    media_type = (content_type or "").split(";")[0].strip().lower()
    is_text = (
        extension in _TEXT_EXTENSIONS
        or media_type.startswith("text/")
        or media_type in _TEXT_CONTENT_TYPES
    )
    if not is_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=UNSUPPORTED_FORMAT_DETAIL
        )
    for encoding in _TEXT_ENCODINGS:
        try:
            text = data.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ファイルの文字コードを判別できません（UTF-8 または Shift_JIS に対応）。",
        )
    if extension in _MARKUP_EXTENSIONS or media_type in {
        "text/html",
        "application/xml",
    }:
        parser = _TextExtractor()
        parser.feed(text)
        return "\n".join(parser.chunks)
    return text


async def extract_content(filename: str, content_type: str | None, data: bytes) -> str:
    """ファイルから、本文のテキストを取り出す（移植元 `TikaService.extractContent`）。

    Tika の設定があるときは、すべての形式を Tika で取り出す（PDF・Office・CSV など）。
    なければ、テキスト系の形式だけを取り出す。

    Parameters
    ----------
    filename : str
        ファイル名。
    content_type : str | None
        アップロードの Content-Type。
    data : bytes
        ファイルの中身。

    Returns
    -------
    str
        取り出した本文。

    Raises
    ------
    HTTPException
        取り出せないとき（400）。
    """
    if tika_client.is_enabled():
        return await tika_client.TikaClient.extract_text(filename, content_type, data)
    return extract_text(filename, content_type, data)


@dataclass(frozen=True)
class VectorTarget:
    """ベクトル化の保存先と、埋め込みの接続先。"""

    vdb: TenantEndpoint
    embedding: TenantEndpoint


async def resolve_vdb(tenant_id: str, session: AsyncSession) -> TenantEndpoint | None:
    """ベクトルを保存・削除する、pgvector の接続先を返す（RAG の検索と同じ選び方）。

    Parameters
    ----------
    tenant_id : str
        テナントの ID。
    session : AsyncSession
        非同期DBセッション。

    Returns
    -------
    TenantEndpoint | None
        id が最小の VDB 接続先。pgvector でない、または未設定なら None。
    """
    endpoints = await TenantEndpointRepository.find_by_tenant_id_and_type(
        tenant_id, EndpointType.VDB, session
    )
    if not endpoints:
        return None
    vdb = min(endpoints, key=lambda endpoint: endpoint.id)
    if not is_pgvector_endpoint(vdb.endpoint):
        logger.warning(
            "ベクトルDBが pgvector ではないため、ベクトルの保存・削除をしません"
        )
        return None
    return vdb


async def resolve_target(
    index_id: str, tenant_id: str, session: AsyncSession
) -> VectorTarget | None:
    """学習先フォルダの、ベクトルの保存先と埋め込みの接続先を返す。

    Parameters
    ----------
    index_id : str
        学習先フォルダの ID。
    tenant_id : str
        テナントの ID。
    session : AsyncSession
        非同期DBセッション。

    Returns
    -------
    VectorTarget | None
        ベクトル化できる設定のとき。pgvector の VDB 接続先か、埋め込みの接続先がなければ
        None（従来どおり、ファイルの記録だけを作る）。
    """
    vdb = await resolve_vdb(tenant_id, session)
    if vdb is None:
        return None
    endpoints_map = await IndexRepository.find_tenant_endpoints_grouped_by_index_ids(
        [index_id], tenant_id, session
    )
    embedding = next(
        (
            endpoint
            for endpoint in sorted(endpoints_map.get(index_id, []), key=lambda e: e.id)
            if endpoint.type
            in (EndpointType.AZURE_OPENAI_EMBEDDING, EndpointType.BEDROCK_EMBEDDING)
        ),
        None,
    )
    if embedding is None:
        logger.warning("埋め込みの接続先がないため、ベクトルの保存をしません")
        return None
    return VectorTarget(vdb, embedding)


async def delete_vectors(vdb: TenantEndpoint, file_id: str) -> int:
    """ファイル 1 つ分のベクトルを削除する。

    Parameters
    ----------
    vdb : TenantEndpoint
        pgvector の接続先。
    file_id : str
        ファイルの ID。

    Returns
    -------
    int
        削除した行数。
    """
    return await PgVectorStoreClient.delete_by_file_id(
        vdb.endpoint, vdb.api_key, vdb.tenant_id, file_id
    )


async def _embed(endpoint: TenantEndpoint, text: str) -> tuple[EmbeddingResult, str]:
    """接続先の種別に応じて、Azure か Bedrock で、文字列を埋め込む。

    Parameters
    ----------
    endpoint : TenantEndpoint
        埋め込みの接続先。
    text : str
        ベクトルにする文字列。

    Returns
    -------
    tuple[EmbeddingResult, str]
        ベクトルとトークン数、使ったモデル名。
    """
    if endpoint.type == EndpointType.BEDROCK_EMBEDDING:  # bedrock-ext
        result = await BedrockLlmEmbeddingClient.create_embedding(
            endpoint.endpoint, endpoint.api_key, BEDROCK_EMBEDDING_MODEL_ID, text
        )
        return result, BEDROCK_EMBEDDING_MODEL_ID
    result = await AzureLlmEmbeddingClient.create_embedding(
        endpoint.endpoint, endpoint.api_key, AZURE_EMBEDDING_MODEL_NAME, text, None
    )
    return result, AZURE_EMBEDDING_MODEL_NAME


class FileVectorizer:
    """ファイルの中身を、分割・埋め込み・保存する（登録・差し替えの 1 回分）。"""

    def __init__(
        self,
        target: VectorTarget,
        split_length: int,
        tenant_id: str,
        user_id: uuid.UUID,
        session: AsyncSession,
    ) -> None:
        """保存先・分割長・記録先を受け取る。

        Parameters
        ----------
        target : VectorTarget
            ベクトルの保存先と埋め込みの接続先。
        split_length : int
            分割長。
        tenant_id : str
            テナントの ID。
        user_id : uuid.UUID
            登録するユーザーの ID（埋め込みの使用量の記録に使う）。
        session : AsyncSession
            非同期DBセッション。使用量を追加する（コミットは呼び出し側）。
        """
        self._target = target
        self._split_length = split_length
        self._tenant_id = tenant_id
        self._user_id = user_id
        self._session = session

    async def add(
        self, file_id: str, filename: str, content_type: str | None, data: bytes
    ) -> None:
        """ファイルを分割して、埋め込み、ベクトルを保存し、使用量を記録する。

        Parameters
        ----------
        file_id : str
            ファイルの ID（ベクトルの `fileid`）。
        filename : str
            ファイル名（形式の判断と、参照元に使う）。
        content_type : str | None
            Content-Type。
        data : bytes
            ファイルの中身。

        Raises
        ------
        HTTPException
            形式が未対応、埋め込み・保存に失敗したとき（400）。
        """
        text = await extract_content(filename, content_type, data)
        if not text.strip():
            # 空白だけの文章を分割すると「。」だけの部分ができてしまうため、先に除く
            logger.warning("コンテンツが空のため、分割・保存はしません: %s", filename)
            return
        chunks = [
            part for part in split_content(text, self._split_length) if part.strip()
        ]
        if not chunks:
            logger.warning("コンテンツが空のため、分割・保存はしません: %s", filename)
            return
        if len(chunks) > MAX_CHUNKS_PER_FILE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=TOO_MANY_CHUNKS_DETAIL.format(limit=MAX_CHUNKS_PER_FILE),
            )
        embedding_endpoint = self._target.embedding
        rows: list[VectorRow] = []
        total_tokens = 0
        model_name = AZURE_EMBEDDING_MODEL_NAME
        try:
            for chunk in chunks:
                result, model_name = await _embed(embedding_endpoint, chunk)
                total_tokens += result.tokens
                rows.append(
                    VectorRow(uuid.uuid4(), file_id, filename, chunk, result.embedding)
                )
        except Exception as error:
            logger.error("ファイルの埋め込みに失敗しました: %s", type(error).__name__)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=EMBEDDING_FAILED_DETAIL
            ) from None
        vdb = self._target.vdb
        try:
            await PgVectorStoreClient.add_rows(
                vdb.endpoint, vdb.api_key, vdb.tenant_id, rows
            )
        except HTTPException:
            raise
        except Exception as error:  # 次元数の不一致など、想定外の失敗も 400 にする
            logger.error("ベクトルの保存に失敗しました: %s", type(error).__name__)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=STORE_FAILED_DETAIL
            ) from None
        await self._record_usage(embedding_endpoint.type, model_name, total_tokens)

    async def remove(self, file_id: str) -> None:
        """このファイルのベクトルを削除する（登録の途中の失敗の後始末）。

        Parameters
        ----------
        file_id : str
            ファイルの ID。
        """
        try:
            await delete_vectors(self._target.vdb, file_id)
        except Exception as error:  # 後始末の失敗で、元のエラーを隠さない
            logger.error("ベクトルの後始末に失敗しました: %s", type(error).__name__)

    async def _record_usage(
        self, endpoint_type: EndpointType, model_name: str, tokens: int
    ) -> None:
        """埋め込みのトークンを、クレジットに数えて記録する（移植元と同じ計算）。

        Parameters
        ----------
        endpoint_type : EndpointType
            埋め込みの接続先の種別。
        model_name : str
            モデル名。
        tokens : int
            埋め込みで消費したトークン数。
        """
        if tokens <= 0:
            return
        ai_type = AIModelEndpointType(endpoint_type.value)
        ai_model = await AIModelRepository.find_by_endpoint_type_and_name(
            ai_type, model_name, self._session
        )
        weight = (
            positive_token_weight(float(ai_model.token_weight))
            if ai_model is not None
            else 1.0
        )
        self._session.add(
            TokenUsage(
                tenant_id=self._tenant_id,
                user_id=self._user_id,
                endpoint_type=ai_type.value,
                model=model_name,
                embedding_tokens=tokens,
                embedding_credits=embedding_credits(
                    tokens, get_llm_credit_settings().tokens_per_credit, weight
                ),
            )
        )


async def build_vectorizer(
    index_id: str,
    tenant_id: str,
    user_id: uuid.UUID,
    split_length: int,
    session: AsyncSession,
) -> FileVectorizer | None:
    """ベクトル化できる設定のフォルダなら、`FileVectorizer` を作る。

    Parameters
    ----------
    index_id : str
        学習先フォルダの ID。
    tenant_id : str
        テナントの ID。
    user_id : uuid.UUID
        登録するユーザーの ID。
    split_length : int
        分割長。
    session : AsyncSession
        非同期DBセッション。

    Returns
    -------
    FileVectorizer | None
        ベクトル化できる設定のとき。そうでなければ None。
    """
    target = await resolve_target(index_id, tenant_id, session)
    if target is None:
        return None
    return FileVectorizer(target, split_length, tenant_id, user_id, session)
