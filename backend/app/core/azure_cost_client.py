import logging
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from azure.identity import ClientSecretCredential
from azure.mgmt.costmanagement import CostManagementClient
from azure.mgmt.costmanagement.models import (
    QueryAggregation,
    QueryColumn,
    QueryComparisonExpression,
    QueryDataset,
    QueryDefinition,
    QueryFilter,
    QueryGrouping,
    QueryTimePeriod,
)

from app.core.config import get_azure_cost_settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AzureCostQueryResult:
    """Azure Cost Management APIから取得したリソース単位のコスト集計結果。

    移植元Java版`AzureCostManageService.AzureCostQueryResult`（record）に対応する。
    """

    resource_type: str
    usage_date: date
    pre_tax_cost: float
    currency: str


class AzureCostClient:
    """Azure Cost Management APIを呼び出し、リソース単位のコストを取得するクライアント。

    移植元Java版`AzureCostManageService`に対応する。`services/`配下の他サービスから
    呼び出す外部API連携のため、「serviceが別serviceを呼ばない」規約に抵触しないよう
    `core/`（インフラ層）に配置する。Azure SDKの呼び出しをこのクラスに閉じ込めることで、
    テスト時はこのクラス（または内部で使う`CostManagementClient`/`ClientSecretCredential`）
    のみをモックすればよいようにする。
    """

    @staticmethod
    def get_cost_by_resource_id(
        resource_id: str,
        start_date: datetime | None,
        end_date: datetime | None,
    ) -> list[AzureCostQueryResult]:
        """指定リソースのコストをAzure Cost Management APIから日次集計で取得する。

        Args:
            resource_id: コストを取得する対象のAzureリソースID。
            start_date: 集計期間の開始日時。Noneの場合は`end_date`とあわせて
                直近の請求月（THE_LAST_BILLING_MONTH相当）が使われる。
            end_date: 集計期間の終了日時。

        Returns:
            リソースタイプ・日付ごとのコスト集計結果一覧。該当行がない場合は空リスト。
        """
        settings = get_azure_cost_settings()
        # Python SDKのドキュメント記載形式（先頭スラッシュあり）に合わせる。
        # 移植元Java版（`azure-resourcemanager-costmanagement`）は先頭スラッシュなしで
        # 組み立てているが、Azure Cost Management REST APIの`scope`パラメータの正式な
        # 形式は先頭スラッシュありのため、こちらに合わせる。
        scope = (
            f"/subscriptions/{settings.azure_subscription_id}"
            f"/resourceGroups/{settings.azure_resource_group_name}"
        )

        credential = ClientSecretCredential(
            tenant_id=settings.azure_tenant_id,
            client_id=settings.azure_client_id,
            client_secret=settings.azure_client_secret_value,
        )
        client = CostManagementClient(credential)

        query_filter = QueryFilter(
            dimensions=QueryComparisonExpression(
                name="ResourceId",
                operator="In",
                values_property=[resource_id],
            )
        )
        dataset = QueryDataset(
            granularity="Daily",
            aggregation={
                "totalCost": QueryAggregation(name="PreTaxCost", function="Sum")
            },
            grouping=[QueryGrouping(type="Dimension", name="ResourceType")],
            filter=query_filter,
        )

        if start_date is None and end_date is None:
            query_definition = QueryDefinition(
                type="ActualCost",
                timeframe="TheLastBillingMonth",
                dataset=dataset,
            )
        else:
            # 移植元Java版は`from`・`to`のどちらか一方のみの指定も許容するが、
            # Python SDKの型定義上`QueryTimePeriod`の両フィールドは必須のため、
            # 未指定側はそのままNoneを渡す（実行時のJSONシリアライズ自体は許容される）。
            time_period = QueryTimePeriod(
                from_property=start_date,  # type: ignore[arg-type]
                to=end_date,  # type: ignore[arg-type]
            )
            query_definition = QueryDefinition(
                type="ActualCost",
                timeframe="Custom",
                time_period=time_period,
                dataset=dataset,
            )

        result = client.query.usage(scope=scope, parameters=query_definition)

        if result is None or not result.rows:
            return []

        return AzureCostClient._map_rows(result.columns or [], result.rows)

    @staticmethod
    def _map_rows(
        columns: list[QueryColumn], rows: list[list[Any]]
    ) -> list[AzureCostQueryResult]:
        """Azure APIレスポンスの行を`AzureCostQueryResult`へマッピングする。

        Azure Cost Management APIの列順は、クエリ定義（aggregation・groupingの
        構成）によって変わりうる。固定インデックスで解釈すると、将来クエリ定義を
        変更した際やAPI仕様変更時に、列の意味を取り違えたまま誤った値を返す危険が
        あるため、レスポンスに含まれる`columns`（列メタデータ）から列名で位置を
        特定する。

        Args:
            columns: レスポンスの列メタデータ一覧（`QueryColumn`相当）。
            rows: レスポンスの行データ一覧。

        Returns:
            リソースタイプ・日付ごとのコスト集計結果一覧。列構成が想定と異なる
            行はログを出力して除外する。

        Raises:
            ValueError: 想定する列（`totalCost`, `UsageDate`, `ResourceType`,
                `Currency`）のいずれかがレスポンスに含まれない場合。
        """
        column_names = [column.name for column in columns]
        try:
            cost_index = column_names.index("totalCost")
            usage_date_index = column_names.index("UsageDate")
            resource_type_index = column_names.index("ResourceType")
            currency_index = column_names.index("Currency")
        except ValueError as e:
            raise ValueError(
                "Azure Cost Management APIのレスポンス列構成が想定と異なります: "
                f"{column_names}"
            ) from e

        results = []
        for row in rows:
            if len(row) != len(column_names):
                logger.warning(
                    "Azure Cost Management APIのレスポンス行の列数(%d)が"
                    "列メタデータの列数(%d)と一致しないため無視します: %r",
                    len(row),
                    len(column_names),
                    row,
                )
                continue
            results.append(
                AzureCostQueryResult(
                    resource_type=row[resource_type_index],
                    usage_date=datetime.strptime(
                        str(row[usage_date_index]), "%Y%m%d"
                    ).date(),
                    pre_tax_cost=float(row[cost_index]),
                    currency=row[currency_index],
                )
            )
        return results
