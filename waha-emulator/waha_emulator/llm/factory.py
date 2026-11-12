from waha_emulator.config import LlmProvider, Settings
from waha_emulator.llm.azure_openai import AzureOpenAiLlmClient
from waha_emulator.llm.base import LlmClient
from waha_emulator.llm.echo import EchoLlmClient


def create_llm_client(settings: Settings) -> LlmClient:
    if settings.llm_provider == LlmProvider.AZURE_OPENAI:
        return AzureOpenAiLlmClient(
            endpoint=settings.azure_openai_endpoint,
            api_key=settings.azure_openai_api_key,
            deployment=settings.azure_openai_deployment,
            api_version=settings.azure_openai_api_version,
        )
    return EchoLlmClient()
