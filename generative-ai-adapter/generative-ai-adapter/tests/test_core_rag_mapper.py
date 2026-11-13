"""RAG のリクエストの変換のテスト（移植元 service/core/AdapterCoreRagMapperTest）。"""

from typing import cast

import pytest
from generative_ai_adapter.core_mappers import AdapterCoreChatMapper
from generative_ai_adapter.domain import Message, RequestSchema, RetrievalContext
from generative_ai_core.network.setting import CoreNetworkSetting


@pytest.fixture
def mapper() -> AdapterCoreChatMapper:
    """OpenAI・既定のネットワーク設定の mapper を返す。

    Returns
    -------
    AdapterCoreChatMapper
        テスト対象の mapper。
    """
    return AdapterCoreChatMapper("OpenAI", CoreNetworkSetting.defaults())


def test_maps_rag_contexts_with_path_content_and_file_name_reference(
    mapper: AdapterCoreChatMapper,
) -> None:
    """コンテキストのパス・本文・ファイル名を core のコンテキストにすること"""
    schema = RequestSchema(
        messages=[Message.of_index(1, "system")],
        user_question="question",
        retrieval_contexts=[
            RetrievalContext("context-1", "C:/docs/doc1.txt", "doc1.txt"),
            RetrievalContext("context-2", "C:/docs/doc2.txt", "doc2.txt"),
        ],
    )

    request = mapper.to_rag_request(schema, 1)

    assert len(request.chat_request.messages) == 1
    assert len(request.contexts) == 2
    assert request.contexts[0].path == "C:/docs/doc1.txt"
    assert request.contexts[0].content == "context-1"
    assert request.contexts[0].references == ("doc1.txt",)
    assert request.contexts[1].path == "C:/docs/doc2.txt"
    assert request.contexts[1].content == "context-2"
    assert request.contexts[1].references == ("doc2.txt",)


def test_skips_none_or_blank_path_contexts(mapper: AdapterCoreChatMapper) -> None:
    """None・パスのないコンテキストは除くこと（エラーは adapter の入力不足で扱う）"""
    schema = RequestSchema(
        retrieval_contexts=cast(
            list[RetrievalContext],
            [
                None,
                RetrievalContext("context-0", None, "doc0.txt"),
                RetrievalContext("context-1", " ", "doc1.txt"),
                RetrievalContext("context-2", "C:/docs/doc2.txt", None),
            ],
        )
    )

    request = mapper.to_rag_request(schema, 1)

    assert len(request.contexts) == 1
    assert request.contexts[0].path == "C:/docs/doc2.txt"
    assert request.contexts[0].references == ()


def test_maps_none_context_list_to_empty_core_contexts(
    mapper: AdapterCoreChatMapper,
) -> None:
    """コンテキストの一覧がなければ core のコンテキストは空になること"""
    assert mapper.to_rag_request(RequestSchema(), 1).contexts == ()


def test_maps_none_request_to_empty_core_contexts(
    mapper: AdapterCoreChatMapper,
) -> None:
    """リクエストが None でも core のコンテキストは空になること"""
    assert mapper.to_rag_request(cast(RequestSchema, None), 1).contexts == ()
