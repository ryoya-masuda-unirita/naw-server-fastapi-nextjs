"""adapter の値を core の入力へ変える（移植元 service/core パッケージ）。

AdapterCoreChatMapper・AdapterCoreNetworkMapper・AdapterCoreRuntimeConfigurationMapper・
AdapterCoreMediaPreprocessingMapper・AdapterCoreMediaPreprocessingResultMapper。
"""

from collections.abc import Callable, Sequence
from pathlib import Path

from generative_ai_core.chat.models import (
    GENERATION_OPTIONS_ATTRIBUTE,
    RAG_JSON_RESPONSE_ATTRIBUTE,
    RAG_TOOL_INTENT_ATTRIBUTE,
    CoreChatRequest,
    CoreChatRequestBuilder,
    CoreChatTool,
    CoreGenerationOptions,
    CoreMedia,
    CoreMessage,
    CoreRagContext,
    CoreRagRequest,
    OutputModeHint,
    Role,
)
from generative_ai_core.chat.runtime import CoreChatRuntime
from generative_ai_core.media.model import (
    CoreMediaPreprocessingMode,
    CoreMediaPreprocessingRequest,
    CoreMediaPreprocessingResult,
)
from generative_ai_core.network.setting import CoreNetworkSetting, CoreProxySetting
from generative_ai_core.provider.clients.secuaigent import keys
from generative_ai_core.provider.factory import CoreProviderRuntimeFactory
from generative_ai_core.provider.model import (
    CoreCredential,
    CoreProviderId,
    RuntimeProviderConfiguration,
)

from generative_ai_adapter.constants import ImageExplanationMode
from generative_ai_adapter.domain import (
    AccessCredential,
    FileData,
    ImageExplanation,
    Message,
    ProxySetting,
    RequestSchema,
)

PLAIN_ANSWER_OUTPUT_TYPE = 2
SUBMIT_QUESTION = "submit_question"
USE_PROXY_NONE = 0
USE_PROXY_MANUAL = 1
USE_PROXY_SYSTEM = 2
# Spring の ByteArrayResource#getDescription()
BYTE_ARRAY_RESOURCE_DESCRIPTION = "Byte array resource"

ChatRuntimeFactory = Callable[[RuntimeProviderConfiguration], CoreChatRuntime]


def to_core_network_setting(
    proxy_setting: ProxySetting | None, access_credential: AccessCredential | None
) -> CoreNetworkSetting:
    """プロキシ設定・タイムアウトを core のネットワーク設定にする（AdapterCoreNetworkMapper）。

    Parameters
    ----------
    proxy_setting : ProxySetting | None
        プロキシ設定（プロパティ 4〜10）。
    access_credential : AccessCredential | None
        資格情報（タイムアウトを使う）。

    Returns
    -------
    CoreNetworkSetting
        core のネットワーク設定。
    """
    insecure = proxy_setting is not None and proxy_setting.insecure_ssl_enabled
    timeout = None
    if access_credential is not None and access_credential.timeout_seconds != 0:
        timeout = access_credential.timeout_seconds
    return CoreNetworkSetting.from_seconds(
        _to_core_proxy(proxy_setting), insecure, timeout
    )


def _to_core_proxy(proxy_setting: ProxySetting | None) -> CoreProxySetting:
    """プロキシ設定を core のものにする。

    Parameters
    ----------
    proxy_setting : ProxySetting | None
        プロキシ設定。

    Returns
    -------
    CoreProxySetting
        core のプロキシ設定（0=なし、1=手動、2=システム、それ以外はなし）。
    """
    if proxy_setting is None or proxy_setting.use_proxy == USE_PROXY_NONE:
        return CoreProxySetting.none()
    if proxy_setting.use_proxy == USE_PROXY_SYSTEM:
        return CoreProxySetting.system()
    if proxy_setting.use_proxy == USE_PROXY_MANUAL:
        host = proxy_setting.proxy_host or ""
        if proxy_setting.use_proxy_cred:
            return CoreProxySetting.manual(
                host,
                proxy_setting.proxy_port,
                proxy_setting.proxy_id or "",
                proxy_setting.proxy_pass or "",
            )
        return CoreProxySetting.manual(host, proxy_setting.proxy_port)
    return CoreProxySetting.none()


