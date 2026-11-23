export interface TokenUsageSummaryResponse {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCredits: number;
  outputCredits: number;
  totalCredits: number;
}

/** Admin token usage list item (`GET /admin/token-usages`). */
export interface TokenUsageListItem {
  id: string;
  userId: string | null;
  messageId: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  embeddingTokens: number;
  totalTokens: number;
  inputCredits: number;
  outputCredits: number;
  embeddingCredits: number;
  totalCredits: number;
  createdAt: string;
}

export interface TokenUsageListResponse {
  contents: TokenUsageListItem[];
  totalCount: number;
  hasNext: boolean;
}

export interface TokenUsagePeriod {
  period: string;
  used: number;
  limit: number;
  remaining: number;
  unit: 'tokens';
}

export interface TokenUsageHistory {
  date: string;
  tokens: number;
  roomId: string;
  roomTitle: string;
  model: string;
}

export interface TokenUsagesResponse {
  current: TokenUsagePeriod;
  history: TokenUsageHistory[];
}
