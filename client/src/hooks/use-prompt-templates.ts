import { useQuery } from '@tanstack/react-query';
import type { ChatInputTemplate } from '@/hooks/use-chat-input-controls';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import { parsePromptTemplatesListResponse } from '@/lib/chat/prompt-templates-api-mapper';

/** サイドバーが画面遷移のたびに無効化する query key（`['prompt-templates']` が先頭。CLAUDE.md 参照） */
export const PROMPT_TEMPLATES_QUERY_KEY = ['prompt-templates'] as const;

/** 全件を 1 回で取るためのページサイズ（移植元 `params: { size: 0 }`） */
const ALL_TEMPLATES_SIZE = 0;

/** 移植元 PromptTemplatesService.promptTemplatesQuery。入力欄の「テンプレート」で選べる一覧 */
export function usePromptTemplates() {
  return useQuery({
    queryKey: PROMPT_TEMPLATES_QUERY_KEY,
    queryFn: async (): Promise<ChatInputTemplate[]> =>
      parsePromptTemplatesListResponse(
        await apiClient.get<unknown>(API_PATHS.PROMPT_TEMPLATES.LIST, {
          params: { size: ALL_TEMPLATES_SIZE },
        }),
      ),
  });
}
