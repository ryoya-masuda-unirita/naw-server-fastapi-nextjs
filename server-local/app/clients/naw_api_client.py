import json
from typing import Any

import httpx

LIBRARIES_PATH = "/api/libraries"
TENANT_HEADER = "X-Tenant-ID"


class NawApiError(Exception):
    """移植元 NawApiClient が投げる IllegalStateException 相当。"""


class NawApiClient:
    """移植元 NawApiClient（NAW 本体のライブラリ API 呼び出し）の移植。"""

    def __init__(self, *, base_url: str, http_client: httpx.AsyncClient) -> None:
        self._base_url = base_url.rstrip("/")
        self._http = http_client

    async def create_library_stub(
        self, message_id: str | None, access_token: str | None, tenant_id: str | None
    ) -> str:
        body = await self._exchange(
            "POST",
            LIBRARIES_PATH,
            {"messageId": message_id},
            access_token,
            tenant_id,
        )
        data = body.get("data") if isinstance(body, dict) else None
        library_id = data.get("id") if isinstance(data, dict) else None
        if not isinstance(library_id, str) or not library_id.strip():
            raise NawApiError("NAW のライブラリスタブ作成応答に id がありません")
        return library_id

    async def update_library_title(
        self,
        library_id: str,
        title: str,
        access_token: str | None,
        tenant_id: str | None,
    ) -> None:
        await self._exchange(
            "PATCH",
            f"{LIBRARIES_PATH}/{library_id}/title",
            {"title": title},
            access_token,
            tenant_id,
        )

    async def _exchange(
        self,
        method: str,
        path: str,
        payload: dict[str, Any],
        access_token: str | None,
        tenant_id: str | None,
    ) -> Any:
        if not self._base_url:
            raise NawApiError("naw.base-url が設定されていません")
        if not access_token or not access_token.strip():
            raise NawApiError("accessToken がありません")
        headers = {"Authorization": f"Bearer {access_token}"}
        if tenant_id and tenant_id.strip():
            headers[TENANT_HEADER] = tenant_id
        try:
            response = await self._http.request(
                method, f"{self._base_url}{path}", json=payload, headers=headers
            )
        except httpx.HTTPError as e:
            raise NawApiError("NAW API の呼び出しに失敗しました") from e
        if response.is_error:
            raise NawApiError(
                "NAW API の呼び出しに失敗しました: "
                f"status={response.status_code}, body={response.text}"
            )
        if not response.text.strip():
            return {}
        try:
            return json.loads(response.text)
        except json.JSONDecodeError as e:
            raise NawApiError("NAW API の呼び出しに失敗しました") from e
