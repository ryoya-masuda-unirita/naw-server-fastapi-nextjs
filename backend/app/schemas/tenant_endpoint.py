from pydantic import BaseModel

from app.models.tenant_endpoint import EndpointType


class TenantEndpointCreateRequest(BaseModel):
    type: EndpointType
    endpointName: str
    endpoint: str
    apiKey: str


class TenantEndpointUpdateRequest(BaseModel):
    type: EndpointType | None = None
    endpointName: str | None = None
    endpoint: str | None = None
    apiKey: str | None = None


class EndpointResponse(BaseModel):
    """apiKeyはレスポンスに含めない（移植元の@JsonProperty(WRITE_ONLY)相当）。"""

    id: str
    tenantId: str
    type: EndpointType
    endpointName: str
    endpoint: str
