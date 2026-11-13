"""RequestSchemaFactory のテスト（移植元 service/RequestSchemaFactoryTest）。

- 移植元は Mockito で FileProcessorService を差し替える。Python 版はコンストラクタの
  `file_processor` に FileProcessorService を継いだ偽物を渡す
- 移植元は spy で `readJson` を差し替える。Python 版の `read_history_json` はモジュールの
  関数なので、会話履歴の JSON を `tmp_path` に実際に書いて読ませる
- 移植元 `createRequestSchema(model, parameter)`（列なしの多重定義）は Python 版にない。
  空の列で `create_request_schema` を呼ぶ形にした
- 移植元 `testCreateRequestSchemaWithContext_FileQuestionSaxException` は移植しない。
  SAXException は Office（XML）の前処理で起きるもので、Python 版は Office の前処理を
  移植していない
"""

import json
from collections.abc import Sequence
from pathlib import Path

import pytest
from generative_ai_adapter.constants import ImageExplanationMode
from generative_ai_adapter.domain import (
    AccessCredential,
    ChatGPTParameter,
    FileData,
    ImageExplanation,
    ProxySetting,
    RequestSchema,
)
from generative_ai_adapter.request_schema_factory import (
    FileProcessorService,
    RequestSchemaFactory,
    read_history_json,
)
from generative_ai_adapter.waha import ColumnData, ColumnInformation, ColumnType

MODEL = "test-model"
DEFAULT_FILE_TEXT = "file-content"
LONG_ASSISTANT_ANSWER = (
    "ユニリタ病院は、地域に開かれた病院としての医療を実践し、命の大切さを尊重し、"
    "高度で良質、安全な医療を提供することを理念としています。また、患者さまの権利を"
    "尊重し、よりよい医療サービスを受ける権利や自分で選び、自分で決める権利などを実現"
    "することに努めています。ユニリタ病院は、悪性新生物や心疾患、脳血管疾患などの治療に"
    "重点を置いた先端高度医療を行い、救急医療の提供や地域医療機関との連携を図り、"
    "地域全体の最適な医療を行う役割も果たしています。"
)
EXPECTED_RAG_PROMPT = (
    "You are an assistant that answers questions based ONLY on the provided articles "
    "delimited by triple quotes.\n"
    'If the answer cannot be found in the articles, respond with "回答は見つかりませんで'
    "した。\" in the 'answer' field.\n"
    "NEVER provide information outside of the provided articles.\n\n"
    "Your response MUST be a single, valid JSON object. Do NOT include any text outside "
    'of the JSON object itself (e.g., no introductory phrases like "Here is the JSON:").\n'
    "The JSON object MUST strictly adhere to the following structure:\n"
    "{\n"
    '    "question": "The user\'s original question as a string.",\n'
    '    "answer": "Your answer based SOLELY on the provided articles as a string. Use '
    "the exact phrase '回答は見つかりませんでした。' if the answer is not found within the "
    'articles.",\n'
    '    "id": [ /* A list of JSON integers, where each integer is the file ID of a '
    "relevant article used for the answer. Include only IDs from the provided articles. "
    "Return an empty list [] if no articles were used or relevant. */ ]\n"
    "}\n\n"
    "Key requirements for the JSON output:\n"
    '1.  All three fields ("question", "answer", "id") MUST always be present.\n'
    '2.  "question" and "answer" MUST be strings.\n'
    '3.  "id" MUST be a list of JSON integers (use `[]` for empty lists, do not use '
    "strings, decimals, `null`, or omit the field).\n"
    '4.  The content of "answer" and "id" must be derived exclusively from the provided '
    'articles. Ignore any model-provided "FileName"; it is not authoritative for runtime '
    "correctness.\n"
    "5.  The language for the 'answer' field MUST be Japanese, except for the specific "
    "phrase '回答は見つかりませんでした。'.\n\n"
    "Analyze the user's question and the provided articles carefully to construct the "
    "accurate JSON response according to these instructions.\n"
)


