import { useQuery } from '@tanstack/react-query';
import type { ChatInputTemplate } from '@/hooks/use-chat-input-controls';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import { parsePromptTemplatesListResponse } from '@/lib/chat/prompt-templates-api-mapper';
import { fetchAllPages, totalElementsOf } from '@/lib/utils/fetch-all-pages';

/** サイドバーが画面遷移のたびに無効化する query key（`['prompt-templates']` が先頭。CLAUDE.md 参照） */
export const PROMPT_TEMPLATES_QUERY_KEY = ['prompt-templates'] as const;

/**
 * 移植元 PromptTemplatesService.promptTemplatesQuery。入力欄の「テンプレート」で選べる一覧。
 * 全ページを順に取る。以前の `size: 0`（全件の意）は、backend が既定の 20 件に戻すため、21 件目以降が出なかった
 */
export function usePromptTemplates() {
  return useQuery({
    queryKey: PROMPT_TEMPLATES_QUERY_KEY,
    queryFn: (): Promise<ChatInputTemplate[]> =>
      fetchAllPages(async (page, size) => {
        const raw = await apiClient.get<unknown>(API_PATHS.PROMPT_TEMPLATES.LIST, {
          params: { page, size },
        });
        const items = parsePromptTemplatesListResponse(raw);
        return { items, total: totalElementsOf(raw, items.length) };
      }),
  });
}
