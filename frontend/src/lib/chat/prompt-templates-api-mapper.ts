import type { ChatInputTemplate } from '@/hooks/use-chat-input-controls';

/** GET /api/prompt-templates の 1 件（移植元 prompt-templates-api.mapper.ts） */
export interface PromptTemplateListApiItem {
  id: string;
  name: string;
  description?: string | null;
  systemPrompt?: string | null;
}

/** API の 1 件を、入力欄で選ぶテンプレートにする。システムプロンプトがあるときだけ持たせる */
export function mapPromptTemplateListItem(item: PromptTemplateListApiItem): ChatInputTemplate {
  return {
    value: item.id,
    label: item.name,
    desc: item.description ?? '',
    ...(item.systemPrompt ? { systemPrompt: item.systemPrompt } : {}),
  };
}

/** `{ content }` のページ形式でも、配列そのものでも一覧にする */
export function parsePromptTemplatesListResponse(response: unknown): ChatInputTemplate[] {
  if (Array.isArray(response)) {
    return response.map((item) => mapPromptTemplateListItem(item as PromptTemplateListApiItem));
  }
  if (response && typeof response === 'object') {
    const record = response as Record<string, unknown>;
    if (Array.isArray(record['content'])) {
      return record['content'].map((item) =>
        mapPromptTemplateListItem(item as PromptTemplateListApiItem),
      );
    }
  }
  return [];
}
