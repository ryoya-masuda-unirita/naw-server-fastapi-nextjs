"""chat・RAG の実行と出力ファイルの書き込み（移植元 GenerativeAiController）。"""

import logging
import traceback
from collections.abc import Sequence
from pathlib import Path

from generative_ai_core import failure as failures
from generative_ai_core.chat.models import (
    CoreChatResult,
    CoreChatTool,
    CoreRagRequest,
)
from generative_ai_core.chat.runtime import CoreChatRuntime
from generative_ai_core.failure import CoreFailure
from generative_ai_core.provider.factory import CoreProviderRuntimeFactory

from generative_ai_adapter.core_mappers import (
    AdapterCoreChatMapper,
    ChatRuntimeFactory,
    to_runtime_provider_configuration,
)
from generative_ai_adapter.domain import (
    AccessCredential,
    Message,
    ProxySetting,
    RagInputDeficiency,
    RagInputDeficiencyBuilder,
    RequestSchema,
    RetrievalAnswer,
)
from generative_ai_adapter.reasoning_output_sink import ReasoningOutputSink

logger = logging.getLogger(__name__)

PLAIN_ANSWER_OUTPUT_TYPE = 2
MAX_EXCEPTION_MESSAGE_LENGTH = 512
USER_ROLE_INDEX = 0
SYSTEM_ROLE_INDEX = 1
NO_ANSWER_MESSAGE = (
    "提供された情報からは答えが分かりませんでした。別の情報媒体で調べてみてください。"
)
TOOLS_FAILURE_CODES = frozenset(
    {
        failures.INVALID_TOOLS_INPUT,
        failures.UNSUPPORTED_TOOLS_PROVIDER,
        failures.UNSUPPORTED_TOOLS_ROUTE,
        failures.UNSUPPORTED_APPROVAL_CONTINUATION,
        failures.UNAVAILABLE_TOOLS_MAPPING,
        failures.UNSUPPORTED_PROVIDER_TOOL_MATRIX,
    }
)
UNSUPPORTED_TOOLS_ROUTE_SUMMARY = (
    "unsupported_tools_route: tools are available only on normal chat routes."
)