class _FakeFileProcessor(FileProcessorService):
    """呼び出しを記録し、決まった内容を返す FileProcessorService（Mockito の代わり）。"""

    def __init__(
        self,
        results: dict[str, FileData] | None = None,
        error: Exception | None = None,
    ) -> None:
        """返す内容・投げる例外を受け取る。

        Parameters
        ----------
        results : dict[str, FileData] | None, optional
            パスごとに返す内容。ないパスは `file-content` のテキストを返す。
        error : Exception | None, optional
            指定したとき、すべての呼び出しで投げる例外。
        """
        self.results = results or {}
        self.error = error
        self.calls: list[tuple[str, ImageExplanationMode]] = []

    def extract_content(
        self, file_path: str, image_explanation_mode: ImageExplanationMode
    ) -> FileData:
        """呼び出しを記録して内容を返す。

        Parameters
        ----------
        file_path : str
            ファイルのパス。
        image_explanation_mode : ImageExplanationMode
            画像説明モード。

        Returns
        -------
        FileData
            パスに対応する内容。

        Raises
        ------
        Exception
            `error` を指定したとき。
        """
        self.calls.append((file_path, image_explanation_mode))
        if self.error is not None:
            raise self.error
        return self.results.get(file_path, FileData(text=DEFAULT_FILE_TEXT))


def _factory(
    processor: _FakeFileProcessor,
    mode: ImageExplanationMode = ImageExplanationMode.DISABLED,
) -> RequestSchemaFactory:
    """偽の前処理を使う RequestSchemaFactory を作る。

    Parameters
    ----------
    processor : _FakeFileProcessor
        偽の前処理。
    mode : ImageExplanationMode, optional
        画像説明モード。

    Returns
    -------
    RequestSchemaFactory
        作ったファクトリ。
    """
    return RequestSchemaFactory(AccessCredential(), ProxySetting(), mode, processor)


def _info(col_type: ColumnType, index: int) -> ColumnInformation:
    """列の定義を作る。

    Parameters
    ----------
    col_type : ColumnType
        列の型。
    index : int
        ロール。

    Returns
    -------
    ColumnInformation
        列の定義。
    """
    return ColumnInformation(f"column-{index}", col_type, index)


def _write_history(directory: Path, contents: Sequence[str]) -> str:
    """会話履歴の JSON を書く。

    Parameters
    ----------
    directory : Path
        書く先のディレクトリ。
    contents : Sequence[str]
        メッセージの本文。

    Returns
    -------
    str
        書いたファイルのパス。
    """
    path = directory / "history.json"
    items = [{"role": "user", "content": content} for content in contents]
    path.write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")
    return str(path)


def _texts(schema: RequestSchema) -> list[str | None]:
    """リクエストのメッセージの本文を並べる。

    Parameters
    ----------
    schema : RequestSchema
        リクエスト。

    Returns
    -------
    list[str | None]
        本文の一覧。
    """
    assert schema.messages is not None
    return [message.text for message in schema.messages]


def test_text_only_normal_chat_does_not_call_file_processor_service() -> None:
    """文字の列だけの通常 chat では前処理を呼ばないこと"""
    processor = _FakeFileProcessor()
    record = [
        ColumnData.char("user-message"),
        ColumnData.char("system-message"),
        ColumnData.char("assistant-message"),
    ]
    columns = [
        _info(ColumnType.CHAR, 0),
        _info(ColumnType.CHAR, 1),
        _info(ColumnType.CHAR, 2),
    ]

    result = _factory(processor).create_request_schema(
        MODEL, record, columns, ChatGPTParameter()
    )

    assert result.messages is not None
    assert len(result.messages) == 3
    assert processor.calls == []


def test_text_only_rag_does_not_call_file_processor_service() -> None:
    """文字の列だけの旧 RAG では前処理を呼ばないこと"""
    processor = _FakeFileProcessor()
    record = [
        ColumnData.char("question"),
        ColumnData.char("system"),
        ColumnData.char("path1"),
        ColumnData.char("context1"),
    ]
    columns = [
        _info(ColumnType.CHAR, 0),
        _info(ColumnType.CHAR, 1),
        _info(ColumnType.CHAR, 3),
        _info(ColumnType.CHAR, 5),
    ]

    result = _factory(processor).create_request_schema_with_context(
        MODEL, record, columns, ChatGPTParameter()
    )

    assert result.user_question == "question"
    assert result.retrieval_contexts is not None
    assert len(result.retrieval_contexts) == 1
    assert processor.calls == []


def test_create_request_schema_with_column_data() -> None:
    """文字の列と FILE の列からメッセージを作れること"""
    processor = _FakeFileProcessor()
    record = [ColumnData.char("test-string"), ColumnData.file("test-file-path")]
    columns = [_info(ColumnType.CHAR, 0), _info(ColumnType.FILE, 1)]

    result = _factory(processor).create_request_schema(
        MODEL, record, columns, ChatGPTParameter()
    )

    assert _texts(result) == ["test-string", "file-content"]


