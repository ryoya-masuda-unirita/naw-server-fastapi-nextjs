from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.core.azure_cost_client import AzureCostClient, AzureCostQueryResult
from app.core.config import AzureCostSettings


def _settings() -> AzureCostSettings:
    """テスト用に `.env` を読み込まずに `AzureCostSettings` を組み立てる。"""
    return AzureCostSettings(
        _env_file=None,
        AZURE_APP_SUBSCRIPTION_ID="sub-1",
        AZURE_APP_RESOURCE_GROUP_NAME="rg-1",
        AZURE_APP_TENANT_ID="azure-tenant-1",
        AZURE_APP_CLIENT_ID="client-1",
        AZURE_APP_CLIENT_SECRET_VALUE="secret-1",
    )  # type: ignore[arg-type]


def _columns(names: list[str] | None = None) -> list[SimpleNamespace]:
    """Azure APIレスポンスの列メタデータ（`QueryColumn`相当）を組み立てる。"""
    names = names or ["totalCost", "UsageDate", "ResourceType", "Currency"]
    return [SimpleNamespace(name=name) for name in names]


class TestGetCostByResourceId:
    """AzureCostClient.get_cost_by_resource_id のテスト"""

    @patch("app.core.azure_cost_client.get_azure_cost_settings")
    @patch("app.core.azure_cost_client.CostManagementClient")
    @patch("app.core.azure_cost_client.ClientSecretCredential")
    def test_maps_rows_to_query_results(
        self, mock_credential, mock_client_cls, mock_get_settings
    ):
        """Azure APIのレスポンス行をAzureCostQueryResultへ正しくマッピングできること

        列の並びは columns メタデータの [totalCost, UsageDate(yyyyMMdd),
        ResourceType, Currency] に対応する。
        """
        mock_get_settings.return_value = _settings()
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.query.usage.return_value = MagicMock(
            columns=_columns(),
            rows=[[1.5, 20240101, "AZURE_OPENAI", "JPY"]],
        )

        results = AzureCostClient.get_cost_by_resource_id("resource-1", None, None)

        assert results == [
            AzureCostQueryResult(
                resource_type="AZURE_OPENAI",
                usage_date=date(2024, 1, 1),
                pre_tax_cost=1.5,
                currency="JPY",
            )
        ]

    @patch("app.core.azure_cost_client.get_azure_cost_settings")
    @patch("app.core.azure_cost_client.CostManagementClient")
    @patch("app.core.azure_cost_client.ClientSecretCredential")
    def test_maps_rows_regardless_of_column_order(
        self, mock_credential, mock_client_cls, mock_get_settings
    ):
        """列の並び順がクエリ定義により変わっても、列名で正しくマッピングできること"""
        mock_get_settings.return_value = _settings()
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        # totalCostとUsageDateの並びを入れ替えたレスポンスを返す
        mock_client.query.usage.return_value = MagicMock(
            columns=_columns(["UsageDate", "totalCost", "ResourceType", "Currency"]),
            rows=[[20240101, 1.5, "AZURE_OPENAI", "JPY"]],
        )

        results = AzureCostClient.get_cost_by_resource_id("resource-1", None, None)

        assert results == [
            AzureCostQueryResult(
                resource_type="AZURE_OPENAI",
                usage_date=date(2024, 1, 1),
                pre_tax_cost=1.5,
                currency="JPY",
            )
        ]

    @patch("app.core.azure_cost_client.get_azure_cost_settings")
    @patch("app.core.azure_cost_client.CostManagementClient")
    @patch("app.core.azure_cost_client.ClientSecretCredential")
    def test_raises_when_expected_column_is_missing(
        self, mock_credential, mock_client_cls, mock_get_settings
    ):
        """想定する列（totalCost等）がレスポンスに含まれない場合ValueErrorになること"""
        mock_get_settings.return_value = _settings()
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.query.usage.return_value = MagicMock(
            columns=_columns(["UsageDate", "ResourceType", "Currency"]),
            rows=[[20240101, "AZURE_OPENAI", "JPY"]],
        )

        with pytest.raises(ValueError):
            AzureCostClient.get_cost_by_resource_id("resource-1", None, None)

    @patch("app.core.azure_cost_client.get_azure_cost_settings")
    @patch("app.core.azure_cost_client.CostManagementClient")
    @patch("app.core.azure_cost_client.ClientSecretCredential")
    def test_returns_empty_list_when_no_rows(
        self, mock_credential, mock_client_cls, mock_get_settings
    ):
        """結果行が0件の場合空リストを返すこと"""
        mock_get_settings.return_value = _settings()
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.query.usage.return_value = MagicMock(columns=_columns(), rows=[])

        results = AzureCostClient.get_cost_by_resource_id("resource-1", None, None)

        assert results == []

    @patch("app.core.azure_cost_client.get_azure_cost_settings")
    @patch("app.core.azure_cost_client.CostManagementClient")
    @patch("app.core.azure_cost_client.ClientSecretCredential")
    def test_skips_rows_with_unexpected_column_count(
        self, mock_credential, mock_client_cls, mock_get_settings
    ):
        """列メタデータと列数が一致しない行は無視すること"""
        mock_get_settings.return_value = _settings()
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.query.usage.return_value = MagicMock(
            columns=_columns(),
            rows=[[1.5, 20240101, "AZURE_OPENAI"]],
        )

        results = AzureCostClient.get_cost_by_resource_id("resource-1", None, None)

        assert results == []

    @patch("app.core.azure_cost_client.get_azure_cost_settings")
    @patch("app.core.azure_cost_client.CostManagementClient")
    @patch("app.core.azure_cost_client.ClientSecretCredential")
    def test_uses_last_billing_month_timeframe_when_no_dates_given(
        self, mock_credential, mock_client_cls, mock_get_settings
    ):
        """from/to未指定の場合、timeframe=TheLastBillingMonthでAPIを呼び出すこと"""
        mock_get_settings.return_value = _settings()
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.query.usage.return_value = MagicMock(columns=_columns(), rows=[])

        AzureCostClient.get_cost_by_resource_id("resource-1", None, None)

        _, kwargs = mock_client.query.usage.call_args
        parameters = kwargs["parameters"]
        assert parameters.timeframe == "TheLastBillingMonth"
        assert parameters.time_period is None

    @patch("app.core.azure_cost_client.get_azure_cost_settings")
    @patch("app.core.azure_cost_client.CostManagementClient")
    @patch("app.core.azure_cost_client.ClientSecretCredential")
    def test_uses_custom_timeframe_when_date_range_given(
        self, mock_credential, mock_client_cls, mock_get_settings
    ):
        """from/toが指定された場合、timeframe=Customで期間付きAPI呼び出しをすること"""
        mock_get_settings.return_value = _settings()
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.query.usage.return_value = MagicMock(columns=_columns(), rows=[])
        start = datetime(2024, 1, 1, tzinfo=timezone.utc)
        end = datetime(2024, 2, 1, tzinfo=timezone.utc)

        AzureCostClient.get_cost_by_resource_id("resource-1", start, end)

        _, kwargs = mock_client.query.usage.call_args
        parameters = kwargs["parameters"]
        assert parameters.timeframe == "Custom"
        assert parameters.time_period.from_property == start
        assert parameters.time_period.to == end

    @patch("app.core.azure_cost_client.get_azure_cost_settings")
    @patch("app.core.azure_cost_client.CostManagementClient")
    @patch("app.core.azure_cost_client.ClientSecretCredential")
    def test_filters_by_resource_id(
        self, mock_credential, mock_client_cls, mock_get_settings
    ):
        """ResourceIdでフィルタしたクエリを組み立てること"""
        mock_get_settings.return_value = _settings()
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.query.usage.return_value = MagicMock(columns=_columns(), rows=[])

        AzureCostClient.get_cost_by_resource_id("resource-xyz", None, None)

        _, kwargs = mock_client.query.usage.call_args
        parameters = kwargs["parameters"]
        dimensions = parameters.dataset.filter.dimensions
        assert dimensions.name == "ResourceId"
        assert dimensions.operator == "In"
        assert dimensions.values_property == ["resource-xyz"]

    @patch("app.core.azure_cost_client.get_azure_cost_settings")
    @patch("app.core.azure_cost_client.CostManagementClient")
    @patch("app.core.azure_cost_client.ClientSecretCredential")
    def test_builds_scope_from_settings(
        self, mock_credential, mock_client_cls, mock_get_settings
    ):
        """設定値（サブスクリプションID・リソースグループ名）からscopeを組み立てること"""
        mock_get_settings.return_value = _settings()
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.query.usage.return_value = MagicMock(columns=_columns(), rows=[])

        AzureCostClient.get_cost_by_resource_id("resource-1", None, None)

        _, kwargs = mock_client.query.usage.call_args
        assert kwargs["scope"] == "/subscriptions/sub-1/resourceGroups/rg-1"
