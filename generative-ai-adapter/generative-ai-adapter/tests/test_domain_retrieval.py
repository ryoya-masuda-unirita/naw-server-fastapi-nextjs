"""RetrievalAnswer・RetrievalContext のテスト。

移植元: domain/RetrievalAnswerTest・domain/RetrievalContextTest。
Java の Gson による JSON 化は `RetrievalAnswer.to_json` で確かめる。
"""

from generative_ai_adapter.domain import (
    ImageExplanation,
    Message,
    RetrievalAnswer,
    RetrievalContext,
)

FILEPATHS = ["/path/to/file1", "/path/to/file2"]


def test_retrieval_answer_default_constructor() -> None:
    """既定値ではファイルパスが空のリストであること"""
    answer = RetrievalAnswer()

    assert answer.filepaths is not None
    assert answer.filepaths == []


def test_retrieval_answer_parameterized_constructor() -> None:
    """コンストラクタで回答とファイルパスを受け取れること"""
    answer = RetrievalAnswer(answer="Test answer", filepaths=list(FILEPATHS))

    assert answer.answer == "Test answer"
    assert answer.filepaths == FILEPATHS


def test_retrieval_answer_setters_update_values() -> None:
    """既定値で作った後に回答とファイルパスを設定できること"""
    answer = RetrievalAnswer()

    answer.answer = "Test answer"
    answer.filepaths = list(FILEPATHS)

    assert answer.answer == "Test answer"
    assert answer.filepaths == FILEPATHS


def test_retrieval_answer_add_filepath() -> None:
    """ファイルパスを追加できること"""
    answer = RetrievalAnswer()

    answer.add_filepath("/path/to/file1")

    assert answer.filepaths is not None
    assert "/path/to/file1" in answer.filepaths


def test_retrieval_answer_add_methods_initialize_none_lists() -> None:
    """リストが None でも追加のメソッドがリストを作って追加すること"""
    answer = RetrievalAnswer()
    answer.filepaths = None
    answer.references = None
    answer.image_explanations = None
    reference = Message.of_index(1, "reference")
    explanation = ImageExplanation(type=1, caption="caption", source_hint="source")

    answer.add_filepath("/path/to/file")
    answer.add_reference(reference)
    answer.add_image_explanation(explanation)

    assert answer.filepaths == ["/path/to/file"]
    assert answer.references == [reference]
    assert answer.image_explanations == [explanation]


def test_rag_answer_json_keeps_existing_reference_compatible_shape() -> None:
    """RAG 回答の JSON が既存の参照の形（role・content）と空の画像説明を保つこと"""
    answer = RetrievalAnswer(answer="sanitized answer", filepaths=["fixture-doc.md"])
    answer.add_reference(Message.of_index(1, "fixture reference"))

    assert answer.to_json() == (
        '{"answer":"sanitized answer","filepaths":["fixture-doc.md"],'
        '"references":[{"role":"system","content":"fixture reference"}],'
        '"imageExplanations":[]}'
    )


def test_retrieval_context_default_constructor() -> None:
    """既定値ではすべて空文字列であること"""
    context = RetrievalContext()

    assert context.context == ""
    assert context.path == ""
    assert context.file_name == ""


def test_retrieval_context_parameterized_constructor() -> None:
    """コンストラクタで本文・パス・ファイル名を受け取れること"""
    context = RetrievalContext("testContext", "testPath", "testFileName")

    assert context.context == "testContext"
    assert context.path == "testPath"
    assert context.file_name == "testFileName"


def test_retrieval_context_setters_update_values() -> None:
    """既定値で作った後に本文・パス・ファイル名を設定できること"""
    context = RetrievalContext()

    context.context = "testContext"
    assert context.context == "testContext"
    context.path = "testPath"
    assert context.path == "testPath"
    context.file_name = "testFileName"
    assert context.file_name == "testFileName"


def test_retrieval_context_is_filled() -> None:
    """本文・パス・ファイル名がすべて揃ったときだけ埋まっていると判定すること"""
    context = RetrievalContext()
    assert not context.is_filled()

    context.context = "testContext"
    assert not context.is_filled()
    context.path = "testPath"
    assert not context.is_filled()
    context.file_name = "testFileName"
    assert context.is_filled()


def test_retrieval_context_is_filled_returns_false_when_any_field_is_none() -> None:
    """どれか 1 つでも None なら埋まっていないと判定すること"""
    context = RetrievalContext("context", "path", "file.txt")
    assert context.is_filled()

    context.context = None
    assert not context.is_filled()

    context = RetrievalContext("context", "path", "file.txt")
    context.path = None
    assert not context.is_filled()

    context = RetrievalContext("context", "path", "file.txt")
    context.file_name = None
    assert not context.is_filled()
