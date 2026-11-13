"""旧 RAG の指示の契約（移植元 service/RequestSchemaFactoryRagContractTest）。"""

from generative_ai_adapter.constants import ImageExplanationMode
from generative_ai_adapter.domain import (
    AccessCredential,
    ChatGPTParameter,
    ProxySetting,
)
from generative_ai_adapter.request_schema_factory import RequestSchemaFactory
from generative_ai_adapter.waha import ColumnData, ColumnInformation, ColumnType


def test_rag_prompt_contract_uses_integer_ids_and_file_name_is_not_authoritative() -> (
    None
):
    """RAG の指示が整数の ID を求め、FileName を正としないこと"""
    factory = RequestSchemaFactory(
        AccessCredential(), ProxySetting(), ImageExplanationMode.DISABLED
    )
    record = [
        ColumnData.char("question"),
        ColumnData.char("system"),
        ColumnData.char("path1"),
        ColumnData.char("context1"),
    ]
    columns = [
        ColumnInformation("question", ColumnType.CHAR, 0),
        ColumnInformation("system", ColumnType.CHAR, 1),
        ColumnInformation("path", ColumnType.CHAR, 3),
        ColumnInformation("context", ColumnType.CHAR, 5),
    ]

    result = factory.create_request_schema_with_context(
        "test-model", record, columns, ChatGPTParameter()
    )

    assert result.messages is not None
    system_prompt = "".join(f"{message.text}\n" for message in result.messages)
    assert "single, valid JSON object" in system_prompt
    assert '"question", "answer", "id"' in system_prompt
    assert '"id" MUST be a list of JSON integers' in system_prompt
    assert "do not use strings, decimals, `null`, or omit the field" in system_prompt
    assert 'Ignore any model-provided "FileName"' in system_prompt
    assert "回答は見つかりませんでした。" in system_prompt
    assert '"FileName" MUST always be present' not in system_prompt
