from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant_endpoint import EndpointType, TenantEndpoint
from app.repositories.tenant_endpoint_repository import TenantEndpointRepository
from app.schemas.tenant_endpoint import (
    EndpointResponse,
    LocalServerEndpointResponse,
    TenantEndpointCreateRequest,
    TenantEndpointUpdateRequest,
)


class TenantEndpointService:
    @staticmethod
    def _assert_local_server_only(endpoint_type: EndpointType) -> None:
        """LOCAL_SERVER以外のタイプに対する作成・更新・削除操作を拒否する。

        移植元（Spring Boot）の`assertLocalServerOnly`と同じ制約。クラウドAIプロバイダーの
        接続情報（Azure OpenAI等）は本APIでは作成・更新・削除できない。

        Args:
            endpoint_type: 検証対象のエンドポイントタイプ。

        Raises:
            HTTPException: LOCAL_SERVER以外の場合 400 を返す。
        """
        if endpoint_type != EndpointType.LOCAL_SERVER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="テナントエンドポイントの作成・更新・削除はLOCAL_SERVERタイプのみ可能です。",
            )

    @staticmethod
    def _assert_valid_url(endpoint: str) -> None:
        """簡易的なURL形式チェックを行う。

        Args:
            endpoint: 検証対象のURL文字列。

        Raises:
            HTTPException: http(s)://で始まらない場合 400 を返す。
        """
        if not (endpoint.startswith("http://") or endpoint.startswith("https://")):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="有効なURLを入力してください。",
            )

    @staticmethod
    async def get_endpoints(
        tenant_id: str, session: AsyncSession
    ) -> list[EndpointResponse]:
        """テナント内の全エンドポイント一覧を取得する。

        Args:
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            エンドポイント一覧。
        """
        endpoints = await TenantEndpointRepository.find_by_tenant_id(tenant_id, session)
        return [TenantEndpointService._to_response(e) for e in endpoints]

    @staticmethod
    async def get_endpoints_by_type(
        tenant_id: str, endpoint_type: EndpointType, session: AsyncSession
    ) -> list[EndpointResponse]:
        """テナント内の指定タイプのエンドポイント一覧を取得する。

        Args:
            tenant_id: テナントID。
            endpoint_type: エンドポイントタイプ。
            session: 非同期DBセッション。

        Returns:
            エンドポイント一覧。
        """
        endpoints = await TenantEndpointRepository.find_by_tenant_id_and_type(
            tenant_id, endpoint_type, session
        )
        return [TenantEndpointService._to_response(e) for e in endpoints]

    @staticmethod
    async def create_endpoint(
        tenant_id: str, req: TenantEndpointCreateRequest, session: AsyncSession
    ) -> EndpointResponse:
        """エンドポイントを作成する（LOCAL_SERVERタイプのみ）。

        Args:
            tenant_id: テナントID。
            req: 作成リクエスト。
            session: 非同期DBセッション。

        Returns:
            作成したエンドポイント。

        Raises:
            HTTPException: typeがLOCAL_SERVER以外の場合400、URL形式が不正な場合400を返す。
        """
        TenantEndpointService._assert_local_server_only(req.type)
        TenantEndpointService._assert_valid_url(req.endpoint)

        endpoint = TenantEndpoint(
            tenant_id=tenant_id,
            type=req.type,
            endpoint_name=req.endpointName,
            endpoint=req.endpoint,
            api_key=req.apiKey,
        )
        session.add(endpoint)
        await session.commit()
        await session.refresh(endpoint)
        return TenantEndpointService._to_response(endpoint)

    @staticmethod
    async def update_endpoint(
        endpoint_id: str,
        tenant_id: str,
        req: TenantEndpointUpdateRequest,
        session: AsyncSession,
    ) -> EndpointResponse:
        """エンドポイントを更新する（対象・更新後ともLOCAL_SERVERタイプのみ）。

        Args:
            endpoint_id: エンドポイントID。
            tenant_id: テナントID。
            req: 更新リクエスト。
            session: 非同期DBセッション。

        Returns:
            更新後のエンドポイント。

        Raises:
            HTTPException: エンドポイントが存在しない場合404、現在または更新後のtypeが
                LOCAL_SERVER以外の場合400、URL形式が不正な場合400を返す。
        """
        endpoint = await TenantEndpointRepository.find_by_id_and_tenant_id(
            endpoint_id, tenant_id, session
        )
        if not endpoint:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not found"
            )

        TenantEndpointService._assert_local_server_only(endpoint.type)
        if req.type is not None:
            TenantEndpointService._assert_local_server_only(req.type)
            endpoint.type = req.type
        if req.endpointName is not None:
            endpoint.endpoint_name = req.endpointName
        if req.endpoint is not None:
            TenantEndpointService._assert_valid_url(req.endpoint)
            endpoint.endpoint = req.endpoint
        if req.apiKey is not None:
            endpoint.api_key = req.apiKey

        session.add(endpoint)
        await session.commit()
        await session.refresh(endpoint)
        return TenantEndpointService._to_response(endpoint)

    @staticmethod
    async def delete_endpoint(
        endpoint_id: str, tenant_id: str, session: AsyncSession
    ) -> None:
        """エンドポイントを削除する（LOCAL_SERVERタイプのみ）。

        Args:
            endpoint_id: エンドポイントID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Raises:
            HTTPException: エンドポイントが存在しない場合404、typeがLOCAL_SERVER以外の場合400を返す。
        """
        endpoint = await TenantEndpointRepository.find_by_id_and_tenant_id(
            endpoint_id, tenant_id, session
        )
        if not endpoint:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not found"
            )

        TenantEndpointService._assert_local_server_only(endpoint.type)
        await TenantEndpointRepository.delete(endpoint, session)

    @staticmethod
    async def get_local_server_endpoint(
        tenant_id: str, endpoint_id: str, session: AsyncSession
    ) -> LocalServerEndpointResponse:
        """ローカルサーバーエンドポイントを取得する（apiKeyを含む）。

        Args:
            tenant_id: テナントID。
            endpoint_id: エンドポイントID。
            session: 非同期DBセッション。

        Returns:
            apiKeyを含むエンドポイント情報。

        Raises:
            HTTPException: エンドポイントが存在しない、自テナントに属さない、
                またはLOCAL_SERVERタイプでない場合404を返す。
        """
        endpoint = await TenantEndpointRepository.find_by_id_and_tenant_id(
            endpoint_id, tenant_id, session
        )
        if not endpoint or endpoint.type != EndpointType.LOCAL_SERVER:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No endpoint found for endpointId: {endpoint_id}",
            )
        return LocalServerEndpointResponse(
            id=endpoint.id,
            tenantId=endpoint.tenant_id,
            type=endpoint.type,
            endpoint=endpoint.endpoint,
            apiKey=endpoint.api_key,
        )

    @staticmethod
    def _to_response(endpoint: TenantEndpoint) -> EndpointResponse:
        return EndpointResponse(
            id=endpoint.id,
            tenantId=endpoint.tenant_id,
            type=endpoint.type,
            endpointName=endpoint.endpoint_name,
            endpoint=endpoint.endpoint,
        )