def _core_credential(
    access_credential: AccessCredential, provider_id: CoreProviderId
) -> CoreCredential:
    """資格情報を選ぶ。SecuAiGent でアクセストークンがあればそれを使う。

    Parameters
    ----------
    access_credential : AccessCredential
        資格情報。
    provider_id : CoreProviderId
        プロバイダ。

    Returns
    -------
    CoreCredential
        core の資格情報。
    """
    token = access_credential.secuaigent_access_token
    if provider_id == CoreProviderId.SecuAiGent and token and token.strip():
        return CoreCredential.bearer_token(token)
    return CoreCredential.api_key(access_credential.api_key, provider_id.canonical_name)


def to_runtime_provider_configuration(
    access_credential: AccessCredential | None, proxy_setting: ProxySetting | None
) -> RuntimeProviderConfiguration:
    """資格情報・プロキシ設定をプロバイダの設定にする（AdapterCoreRuntimeConfigurationMapper）。

    Parameters
    ----------
    access_credential : AccessCredential | None
        資格情報。
    proxy_setting : ProxySetting | None
        プロキシ設定。

    Returns
    -------
    RuntimeProviderConfiguration
        プロバイダの設定。

    Raises
    ------
    ValueError
        資格情報がない、プロバイダ・モデル名・URL・API キーがない、
        SecuAiGent でテナント ID がないとき。
    """
    if access_credential is None:
        raise ValueError("accessCredential must not be null")
    provider_id = CoreProviderId.parse(access_credential.vendor_name)
    attributes: dict[str, str] = {}
    if provider_id == CoreProviderId.SecuAiGent:
        tenant_id = access_credential.tenant_id
        if tenant_id is None or not tenant_id.strip():
            raise ValueError("tenantId must not be blank for SecuAiGent")
        attributes[keys.TENANT_ID] = tenant_id
        message_id = access_credential.secuaigent_message_id
        if message_id is not None and message_id.strip():
            attributes[keys.MESSAGE_ID] = message_id
        prompt = access_credential.secuaigent_additional_prompt
        if prompt is not None and prompt.strip():
            attributes[keys.ADDITIONAL_PROMPT] = prompt
        if access_credential.secuaigent_create_library is not None:
            attributes[keys.CREATE_LIBRARY] = (
                "true" if access_credential.secuaigent_create_library else "false"
            )
    return RuntimeProviderConfiguration(
        provider_id,
        access_credential.model_name or "",
        access_credential.url or "",
        _core_credential(access_credential, provider_id),
        to_core_network_setting(proxy_setting, access_credential),
        attributes,
    )


def _to_core_role(role: str | None) -> Role:
    """メッセージの役割を core のものにする（大文字小文字は問わず、不明は user）。

    Parameters
    ----------
    role : str | None
        役割の文字列。

    Returns
    -------
    Role
        core の役割。
    """
    lowered = (role or "").lower()
    if lowered == "system":
        return Role.SYSTEM
    if lowered == "assistant":
        return Role.ASSISTANT
    return Role.USER


def _to_core_message(message: Message | None) -> CoreMessage:
    """メッセージを core のものにする。画像の添付は media にする。

    Parameters
    ----------
    message : Message | None
        メッセージ。

    Returns
    -------
    CoreMessage
        core のメッセージ。
    """
    if message is None:
        return CoreMessage.user("")
    media: tuple[CoreMedia, ...] = ()
    if message.image_resource is not None:
        # 移植元は画像を ByteArrayResource で持ち、ファイル名がないため説明文を名前にする
        media = (
            CoreMedia(
                message.mime_type or "",
                BYTE_ARRAY_RESOURCE_DESCRIPTION,
                message.image_resource,
            ),
        )
    return CoreMessage(
        _to_core_role(message.role),
        message.text or "",
        tuple(m.source_hint for m in media),
        media,
    )