def test_process_column_data_file_not_found_raises_runtime_error() -> None:
    """前処理でファイルが見つからないと RuntimeError になること"""
    processor = _FakeFileProcessor(error=FileNotFoundError())
    record = [ColumnData.file("test-file-path")]
    columns = [_info(ColumnType.FILE, 1)]

    with pytest.raises(RuntimeError):
        _factory(processor).create_request_schema(
            MODEL, record, columns, ChatGPTParameter()
        )


def test_process_column_data_io_error_raises_runtime_error() -> None:
    """前処理で読み込みに失敗すると RuntimeError になること"""
    processor = _FakeFileProcessor(error=OSError())
    record = [ColumnData.file("test-file-path")]
    columns = [_info(ColumnType.FILE, 1)]

    with pytest.raises(RuntimeError):
        _factory(processor).create_request_schema(
            MODEL, record, columns, ChatGPTParameter()
        )


def test_create_request_schema_without_column_data() -> None:
    """列がなくてもリクエストを作れること"""
    result = _factory(_FakeFileProcessor()).create_request_schema(
        MODEL, [], [], ChatGPTParameter()
    )

    assert result is not None
    assert result.model == MODEL


def test_read_history_json(tmp_path: Path) -> None:
    """会話履歴の JSON を読めること"""
    path = tmp_path / "history.json"
    items = [
        {"role": "user", "content": "ユニリタ病院について教えて"},
        {"role": "assistant", "content": LONG_ASSISTANT_ANSWER},
        {"role": "user", "content": "ユニリタ病院が連携している医療機関を教えて"},
    ]
    path.write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")

    messages = read_history_json(str(path))

    assert messages is not None
    assert [message.text for message in messages] == [
        "ユニリタ病院について教えて",
        LONG_ASSISTANT_ANSWER,
        "ユニリタ病院が連携している医療機関を教えて",
    ]


def test_read_history_json_null_path_returns_none() -> None:
    """パスが `null`・None なら None を返すこと"""
    assert read_history_json("null") is None
    assert read_history_json(None) is None


def test_read_history_json_missing_file_raises_runtime_error() -> None:
    """ないファイルは RuntimeError になること"""
    with pytest.raises(RuntimeError):
        read_history_json("invalid-path.json")


def test_read_history_json_deleted_file_raises_runtime_error(tmp_path: Path) -> None:
    """消したファイルは RuntimeError になること"""
    path = tmp_path / "test.json"
    path.write_text("[]", encoding="utf-8")
    path.unlink()

    with pytest.raises(RuntimeError):
        read_history_json(str(path))


def test_read_history_json_invalid_json_raises_runtime_error(tmp_path: Path) -> None:
    """JSON として読めないファイルは RuntimeError になること"""
    path = tmp_path / "invalid.json"
    path.write_text("invalid-json-content", encoding="utf-8")

    with pytest.raises(RuntimeError):
        read_history_json(str(path))


def test_process_column_data_index4_history_is_prepended(tmp_path: Path) -> None:
    """index 4 の会話履歴をメッセージの先頭に置くこと"""
    history_path = _write_history(tmp_path, ["json-content-1", "json-content-2"])
    processor = _FakeFileProcessor(
        {"test-file-path-1": FileData(text="file-content-1")}
    )
    record = [ColumnData.file("test-file-path-1"), ColumnData.file(history_path)]
    columns = [_info(ColumnType.FILE, 1), _info(ColumnType.FILE, 4)]

    result = _factory(processor).create_request_schema(
        MODEL, record, columns, ChatGPTParameter()
    )

    assert _texts(result) == ["json-content-1", "json-content-2", "file-content-1"]
    assert processor.calls == [("test-file-path-1", ImageExplanationMode.DISABLED)]


def test_process_column_data_index4_null_json_adds_nothing(tmp_path: Path) -> None:
    """会話履歴の JSON が null ならメッセージを足さないこと"""
    history_path = tmp_path / "history.json"
    history_path.write_text("null", encoding="utf-8")
    processor = _FakeFileProcessor(
        {"test-file-path-1": FileData(text="file-content-1")}
    )
    record = [ColumnData.file("test-file-path-1"), ColumnData.file(str(history_path))]
    columns = [_info(ColumnType.FILE, 1), _info(ColumnType.FILE, 4)]

    result = _factory(processor).create_request_schema(
        MODEL, record, columns, ChatGPTParameter()
    )

    assert _texts(result) == ["file-content-1"]


