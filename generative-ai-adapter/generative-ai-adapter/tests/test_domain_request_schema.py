"""RequestSchema のテスト。

移植元: domain/RequestSchemaTest。
Java の `new RequestSchema(model, Message[])` は `RequestSchema(model=..., messages=...)`、
`new RequestSchema(model, ChatGPTParameter)` は `RequestSchema.with_parameter` に当たる。
`new RequestSchema(model, ColumnData[], ColumnInformation[], ChatGPTParameter)` は Python に
移植していない（Java でも null のメッセージを列数だけ並べるだけで、実際のリクエストは
RequestSchemaFactory が作る）ため、
testConstructorWithModelColumnDataColumnInformationAndChatGPTParameter（_AllBranches を含む）
は移植しない。
"""

import pytest
from generative_ai_adapter.domain import ChatGPTParameter, Message, RequestSchema


@pytest.fixture
def request_schema() -> RequestSchema:
    """メッセージ 2 件を持つリクエストを作る。

    Returns
    -------
    RequestSchema
        model=testModel、メッセージ 2 件のリクエスト。
    """
    return RequestSchema(
        model="testModel",
        messages=[
            Message.of_index(0, "testMessage1"),
            Message.of_index(1, "testMessage2"),
        ],
    )


def _parameter() -> ChatGPTParameter:
    """値をすべて設定した生成パラメータを作る。

    Returns
    -------
    ChatGPTParameter
        temperature=0.5 などを設定した生成パラメータ。
    """
    parameter = ChatGPTParameter()
    parameter.temperature = 0.5
    parameter.top_p = 0.8
    parameter.frequency_penalty = 1.2
    parameter.presence_penalty = 1.5
    parameter.max_tokens = 100
    parameter.stop = "testStop"
    return parameter


def _assert_parameter_applied(schema: RequestSchema) -> None:
    """`_parameter` の値がリクエストに入っていることを確かめる。

    Parameters
    ----------
    schema : RequestSchema
        確かめるリクエスト。
    """
    assert schema.temperature == 0.5
    assert schema.top_p == 0.8
    assert schema.frequency_penalty == 1.2
    assert schema.presence_penalty == 1.5
    assert schema.max_tokens == 100
    assert schema.stop == "testStop"


def test_constructor_with_model_and_messages(request_schema: RequestSchema) -> None:
    """モデル名とメッセージを持つこと"""
    assert request_schema.model == "testModel"
    assert request_schema.messages is not None
    assert len(request_schema.messages) == 2
    assert request_schema.messages[0].text == "testMessage1"
    assert request_schema.messages[1].text == "testMessage2"


def test_constructor_with_model_and_chat_gpt_parameter() -> None:
    """モデル名と生成パラメータから作れること"""
    schema = RequestSchema.with_parameter("testModel", _parameter())

    assert schema.model == "testModel"
    _assert_parameter_applied(schema)


def test_set_chat_gpt_parameter(request_schema: RequestSchema) -> None:
    """生成パラメータを反映できること"""
    request_schema.set_chat_gpt_parameter(_parameter())

    _assert_parameter_applied(request_schema)


def test_add_message(request_schema: RequestSchema) -> None:
    """メッセージを末尾に追加できること"""
    new_message = Message.of_index(2, "testMessage3")

    request_schema.add_message(new_message)

    assert request_schema.messages is not None
    assert len(request_schema.messages) == 3
    assert request_schema.messages[2] is new_message


def test_get_model(request_schema: RequestSchema) -> None:
    """モデル名を返すこと"""
    assert request_schema.model == "testModel"


def test_setters_update_generation_values(request_schema: RequestSchema) -> None:
    """生成パラメータの各項目を個別に設定できること"""
    request_schema.temperature = 0.5
    request_schema.top_p = 0.8
    request_schema.frequency_penalty = 1.2
    request_schema.presence_penalty = 1.5
    request_schema.max_tokens = 100
    request_schema.stop = "testStop"

    _assert_parameter_applied(request_schema)


def test_set_chat_gpt_parameter_with_none_values() -> None:
    """None の生成パラメータを反映しても項目が None のままであること"""
    parameter = ChatGPTParameter()
    parameter.temperature = None
    parameter.top_p = None
    parameter.frequency_penalty = None
    parameter.presence_penalty = None
    parameter.max_tokens = None
    parameter.stop = None
    schema = RequestSchema(model="testModel", messages=[])

    schema.set_chat_gpt_parameter(parameter)

    assert schema.temperature is None
    assert schema.top_p is None
    assert schema.frequency_penalty is None
    assert schema.presence_penalty is None
    assert schema.max_tokens is None
    assert schema.stop is None