def _to_generation_options(schema: RequestSchema) -> CoreGenerationOptions:
    """生成パラメータを core のものにする。

    Parameters
    ----------
    schema : RequestSchema
        リクエスト。

    Returns
    -------
    CoreGenerationOptions
        core の生成パラメータ。
    """
    return CoreGenerationOptions(
        temperature=schema.temperature,
        top_p=schema.top_p,
        frequency_penalty=schema.frequency_penalty,
        presence_penalty=schema.presence_penalty,
        max_tokens=schema.max_tokens,
        stop=schema.stop,
        reasoning_effort=None
        if schema.reasoning_effort is None
        else schema.reasoning_effort.wire_value(),
        verbosity=None if schema.verbosity is None else schema.verbosity.wire_value(),
    )


def _submit_question_tool_intent(schema: RequestSchema | None) -> str:
    """tool_choice が submit_question なら、その名前を返す。

    Parameters
    ----------
    schema : RequestSchema | None
        リクエスト。

    Returns
    -------
    str
        `submit_question` または空文字列。
    """
    if schema is None or schema.tool_choice is None:
        return ""
    function = schema.tool_choice.get("function")
    if not isinstance(function, dict):
        return ""
    name = function.get("name")
    return SUBMIT_QUESTION if name == SUBMIT_QUESTION else ""


class AdapterCoreChatMapper:
    """リクエストを core の chat・RAG のリクエストにする（移植元 AdapterCoreChatMapper）。"""

    def __init__(
        self, provider_id: str, network_setting: CoreNetworkSetting | None
    ) -> None:
        """プロバイダとネットワーク設定を受け取る。

        Parameters
        ----------
        provider_id : str
            プロバイダの正式名。
        network_setting : CoreNetworkSetting | None
            ネットワーク設定。None なら既定。

        Raises
        ------
        ValueError
            プロバイダが空のとき。
        """
        if not provider_id or not provider_id.strip():
            raise ValueError("providerId must not be blank")
        self._provider_id = provider_id
        self._network_setting = network_setting or CoreNetworkSetting.defaults()

    def to_chat_request(
        self,
        schema: RequestSchema | None,
        output_type: int,
        chat_tools: Sequence[CoreChatTool] = (),
    ) -> CoreChatRequest:
        """通常 chat のリクエストにする。

        Parameters
        ----------
        schema : RequestSchema | None
            リクエスト。
        output_type : int
            出力モード（2 なら回答本文だけ、それ以外は JSON）。
        chat_tools : Sequence[CoreChatTool]
            tools。

        Returns
        -------
        CoreChatRequest
            core の chat のリクエスト。
        """
        hint = (
            OutputModeHint.PLAIN_ANSWER_TEXT
            if output_type == PLAIN_ANSWER_OUTPUT_TYPE
            else OutputModeHint.RETRIEVAL_ANSWER_JSON
        )
        messages = [] if schema is None or schema.messages is None else schema.messages
        builder = (
            CoreChatRequestBuilder(self._provider_id)
            .network_setting(self._network_setting)
            .output_mode_hint(hint)
            .messages([_to_core_message(m) for m in messages])
        )
        if chat_tools:
            builder.tools(chat_tools)
        if schema is not None:
            builder.attribute(
                GENERATION_OPTIONS_ATTRIBUTE, _to_generation_options(schema)
            )
            if schema.response_format is not None:
                builder.attribute(RAG_JSON_RESPONSE_ATTRIBUTE, True)
        intent = _submit_question_tool_intent(schema)
        if intent:
            builder.attribute(RAG_TOOL_INTENT_ATTRIBUTE, intent)
        return builder.build()

    def to_rag_request(
        self, schema: RequestSchema | None, output_type: int
    ) -> CoreRagRequest:
        """RAG のリクエストにする。パスのないコンテキストは除く。

        Parameters
        ----------
        schema : RequestSchema | None
            リクエスト。
        output_type : int
            出力モード。

        Returns
        -------
        CoreRagRequest
            core の RAG のリクエスト。
        """
        contexts = [
            CoreRagContext(
                context.path,
                context.context or "",
                () if context.file_name is None else (context.file_name,),
            )
            for context in (schema.retrieval_contexts if schema is not None else None)
            or []
            if context is not None and context.path is not None and context.path.strip()
        ]
        return CoreRagRequest(
            self.to_chat_request(schema, output_type), tuple(contexts)
        )