def test_process_column_data_null_file_path_is_skipped() -> None:
    """FILE の列が `null` なら前処理を呼ばずに飛ばすこと"""
    processor = _FakeFileProcessor()
    record = [ColumnData.file("null"), ColumnData.char("user-message")]
    columns = [_info(ColumnType.FILE, 0), _info(ColumnType.CHAR, 0)]

    result = _factory(processor).create_request_schema(
        MODEL, record, columns, ChatGPTParameter()
    )

    assert _texts(result) == ["user-message"]
    assert processor.calls == []


def test_process_column_data_null_history_file_path_is_skipped() -> None:
    """会話履歴の列が `null` なら飛ばすこと"""
    record = [ColumnData.char("user-message"), ColumnData.file("null")]
    columns = [_info(ColumnType.CHAR, 0), _info(ColumnType.FILE, 4)]

    result = _factory(_FakeFileProcessor()).create_request_schema(
        MODEL, record, columns, ChatGPTParameter()
    )

    assert _texts(result) == ["user-message"]


def test_process_column_data_file_image_resource_and_explanation() -> None:
    """画像の添付と画像説明のメッセージ・画像説明の一覧を作ること"""
    file_data = FileData(
        image_resource=b"image",
        mime_type="image/png",
        image_explanations=[
            ImageExplanation(1, "chart caption", "page-1"),
            ImageExplanation(1, "table caption", "page-2"),
        ],
    )
    processor = _FakeFileProcessor({"image-path": file_data})
    record = [ColumnData.file("image-path")]
    columns = [_info(ColumnType.FILE, 0)]

    result = _factory(processor, ImageExplanationMode.EMBED_ONLY).create_request_schema(
        MODEL, record, columns, ChatGPTParameter()
    )

    assert result.messages is not None
    assert len(result.messages) == 3
    assert result.messages[0].image_resource is not None
    assert result.messages[1].text == "画像説明 (page-1): chart caption"
    assert result.messages[2].text == "画像説明 (page-2): table caption"
    assert result.image_explanations is not None
    assert [e.caption for e in result.image_explanations] == [
        "chart caption",
        "table caption",
    ]
    assert processor.calls == [("image-path", ImageExplanationMode.EMBED_ONLY)]


def test_create_request_schema_with_context_all_branches(tmp_path: Path) -> None:
    """旧 RAG で履歴・system・RAG の指示・コンテキストを組み立てること"""
    history_path = _write_history(tmp_path, ["json-content-1", "json-content-2"])
    record = [
        ColumnData.char("user-question"),
        ColumnData.char("message-1"),
        ColumnData.char("message-2"),
        ColumnData.char("file-path-3"),
        ColumnData.file(history_path),
        ColumnData.char("retrieval-context"),
    ]
    columns = [
        _info(ColumnType.FILE if index == 4 else ColumnType.CHAR, index)
        for index in range(6)
    ]

    result = _factory(_FakeFileProcessor()).create_request_schema_with_context(
        MODEL, record, columns, ChatGPTParameter()
    )

    assert result.user_question == "user-question"
    texts = _texts(result)
    assert texts == [
        "json-content-1",
        "json-content-2",
        "message-1",
        EXPECTED_RAG_PROMPT,
    ]
    prompt = texts[3]
    assert prompt is not None
    assert '"id"' in prompt
    assert "integer" in prompt
    assert "list of strings" not in prompt
    assert '"FileName":' not in prompt
    assert "not authoritative" in prompt
    assert result.retrieval_contexts is not None
    assert len(result.retrieval_contexts) == 1
    context = result.retrieval_contexts[0]
    assert context.context == "retrieval-context"
    assert context.path == "file-path-3"
    assert context.file_name == "file-path-3"


def test_create_request_schema_with_context_file_question_adds_image_explanation() -> (
    None
):
    """質問のファイルの画像説明を質問の後ろに足すこと"""
    file_data = FileData(
        text="file question",
        image_explanations=[ImageExplanation(1, "diagram", "slide-1")],
    )
    processor = _FakeFileProcessor({"question-file": file_data})
    record = [ColumnData.file("question-file")]
    columns = [_info(ColumnType.FILE, 0)]

    result = _factory(
        processor, ImageExplanationMode.FULL_PAGE
    ).create_request_schema_with_context(MODEL, record, columns, ChatGPTParameter())

    assert result.user_question == "file question\n画像説明 (slide-1): diagram"
    assert processor.calls == [("question-file", ImageExplanationMode.FULL_PAGE)]


