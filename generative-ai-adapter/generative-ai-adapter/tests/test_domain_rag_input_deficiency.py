"""RagInputDeficiency のテスト。

移植元: domain/RagInputDeficiencyTest。
"""

from generative_ai_adapter.domain import RagInputDeficiency


def test_builder_without_reasons_returns_none() -> None:
    """理由がなければ None を返すこと"""
    assert RagInputDeficiency.builder().build_or_none() is None


def test_builder_ignores_none_and_blank_reasons() -> None:
    """None・空白の理由を無視し、同じ理由を 1 回だけ出すこと"""
    deficiency = (
        RagInputDeficiency.builder()
        .add(None)
        .add(" ")
        .missing_user_question()
        .missing_user_question()
        .build_or_none()
    )

    assert deficiency is not None
    assert deficiency.message == "RAG入力不足: ユーザー質問(index=0)が空です。"


def test_builder_includes_request_schema_and_file_name_reasons() -> None:
    """request schema・コンテキストファイル名の理由を含めること"""
    deficiency = (
        RagInputDeficiency.builder()
        .missing_request_schema()
        .missing_context_file_name()
        .build_or_none()
    )

    assert deficiency is not None
    assert "request schema" in deficiency.message
    assert "コンテキストファイル名(index=3)" in deficiency.message


def test_answer_reference_out_of_range_message() -> None:
    """範囲外の参照 ID のメッセージに ID と有効範囲を出すこと"""
    deficiency = RagInputDeficiency.answer_reference_out_of_range(9, 1, 2)

    assert deficiency.message == (
        "RAG回答参照ID不整合: 回答が存在しないコンテキストIDを参照しました。"
        "id=9, valid range=1-2。"
    )