class GenerativeAiController:
    """chat・RAG を core へ任せ、結果を出力ファイルへ書く。"""

    def __init__(
        self,
        access_credential: AccessCredential,
        proxy_setting: ProxySetting,
        output_type: int,
        chat_tools: Sequence[CoreChatTool] = (),
        chat_runtime_factory: ChatRuntimeFactory | None = None,
    ) -> None:
        """資格情報からプロバイダの設定と core の chat を作る。

        Parameters
        ----------
        access_credential : AccessCredential
            資格情報（textData の上書き後）。
        proxy_setting : ProxySetting
            プロキシ設定。
        output_type : int
            出力モード（0・2=通常 chat、それ以外=RAG。2 は回答本文だけ）。
        chat_tools : Sequence[CoreChatTool]
            通常 chat の tools。
        chat_runtime_factory : ChatRuntimeFactory | None
            core の chat を作る処理（テスト用）。

        Raises
        ------
        RuntimeError
            設定が不正で作れないとき（512 文字までのメッセージ）。
        """
        self._access_credential = access_credential
        self._output_type = output_type
        self._chat_tools = list(chat_tools)
        self.reasoning_output_path: str | None = None
        factory = chat_runtime_factory or CoreProviderRuntimeFactory.create_chat_runtime
        try:
            configuration = to_runtime_provider_configuration(
                access_credential, proxy_setting
            )
            self._runtime: CoreChatRuntime = factory(configuration)
            self._mapper = AdapterCoreChatMapper(
                configuration.provider_id.canonical_name, configuration.network_setting
            )
        except Exception as e:
            logger.exception(
                "GenerativeAiControllerのコンストラクタでエラーが発生しました。"
            )
            raise RuntimeError(make_exception_message(e)) from e
        logger.info(
            "controller ready: provider=%s, model=%s, outputType=%d, tools=%d",
            configuration.provider_id,
            configuration.model_name,
            output_type,
            len(self._chat_tools),
        )

    def _has_reasoning_output_path(self) -> bool:
        """途中経過ファイルの出力先があるかを返す。

        Returns
        -------
        bool
            あれば True。
        """
        return bool(self.reasoning_output_path and self.reasoning_output_path.strip())

    def execute_llm(self, schema: RequestSchema, output_path: str) -> None:
        """通常 chat を実行し、回答を出力ファイルへ書く。

        途中経過ファイルがあれば core へコールバックを渡す。tools の失敗は回答として
        書き、それ以外の失敗は例外にする（出力ファイルは書かない）。

        Parameters
        ----------
        schema : RequestSchema
            リクエスト。
        output_path : str
            出力ファイルのパス。

        Raises
        ------
        RuntimeError
            実行・書き込みに失敗したとき（512 文字までのメッセージ）。
        """
        sink: ReasoningOutputSink | None = None
        try:
            if self._has_reasoning_output_path():
                sink = ReasoningOutputSink.open(self.reasoning_output_path)
            request = self._mapper.to_chat_request(
                schema, self._output_type, self._chat_tools
            )
            if sink is not None:
                request = request.with_stream_callbacks(sink.callbacks())
            logger.info("executeLLM: messages=%d", len(request.messages))
            result = self._runtime.chat(request)
            if (
                result.failure is not None
                and result.failure.code in TOOLS_FAILURE_CODES
            ):
                self._write_core_failure(result.failure, output_path)
                return
            _raise_if_failure(result)
            answer = RetrievalAnswer(answer=result.answer)
            _set_image_explanations(answer, schema)
            if self._output_type == PLAIN_ANSWER_OUTPUT_TYPE:
                self.write_response_to_text(answer.answer or "", output_path)
            else:
                self.write_response_to_text(answer.to_json(), output_path)
        except Exception as e:
            logger.exception(
                "GenerativeAiControllerのexecuteLLMでエラーが発生しました。"
            )
            raise RuntimeError(make_exception_message(e)) from e
        finally:
            if sink is not None:
                sink.close()

    def execute_llm_with_context(self, schema: RequestSchema, output_path: str) -> None:
        """RAG を実行し、回答と参照したコンテキストを出力ファイルへ書く。

        入力不足・tools の指定・参照 ID の範囲外は、core を呼ばずに（または呼んだ後に）
        理由を回答として書く。回答が得られなければ固定のメッセージとすべてのパスを書く。

        Parameters
        ----------
        schema : RequestSchema
            リクエスト。
        output_path : str
            出力ファイルのパス。

        Raises
        ------
        RuntimeError
            core が失敗したとき。
        """
        sink: ReasoningOutputSink | None = None
        try:
            deficiency = _validate_rag_request(schema)
            if deficiency is not None:
                logger.info("RAG input deficiency: %s", deficiency.message)
                self._write_deficiency(deficiency, output_path)
                return
            if self._chat_tools:
                self._write_core_failure(
                    CoreFailure.of(
                        failures.UNSUPPORTED_TOOLS_ROUTE,
                        UNSUPPORTED_TOOLS_ROUTE_SUMMARY,
                    ),
                    output_path,
                )
                return
            if self._has_reasoning_output_path():
                sink = ReasoningOutputSink.open(self.reasoning_output_path)
            contexts = schema.retrieval_contexts or []
            for count, context in enumerate(contexts, start=1):
                schema.add_message(
                    Message.context(
                        USER_ROLE_INDEX,
                        context.file_name or "",
                        context.context or "",
                        count,
                    )
                )
            schema.add_message(
                Message.of_index(USER_ROLE_INDEX, f"Question: {schema.user_question}")
            )
            schema.set_response_json()
            schema.add_submit_question_tool()
            rag_request = self._mapper.to_rag_request(schema, self._output_type)
            if sink is not None:
                rag_request = CoreRagRequest(
                    rag_request.chat_request.with_stream_callbacks(sink.callbacks()),
                    rag_request.contexts,
                )
            logger.info(
                "executeLLMWithContext: messages=%d, contexts=%d",
                len(rag_request.chat_request.messages),
                len(rag_request.contexts),
            )
            result = self._runtime.rag(rag_request)
            _raise_if_failure(result)
            answer = RetrievalAnswer()
            if result.answer_present:
                answer.answer = result.answer
                for reference_id in result.reference_ids:
                    out_of_range = _validate_answer_reference_id(
                        reference_id, len(contexts)
                    )
                    if out_of_range is not None:
                        self._write_deficiency(out_of_range, output_path)
                        return
                    context = contexts[reference_id - 1]
                    answer.add_filepath(context.path)
                    answer.add_reference(
                        Message.of_index(SYSTEM_ROLE_INDEX, context.context)
                    )
            else:
                answer.answer = NO_ANSWER_MESSAGE
                for context in contexts:
                    answer.add_filepath(context.path)
            _set_image_explanations(answer, schema)
            if self._output_type == PLAIN_ANSWER_OUTPUT_TYPE:
                self.write_response_to_text(answer.answer or "", output_path)
            else:
                self.write_response_to_text(answer.to_json(), output_path)
        finally:
            if sink is not None:
                sink.close()

    def _write_core_failure(self, failure: CoreFailure, output_path: str) -> None:
        """core の失敗を回答として書く。

        Parameters
        ----------
        failure : CoreFailure
            失敗。
        output_path : str
            出力ファイルのパス。
        """
        answer = RetrievalAnswer(answer=f"{failure.code}: {failure.summary}")
        answer.image_explanations = None
        self._write_retrieval_answer(answer, output_path)

    def _write_deficiency(
        self, deficiency: RagInputDeficiency, output_path: str
    ) -> None:
        """入力不足・参照 ID の不整合を回答として書く。

        Parameters
        ----------
        deficiency : RagInputDeficiency
            入力不足。
        output_path : str
            出力ファイルのパス。
        """
        answer = RetrievalAnswer(answer=deficiency.message)
        answer.image_explanations = None
        self._write_retrieval_answer(answer, output_path)

    def _write_retrieval_answer(
        self, answer: RetrievalAnswer, output_path: str
    ) -> None:
        """出力モードに合わせて回答を書く。

        Parameters
        ----------
        answer : RetrievalAnswer
            回答。
        output_path : str
            出力ファイルのパス。
        """
        if self._output_type == PLAIN_ANSWER_OUTPUT_TYPE:
            self.write_response_to_text(answer.answer or "", output_path)
        else:
            self.write_response_to_text(answer.to_json(), output_path)

    def write_response_to_text(self, response: str, output_path: str) -> None:
        """出力ファイルへ UTF-8 で書く（上書き）。

        Parameters
        ----------
        response : str
            書く文字列。
        output_path : str
            出力ファイルのパス。

        Raises
        ------
        RuntimeError
            書けないとき。
        """
        try:
            Path(output_path).write_bytes(response.encode("utf-8"))
        except OSError as e:
            logger.exception("ファイル書き込みに失敗しました。")
            raise RuntimeError(make_exception_message(e)) from e
        logger.info("output written: chars=%d", len(response))


