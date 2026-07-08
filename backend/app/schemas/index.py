from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.models.index import IndexType


class IndexRequest(BaseModel):
    """インデックス作成・更新共用リクエスト（移植元`IndexCreateRequest`相当）。"""

    name: str
    description: str | None = Field(default=None, max_length=255)
    add: str | None = None
    delete: str | None = None
    get: str | None = None
    type: IndexType
    endpointIds: list[str]
    groupIds: list[str] | None = None

    @model_validator(mode="after")
    def _validate_endpoints(self) -> "IndexRequest":
        """種別ごとのエンドポイント数・WahaサービスID指定を検証する（移植元`IndexRequestValidator`相当）。

        SAAS_GLOBALの新規作成時のみ課される15件上限チェックは、テナント内の既存件数を
        参照する必要があるためサービス層（`IndexService`）で行う。
        """
        if self.type == IndexType.LOCAL:
            if len(self.endpointIds) != 1:
                raise ValueError(
                    "ローカルAPIサーバのエンドポイント指定に誤りがあります。"
                )
            if not self.get or not self.add or not self.delete:
                raise ValueError(
                    "ローカルAPIサーバ用のWaha!サービスIDを指定する必要があります。。"
                )
            return self

        if len(self.endpointIds) != 2:
            raise ValueError("エンドポイントの指定に誤りがあります。")
        return self


class TenantEndpointItemResponse(BaseModel):
    """インデックスに紐づくテナントエンドポイントの1件分。"""

    id: str
    tenantId: str
    type: str
    endpointName: str
    endpoint: str


class IndexResponse(BaseModel):
    """インデックスのレスポンス（移植元`SingleIndexResponse`相当）。"""

    id: str
    tenantId: str
    type: IndexType
    name: str
    description: str | None
    tenantEndpoints: list[TenantEndpointItemResponse]
    groupIds: list[str]
    add: str | None
    delete: str | None
    get: str | None
    createdAt: datetime
    updatedAt: datetime


class PagedIndexResponse(BaseModel):
    content: list[IndexResponse]
    totalElements: int
    number: int
    size: int