def test_create_request_schema_with_context_context_file_is_extracted() -> None:
    """コンテキストの FILE の列を前処理して本文にすること"""
    processor = _FakeFileProcessor({"context-file": FileData(text="context from file")})
    record = [
        ColumnData.char("question"),
        ColumnData.char("docs/context.txt"),
        ColumnData.file("context-file"),
    ]
    columns = [
        _info(ColumnType.CHAR, 0),
        _info(ColumnType.CHAR, 3),
        _info(ColumnType.FILE, 5),
    ]

    result = _factory(processor).create_request_schema_with_context(
        MODEL, record, columns, ChatGPTParameter()
    )

    assert result.retrieval_contexts is not None
    assert len(result.retrieval_contexts) == 1
    context = result.retrieval_contexts[0]
    assert context.context == "context from file"
    assert context.path == "docs/context.txt"
    assert context.file_name == "context.txt"
    assert processor.calls == [("context-file", ImageExplanationMode.DISABLED)]


def test_create_request_schema_with_context_null_file_question_and_context_skipped() -> (
    None
):
    """質問・コンテキストの FILE の列が `null` なら前処理を呼ばずに飛ばすこと"""
    processor = _FakeFileProcessor()
    record = [
        ColumnData.file("null"),
        ColumnData.char("docs/context.txt"),
        ColumnData.file("null"),
    ]
    columns = [
        _info(ColumnType.FILE, 0),
        _info(ColumnType.CHAR, 3),
        _info(ColumnType.FILE, 5),
    ]

    result = _factory(processor).create_request_schema_with_context(
        MODEL, record, columns, ChatGPTParameter()
    )

    assert result.user_question == ""
    assert result.retrieval_contexts == []
    assert processor.calls == []


@pytest.mark.parametrize(
    ("question", "path", "context", "expected"),
    [
        ("   ", "docs/context.txt", "retrieval context", "ユーザー質問(index=0)"),
        ("question", "docs/context.txt", " ", "コンテキスト本文(index=5)"),
        ("question", " ", "retrieval context", "コンテキストパス(index=3)"),
        ("question", "docs/", "retrieval context", "コンテキストファイル名(index=3)"),
    ],
)
def test_create_request_schema_with_context_reports_deficiency(
    question: str, path: str, context: str, expected: str
) -> None:
    """質問・本文・パス・ファイル名が足りなければ入力不足を返すこと"""
    record = [
        ColumnData.char(question),
        ColumnData.char(path),
        ColumnData.char(context),
    ]
    columns = [
        _info(ColumnType.CHAR, 0),
        _info(ColumnType.CHAR, 3),
        _info(ColumnType.CHAR, 5),
    ]

    result = _factory(_FakeFileProcessor()).create_request_schema_with_context(
        MODEL, record, columns, ChatGPTParameter()
    )

    assert result.rag_input_deficiency is not None
    assert expected in result.rag_input_deficiency.message


def test_create_request_schema_with_context_history_null_does_not_fail() -> None:
    """会話履歴が `null` でもそれだけでは入力不足にならないこと"""
    record = [
        ColumnData.char("question"),
        ColumnData.char("docs/context.txt"),
        ColumnData.file("null"),
        ColumnData.char("retrieval context"),
    ]
    columns = [
        _info(ColumnType.CHAR, 0),
        _info(ColumnType.CHAR, 3),
        _info(ColumnType.FILE, 4),
        _info(ColumnType.CHAR, 5),
    ]

    result = _factory(_FakeFileProcessor()).create_request_schema_with_context(
        MODEL, record, columns, ChatGPTParameter()
    )

    assert result.rag_input_deficiency is None
    assert result.user_question == "question"
    assert result.retrieval_contexts is not None
    assert len(result.retrieval_contexts) == 1
    assert result.messages is not None
    assert len(result.messages) == 1


def test_create_request_schema_with_context_valid_input_has_no_deficiency() -> None:
    """質問とコンテキストがそろえば入力不足にならないこと"""
    record = [
        ColumnData.char("question"),
        ColumnData.char("docs/context.txt"),
        ColumnData.char("retrieval context"),
    ]
    columns = [
        _info(ColumnType.CHAR, 0),
        _info(ColumnType.CHAR, 3),
        _info(ColumnType.CHAR, 5),
    ]

    result = _factory(_FakeFileProcessor()).create_request_schema_with_context(
        MODEL, record, columns, ChatGPTParameter()
    )

    assert result.rag_input_deficiency is None
    assert result.user_question == "question"
    assert result.retrieval_contexts is not None
    assert len(result.retrieval_contexts) == 1
    context = result.retrieval_contexts[0]
    assert context.context == "retrieval context"
    assert context.path == "docs/context.txt"
    assert context.file_name == "context.txt"