def make_exception_message(error: BaseException) -> str:
    """例外のメッセージにこのモジュールのスタックの行を足し、512 文字に切る。

    Parameters
    ----------
    error : BaseException
        例外。

    Returns
    -------
    str
        メッセージ。
    """
    message = str(error)
    frames = [
        f"{frame.name}({Path(frame.filename).name}:{frame.lineno})"
        for frame in traceback.extract_tb(error.__traceback__)
        if frame.filename == __file__
    ]
    text = " ".join([message, *frames])
    return text[:MAX_EXCEPTION_MESSAGE_LENGTH]


def _raise_if_failure(result: CoreChatResult) -> None:
    """core の失敗を例外にする。

    Parameters
    ----------
    result : CoreChatResult
        core の結果。

    Raises
    ------
    RuntimeError
        失敗していたとき（`コード: 要約`）。
    """
    if result.failure is not None:
        raise RuntimeError(f"{result.failure.code}: {result.failure.summary}")


def _set_image_explanations(answer: RetrievalAnswer, schema: RequestSchema) -> None:
    """画像説明を回答に入れる。なければ JSON から省くため None にする。

    Parameters
    ----------
    answer : RetrievalAnswer
        回答。
    schema : RequestSchema
        リクエスト。
    """
    if schema.image_explanations is not None:
        for explanation in schema.image_explanations:
            answer.add_image_explanation(explanation)
    else:
        answer.image_explanations = None


def _validate_rag_request(schema: RequestSchema | None) -> RagInputDeficiency | None:
    """RAG の入力不足を調べる。

    Parameters
    ----------
    schema : RequestSchema | None
        リクエスト。

    Returns
    -------
    RagInputDeficiency | None
        入力不足。足りていれば None。
    """
    builder = RagInputDeficiencyBuilder()
    if schema is None:
        return builder.missing_request_schema().build_or_none()
    if schema.rag_input_deficiency is not None:
        return schema.rag_input_deficiency
    if not schema.messages:
        builder.missing_messages()
    if schema.user_question is None or not schema.user_question.strip():
        builder.missing_user_question()
    contexts = schema.retrieval_contexts
    if not contexts:
        builder.missing_context_body()
        builder.missing_context_path()
    else:
        for context in contexts:
            if context is None or not (context.context or "").strip():
                builder.missing_context_body()
            if context is None or not (context.path or "").strip():
                builder.missing_context_path()
            elif not (context.file_name or "").strip():
                builder.missing_context_file_name()
    return builder.build_or_none()


def _validate_answer_reference_id(
    reference_id: int, context_size: int
) -> RagInputDeficiency | None:
    """回答の参照 ID がコンテキストの範囲（1〜件数）かを確かめる。

    Parameters
    ----------
    reference_id : int
        参照 ID。
    context_size : int
        コンテキストの件数。

    Returns
    -------
    RagInputDeficiency | None
        範囲外なら不整合。範囲内なら None。
    """
    if reference_id < 1 or reference_id > context_size:
        return RagInputDeficiency.answer_reference_out_of_range(
            reference_id, 1, context_size
        )
    return None
