"""SecuAiGent のログイン（移植元 SecuAiGentAuthClient）。

アクセストークン（textData の accessToken）があればそれを使い、なければ
`POST {URL}/auth/login-key` に loginKey（API_KEY）を送って JWT を取る。
"""

import json
import logging

from generative_ai_core.network.transport import create_transport
from generative_ai_core.provider.clients.secuaigent import failure
from generative_ai_core.provider.clients.secuaigent.keys import TENANT_ID
from generative_ai_core.provider.model import (
    CredentialKind,
    RuntimeProviderConfiguration,
)

logger = logging.getLogger(__name__)

LOGIN_PATH = "/auth/login-key"
HTTP_ERROR_THRESHOLD = 400
HTTP_PROXY_AUTH_REQUIRED = 407


def normalize_base_url(endpoint: str) -> str:
    """末尾の `/` を 1 つだけ除く（移植元と同じ）。

    Parameters
    ----------
    endpoint : str
        プロバイダの URL。

    Returns
    -------
    str
        末尾の `/` を除いた URL。
    """
    return endpoint.removesuffix("/")


def _escape_json(value: str) -> str:
    """JSON 文字列に埋め込むため、バックスラッシュと二重引用符をエスケープする。

    Parameters
    ----------
    value : str
        エスケープする文字列。

    Returns
    -------
    str
        エスケープ後の文字列。
    """
    # 移植元は `\` と `"` だけをエスケープして文字列を組み立てる
    return value.replace("\\", "\\\\").replace('"', '\\"')


def parse_token(response_body: str) -> str:
    """ログインの応答からトークンを取り出す。

    Parameters
    ----------
    response_body : str
        ログインの応答本文（JSON）。

    Returns
    -------
    str
        トークン。

    Raises
    ------
    SecuAiGentIOError
        応答の形式が不正なとき。
    ValueError
        トークンが空のとき。
    """
    try:
        value = json.loads(response_body)
    except json.JSONDecodeError as e:
        # Gson の JsonSyntaxException 相当（ValueError 扱いにしない）
        raise failure.SecuAiGentIOError(f"invalid token response: {e.msg}") from None
    if not isinstance(value, dict):
        raise failure.SecuAiGentIOError("invalid token response")
    token = value.get("token")
    if token is None:
        raise ValueError("token must not be blank")
    if isinstance(token, (dict, list)):
        raise failure.SecuAiGentIOError("invalid token response")
    text = str(token).lower() if isinstance(token, bool) else str(token)
    if not text.strip():
        raise ValueError("token must not be blank")
    return text


class SecuAiGentAuthClient:
    """SecuAiGent のログインのクライアント。"""

    def resolve_access_token(self, configuration: RuntimeProviderConfiguration) -> str:
        """アクセストークンを決める。なければログインして取る。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの実行時設定。

        Returns
        -------
        str
            アクセストークン。
        """
        if configuration.credential.kind == CredentialKind.BEARER_TOKEN:
            logger.info("secuaigent auth: using access token from textData")
            return configuration.credential.value
        return self.login(configuration)

    def login(self, configuration: RuntimeProviderConfiguration) -> str:
        """loginKey でログインして JWT を取る。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの実行時設定。

        Returns
        -------
        str
            JWT。

        Raises
        ------
        ValueError
            テナント ID が空・トークンが空のとき。
        SecuAiGentIOError
            通信・認証・応答の形式が失敗したとき。
        """
        tenant_id = configuration.attributes.get(TENANT_ID)
        if tenant_id is None or not tenant_id.strip():
            raise ValueError("tenantId must not be blank")
        body = '{"loginKey":"' + _escape_json(configuration.credential.value) + '"}'
        logger.info("secuaigent auth: POST %s", LOGIN_PATH)
        try:
            transport = create_transport(configuration.network_setting)
            response = transport.post(
                normalize_base_url(configuration.endpoint) + LOGIN_PATH,
                {"Content-Type": "application/json", "X-Tenant-ID": tenant_id},
                body.encode("utf-8"),
            )
        except Exception as e:
            raise failure.to_io_error(e) from e
        if response.status_code >= HTTP_ERROR_THRESHOLD:
            failure_class = (
                failure.PROXY_AUTH_FAILURE
                if response.status_code == HTTP_PROXY_AUTH_REQUIRED
                else failure.AUTH_FAILURE
            )
            raise failure.SecuAiGentIOError(failure.summary(failure_class))
        try:
            return parse_token(response.body)
        except Exception as e:
            raise failure.to_io_error(e) from e
