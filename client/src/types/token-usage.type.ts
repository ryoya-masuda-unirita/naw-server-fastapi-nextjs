export interface TokenUsageSummaryResponse {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCredits: number;
  outputCredits: number;
  totalCredits: number;
}

/**
 * 利用履歴の利用者の種類。ACTIVE は通常のユーザー、SYSTEM は SYSTEM ユーザー、DELETED は削除されたユーザー
 * （利用者の ID が無い行を含む）。
 */
export type TokenUsageUserType = 'ACTIVE' | 'SYSTEM' | 'DELETED';

/** Admin token usage list item (`GET /admin/token-usages`). */
export interface TokenUsageListItem {
  id: string;
  userId: string | null;
  /** 利用者の名前。`userType` が ACTIVE のときだけ使う（SYSTEM・DELETED は文言を出す） */
  userName: string | null;
  userType: TokenUsageUserType;
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
