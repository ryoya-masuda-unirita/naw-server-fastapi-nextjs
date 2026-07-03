import type {
  TokenUsageSummaryResponse,
  TokenUsagePeriod,
  TokenUsageHistory,
  TokenUsagesResponse,
} from '@app-types/token-usage.type';

// GET /api/token-usages?from=today&to=today — User daily usage
export const MOCK_TOKEN_USAGE_TODAY: TokenUsageSummaryResponse = {
  inputTokens: 8_000,
  outputTokens: 3_500,
  totalTokens: 11_500,
  inputCredits: 8_000,
  outputCredits: 3_500,
  totalCredits: 11_500,
};

// GET /api/token-usages?from=firstOfMonth&to=today — User monthly usage
// GET /api/admin/token-usages/summary — Admin token usage summary
export const MOCK_TOKEN_USAGE_SUMMARY: TokenUsageSummaryResponse = {
  inputTokens: 350_000,
  outputTokens: 150_000,
  totalTokens: 500_000,
  inputCredits: 350_000,
  outputCredits: 150_000,
  totalCredits: 500_000,
};

// GET /api/token-usages — Check credit usage (triggered on Credit Usage modal display)
export const MOCK_TOKEN_USAGES: TokenUsagesResponse = {
  current: {
    period: '2026-04',
    used: 125430,
    limit: 500000,
    remaining: 374570,
    unit: 'tokens',
  },
  history: [
    {
      date: '2026-04-15',
      tokens: 3210,
      roomId: 'room-001',
      roomTitle: '社内規定について',
      model: 'gpt-4o',
    },
    {
      date: '2026-04-14',
      tokens: 5840,
      roomId: 'room-002',
      roomTitle: '2026年Q1売上レポート分析',
      model: 'gpt-4o',
    },
    {
      date: '2026-04-13',
      tokens: 1200,
      roomId: 'room-003',
      roomTitle: 'プロジェクト進捗確認',
      model: 'gpt-4o-mini',
    },
    {
      date: '2026-04-12',
      tokens: 980,
      roomId: 'room-004',
      roomTitle: '経費精算の手順',
      model: 'gpt-4o-mini',
    },
    {
      date: '2026-04-11',
      tokens: 4560,
      roomId: 'room-005',
      roomTitle: 'マーケティング戦略',
      model: 'gpt-4o',
    },
    {
      date: '2026-04-10',
      tokens: 2100,
      roomId: 'room-006',
      roomTitle: '顧客データ集計',
      model: 'gpt-4o',
    },
    {
      date: '2026-04-09',
      tokens: 750,
      roomId: 'room-007',
      roomTitle: 'セキュリティポリシー確認',
      model: 'gpt-4o-mini',
    },
  ],
};

export type { TokenUsageSummaryResponse, TokenUsagePeriod, TokenUsageHistory, TokenUsagesResponse };
