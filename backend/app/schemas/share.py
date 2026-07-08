from pydantic import BaseModel, field_validator


class ShareCreateRequest(BaseModel):
    roomId: str
    teamIds: list[str]

    @field_validator("teamIds")
    @classmethod
    def _validate_team_ids(cls, value: list[str]) -> list[str]:
        """teamIdsが空でないことを検証する。共有解除はDELETEで行う仕様のため。"""
        if not value:
            raise ValueError(
                "teamIds は空にできません。共有解除は DELETE を使用してください。"
            )
        return value


class ShareDataResponse(BaseModel):
    id: str
    roomId: str
    teamIds: list[str]


class ShareAccessDataResponse(BaseModel):
    roomId: str
    roomName: str | None
    isReadOnly: bool
    teamIds: list[str]
