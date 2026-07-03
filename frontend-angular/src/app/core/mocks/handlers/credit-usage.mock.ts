import { API_PATHS } from '../../constants/api-paths.config';
import type { CreditUsageResponse } from '@app-types/credit-usage.type';
import type { MockRoute } from '../api-mock';

const MOCK_CREDIT_USAGE_ME: CreditUsageResponse = {
  totalCredits: 20,
  periodFrom: '2026-06-01T00:00:00Z',
  periodTo: '2026-06-30T23:59:59Z',
  nextBillingResetAt: '2026-07-01T00:00:00Z',
};

const MOCK_CREDIT_USAGE_WORKSPACE: CreditUsageResponse = {
  totalCredits: 5,
  creditLimit: 10_000_000,
  periodFrom: '2026-06-01T00:00:00Z',
  periodTo: '2026-06-30T23:59:59Z',
  nextBillingResetAt: '2026-07-01T00:00:00Z',
};

export const creditUsageMockRoutes: MockRoute[] = [
  {
    method: 'GET',
    match: API_PATHS.CREDIT_USAGE.ME,
    handler: () => [200, MOCK_CREDIT_USAGE_ME],
  },
  {
    method: 'GET',
    match: API_PATHS.CREDIT_USAGE.WORKSPACE,
    handler: () => [200, MOCK_CREDIT_USAGE_WORKSPACE],
  },
];
