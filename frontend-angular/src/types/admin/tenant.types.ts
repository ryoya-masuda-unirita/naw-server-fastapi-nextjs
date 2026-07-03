import type { PlanResponse, SubscriptionResponse } from '@app-types/common';

export type { PlanResponse, SubscriptionResponse };

export interface TenantResourceResponse {
  id: string;
  type: string;
  description: string;
}

export interface TenantInfo {
  deleted: boolean;
  tenantId: string;
  tenantName: string;
  isDeleted: boolean;
  resources: TenantResourceResponse[];
  subscription: SubscriptionResponse;
}

export interface UsageHistory {
  id: string;
  datetime: string;
  user: string;
  amount: string;
}

export interface UsageHistoryResponse {
  data: UsageHistory[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiConfig {
  id: string;
  displayName: string;
  functionName: string;
  url: string;
  apiKey: string;
}

export interface Endpoint {
  id: string;
  tenantId: string;
  endpointName: string;
  type: string;
  endpoint: string;
  apiKey: string;
}

export interface EndpointListResponse {
  data: Endpoint[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EndpointCreatePayload {
  endpointName: string;
  type: string;
  endpoint: string;
  apiKey: string;
}
