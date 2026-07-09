from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

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
