from pydantic import BaseModel, field_validator


class ShareCreateRequest(BaseModel):
    """共有リンク作成・更新のリクエスト。"""

    roomId: str
    teamIds: list[str]

    @field_validator("teamIds")
    @classmethod
    def _validate_team_ids(cls, value: list[str]) -> list[str]:
        """teamIdsが空でないことを検証する。共有解除はDELETEで行う仕様のため。

        Parameters
        ----------
        value : list[str]
            共有先のグループID一覧。

        Returns
        -------
        list[str]
            検証済みのグループID一覧。

        Raises
        ------
        ValueError
            空のとき。
        """
        if not value:
            raise ValueError(
                "teamIds は空にできません。共有解除は DELETE を使用してください。"
            )
        return value


class ShareDataResponse(BaseModel):
    """共有リンクの内容（`ShareResponse.data`）。"""

    id: str
    roomId: str
    teamIds: list[str]


class ShareAccessDataResponse(BaseModel):
    """共有リンクのアクセス解決結果（`ShareAccessResponse.data`）。"""

    roomId: str
    roomName: str | None
    isReadOnly: bool
    teamIds: list[str]


class ShareResponse(BaseModel):
    """POST /api/shares の応答。移植元 `ShareController` は `{data: ...}` で包む。"""

    data: ShareDataResponse


class ShareAccessResponse(BaseModel):
    """GET /api/shares/{shareId}/access の応答。移植元と同じく `{data: ...}` で包む。"""

    data: ShareAccessDataResponse


class ShareDeleteDataResponse(BaseModel):
    """削除した共有リンクのID（`ShareDeleteResponse.data`）。"""

    id: str


class ShareDeleteResponse(BaseModel):
    """DELETE /api/shares/{shareId} の応答。移植元は 200 で `{data: {id}}` を返す。"""

    data: ShareDeleteDataResponse