def _to_core_mode(mode: ImageExplanationMode | None) -> CoreMediaPreprocessingMode:
    """画像説明モードを core のものにする。

    Parameters
    ----------
    mode : ImageExplanationMode | None
        画像説明モード（プロパティ 31）。

    Returns
    -------
    CoreMediaPreprocessingMode
        core のモード。None は DISABLED。
    """
    return {
        ImageExplanationMode.EMBED_ONLY: CoreMediaPreprocessingMode.EMBED_ONLY,
        ImageExplanationMode.FULL_PAGE: CoreMediaPreprocessingMode.FULL_PAGE,
    }.get(mode or ImageExplanationMode.DISABLED, CoreMediaPreprocessingMode.DISABLED)


class AdapterCoreMediaPreprocessingMapper:
    """ファイルを core の前処理のリクエストにする（移植元 AdapterCoreMediaPreprocessingMapper）。"""

    def __init__(
        self,
        access_credential: AccessCredential,
        proxy_setting: ProxySetting,
        chat_runtime_factory: ChatRuntimeFactory | None = None,
    ) -> None:
        """資格情報・プロキシ設定を受け取る。

        Parameters
        ----------
        access_credential : AccessCredential
            資格情報（画像説明のプロバイダ）。
        proxy_setting : ProxySetting
            プロキシ設定。
        chat_runtime_factory : ChatRuntimeFactory | None
            画像説明に使う core の chat を作る処理（テスト用）。
        """
        self._access_credential = access_credential
        self._proxy_setting = proxy_setting
        self._chat_runtime_factory = (
            chat_runtime_factory or CoreProviderRuntimeFactory.create_chat_runtime
        )

    def to_request(
        self, file_path: str, mode: ImageExplanationMode | None
    ) -> CoreMediaPreprocessingRequest:
        """前処理のリクエストにする。画像説明が有効なら core の chat を付ける。

        Parameters
        ----------
        file_path : str
            ファイルのパス。
        mode : ImageExplanationMode | None
            画像説明モード。

        Returns
        -------
        CoreMediaPreprocessingRequest
            前処理のリクエスト。
        """
        path = Path(file_path)
        adapter_mode = mode or ImageExplanationMode.DISABLED
        source_name = path.name or file_path
        if adapter_mode == ImageExplanationMode.DISABLED:
            return CoreMediaPreprocessingRequest(path, source_name, _to_core_mode(mode))
        configuration = to_runtime_provider_configuration(
            self._access_credential, self._proxy_setting
        )
        return CoreMediaPreprocessingRequest(
            path,
            source_name,
            _to_core_mode(adapter_mode),
            provider_id=configuration.provider_id.canonical_name,
            network_setting=configuration.network_setting,
            image_explanation_runtime=self._chat_runtime_factory(configuration),
        )


def to_file_data(result: CoreMediaPreprocessingResult) -> FileData:
    """前処理の結果を FileData にする（移植元 AdapterCoreMediaPreprocessingResultMapper）。

    Parameters
    ----------
    result : CoreMediaPreprocessingResult
        前処理の結果。

    Returns
    -------
    FileData
        テキスト・画像・画像説明。

    Raises
    ------
    RuntimeError
        前処理が失敗していたとき（コードと要約を含める）。
    """
    if result.failure is not None:
        raise RuntimeError(
            f"Core media preprocessing failed [{result.failure.code}]: "
            f"{result.failure.summary}"
        )
    attachment = result.attachment
    return FileData(
        text=result.text or None,
        image_resource=None if attachment is None else attachment.data,
        mime_type=result.mime_type if attachment is None else attachment.mime_type,
        image_explanations=[
            ImageExplanation(e.type, e.caption, e.source_hint)
            for e in result.image_explanations
        ],
    )
