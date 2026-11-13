"""プロキシ・SSL・タイムアウトの設定と HTTP 送信（移植元 `jp.co.unirita.ai.core.network`）。"""

from generative_ai_core.network.setting import (
    DEFAULT_TIMEOUT_SECONDS,
    MAX_TIMEOUT_SECONDS,
    MIN_TIMEOUT_SECONDS,
    CoreNetworkSetting,
    CoreProxySetting,
    ProxyMode,
)
from generative_ai_core.network.transport import (
    CoreHttpResponse,
    CoreHttpTransport,
    StreamingBodyHandler,
    client_options,
    create_transport,
    describe,
)

__all__ = [
    "DEFAULT_TIMEOUT_SECONDS",
    "MAX_TIMEOUT_SECONDS",
    "MIN_TIMEOUT_SECONDS",
    "CoreHttpResponse",
    "CoreHttpTransport",
    "CoreNetworkSetting",
    "CoreProxySetting",
    "ProxyMode",
    "StreamingBodyHandler",
    "client_options",
    "create_transport",
    "describe",
]
