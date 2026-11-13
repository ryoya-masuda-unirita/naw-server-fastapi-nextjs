import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import { buildTokenUsageDateRange, type TokenUsagePeriodType } from '@/lib/utils/api-datetime';
import type { TokenUsageSummaryResponse } from '@/types/token-usage.type';

function useTokenUsageSummary(period: TokenUsagePeriodType) {
  // to は現在時刻のため、描画のたびに計算すると queryKey が変わって取り直し続ける。
  // 移植元と同じく、使い始めた時点の範囲で固定する
  const [{ from, to }] = useState(() => buildTokenUsageDateRange(period));
  return useQuery({
    queryKey: ['token-usages', period, from, to],
    queryFn: () =>
      apiClient.get<TokenUsageSummaryResponse>(API_PATHS.TOKEN_USAGES.GET, {
        params: { from, to },
      }),
  });
}

/** 本日分と今月分のトークン利用量（移植元 core/services/token-usage.service.ts） */
export function useTokenUsage() {
  return {
    tokenUsagesTodayQuery: useTokenUsageSummary('today'),
    tokenUsagesMonthQuery: useTokenUsageSummary('month'),
  };
}
