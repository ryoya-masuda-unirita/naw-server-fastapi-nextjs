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
        """接続先と HTTP クライアントを受け取る。

        HTTP クライアントは外から受け取り、アプリ全体で接続を使い回すとともに
        テストで偽の応答に差し替えられるようにしている。

        Parameters
        ----------
        base_url : str
            NAW 本体の URL（``naw.base-url``）。末尾の ``/`` は取り除いて保持する。
            空文字なら呼び出し時に ``NawApiError`` にする。
        http_client : httpx.AsyncClient
            NAW API の呼び出しに使う HTTP クライアント。
        """
        self._base_url = base_url.rstrip("/")
        self._http = http_client

    async def create_library_stub(
        self, message_id: str | None, access_token: str | None, tenant_id: str | None
    ) -> str:
        """NAW 本体に、生成するライブラリの入れ物（スタブ）を作らせる。

        ライブラリ生成付きの回答で、Waha! のジョブを始める前に呼ばれる。返った ID に
        生成結果の本文を紐づけて保存するため、ID が取れなければ失敗とする。

        Parameters
        ----------
        message_id : str | None
            ライブラリを紐づけるメッセージの ID。
        access_token : str | None
            NAW 本体の API に渡すアクセストークン（Bearer）。
        tenant_id : str | None
            ``X-Tenant-ID`` ヘッダで渡すテナント ID。空なら送らない。

        Returns
        -------
        str
            作成されたライブラリの ID（応答の ``data.id``）。

        Raises
        ------
        NawApiError
            呼び出しに失敗した場合、または応答に空でない ``data.id`` がない場合。
        """
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
        """NAW 本体のライブラリのタイトルを、生成したタイトルで更新する。

        Parameters
        ----------
        library_id : str
            ``create_library_stub`` で作ったライブラリの ID。
        title : str
            Waha! が生成したライブラリのタイトル。
        access_token : str | None
            NAW 本体の API に渡すアクセストークン（Bearer）。
        tenant_id : str | None
            ``X-Tenant-ID`` ヘッダで渡すテナント ID。空なら送らない。

        Raises
        ------
        NawApiError
            呼び出しに失敗した場合。
        """
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
        """NAW 本体の API を JSON で呼び出し、応答の JSON を返す。

        移植元 NawApiClient と同じく、設定不足・通信失敗・エラー応答・JSON でない応答を
        すべて ``NawApiError`` にそろえ、呼び出し側が 1 種類の例外だけ扱えばよいようにする。

        Parameters
        ----------
        method : str
            HTTP メソッド（``POST``・``PATCH`` など）。
        path : str
            ``base_url`` からのパス。
        payload : dict[str, Any]
            JSON で送るリクエスト本文。
        access_token : str | None
            ``Authorization: Bearer`` で送るアクセストークン。
        tenant_id : str | None
            ``X-Tenant-ID`` ヘッダで送るテナント ID。空なら送らない。

        Returns
        -------
        Any
            応答本文を JSON として読んだ値。本文が空なら空の dict。

        Raises
        ------
        NawApiError
            ``base_url`` やアクセストークンがない場合、通信に失敗した場合、
            エラーステータスが返った場合、応答が JSON として読めない場合。
        """
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
