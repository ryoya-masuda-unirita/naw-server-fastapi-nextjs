import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import type { CreditUsageResponse } from '@/types/credit-usage.type';

// 0 のあいだは取得しない。移植元と同じく、利用量ダイアログを開いたとき（fetchUsage）に初めて取りに行く
const NOT_REQUESTED = 0;

/**
 * 自分とワークスペースのクレジット利用量（移植元 core/services/credit-usage.service.ts）。
 * fetchUsage を呼ぶたびに両方を並行して取り直す。
 */
export function useCreditUsage() {
  const [requestId, setRequestId] = useState(NOT_REQUESTED);

  const meQuery = useQuery({
    queryKey: ['credit-usage', 'me', requestId],
    enabled: requestId > NOT_REQUESTED,
    queryFn: () => apiClient.get<CreditUsageResponse>(API_PATHS.CREDIT_USAGE.ME),
  });

  const workspaceQuery = useQuery({
    queryKey: ['credit-usage', 'workspace', requestId],
    enabled: requestId > NOT_REQUESTED,
    queryFn: () => apiClient.get<CreditUsageResponse>(API_PATHS.CREDIT_USAGE.WORKSPACE),
  });

  const fetchUsage = useCallback(() => setRequestId((id) => id + 1), []);

  return { meQuery, workspaceQuery, fetchUsage };
}
