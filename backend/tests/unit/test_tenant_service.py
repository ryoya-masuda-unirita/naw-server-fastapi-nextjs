from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.core.azure_cost_client import AzureCostQueryResult
from app.schemas.tenant import TenantAdminPatchRequest
from app.services.tenant_service import TenantService


class TestGetTenantDetailResponse:
    """TenantService.get_tenant_detail_response のテスト"""

    @patch(
        "app.services.tenant_service.TenantRepository.find_by_id",
        new_callable=AsyncMock,
    )
    async def test_raises_404_when_tenant_not_found(self, mock_find_by_id):
        """テナントが存在しない場合404相当の例外になること"""
        mock_find_by_id.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await TenantService.get_tenant_detail_response(
                "missing-tenant", session=None
            )

        assert exc_info.value.status_code == 404


class TestPatchAdminTenant:
    """TenantService.patch_admin_tenant のテスト"""

    @patch(
        "app.services.tenant_service.TenantRepository.find_by_id",
        new_callable=AsyncMock,
    )
    async def test_raises_404_when_tenant_not_found(self, mock_find_by_id):
        """テナントが存在しない場合404相当の例外になること"""
        mock_find_by_id.return_value = None
        request = TenantAdminPatchRequest(tenantName="New Name")

        with pytest.raises(HTTPException) as exc_info:
            await TenantService.patch_admin_tenant(
                "missing-tenant", request, session=None
            )

        assert exc_info.value.status_code == 404


class TestQueryCost:
    """TenantService.query_cost のテスト"""

    @patch(
        "app.services.tenant_service.AzureCostClient.get_cost_by_resource_id",
    )
    @patch(
        "app.services.tenant_service.TenantResourceRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    async def test_returns_cost_list_when_resource_belongs_to_tenant(
        self, mock_find_resource, mock_get_cost
    ):
        """テナントに紐づくリソースの場合、Azureから取得したコスト一覧を返すこと"""
        mock_find_resource.return_value = object()
        mock_get_cost.return_value = [
            AzureCostQueryResult(
                resource_type="AZURE_OPENAI",
                usage_date=date(2024, 1, 1),
                pre_tax_cost=12.5,
                currency="JPY",
            )
        ]

        result = await TenantService.query_cost(
            "tenant-1", "resource-1", None, None, session=None
        )

        assert len(result) == 1
        assert result[0].resourceType == "AZURE_OPENAI"
        assert result[0].usageDate == date(2024, 1, 1)
        assert result[0].preTaxCost == 12.5
        assert result[0].currency == "JPY"
        mock_get_cost.assert_called_once_with("resource-1", None, None)

    @patch(
        "app.services.tenant_service.TenantResourceRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    async def test_raises_400_when_resource_not_owned_by_tenant(
        self, mock_find_resource
    ):
        """リソースが指定テナントに紐づかない場合400になること"""
        mock_find_resource.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await TenantService.query_cost(
                "tenant-1", "resource-1", None, None, session=None
            )

        assert exc_info.value.status_code == 400

    @patch(
        "app.services.tenant_service.AzureCostClient.get_cost_by_resource_id",
    )
    @patch(
        "app.services.tenant_service.TenantResourceRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    async def test_parses_from_and_to_as_iso_datetime(
        self, mock_find_resource, mock_get_cost
    ):
        """from/toがISO8601日時としてパースされAzureCostClientに渡されること"""
        mock_find_resource.return_value = object()
        mock_get_cost.return_value = []

        await TenantService.query_cost(
            "tenant-1",
            "resource-1",
            "2024-01-01T00:00:00Z",
            "2024-02-01T00:00:00Z",
            session=None,
        )

        mock_get_cost.assert_called_once_with(
            "resource-1",
            datetime(2024, 1, 1, tzinfo=timezone.utc),
            datetime(2024, 2, 1, tzinfo=timezone.utc),
        )

    @patch(
        "app.services.tenant_service.TenantResourceRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    async def test_raises_400_for_invalid_date_format(self, mock_find_resource):
        """from/toがISO8601形式でパースできない場合400になること"""
        mock_find_resource.return_value = object()

        with pytest.raises(HTTPException) as exc_info:
            await TenantService.query_cost(
                "tenant-1", "resource-1", "not-a-date", None, session=None
            )

        assert exc_info.value.status_code == 400
