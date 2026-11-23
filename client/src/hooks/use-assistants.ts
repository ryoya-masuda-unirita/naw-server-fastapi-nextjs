import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import { parseAssistantsListResponse } from '@/lib/chat/assistants-api-mapper';
import type { Assistant } from '@/types/chat/assistant.type';

/** サイドバーが画面遷移のたびに無効化する query key（`['assistants']` が先頭。CLAUDE.md 参照） */
export const ASSISTANTS_QUERY_KEY = ['assistants'] as const;

/** 移植元 AssistantsService.assistantsQuery。チャットで選べるアシスタント一覧 */
export function useAssistants() {
  return useQuery({
    queryKey: ASSISTANTS_QUERY_KEY,
    queryFn: async (): Promise<Assistant[]> =>
      parseAssistantsListResponse(await apiClient.get<unknown>(API_PATHS.ASSISTANTS.LIST)),
  });
}
