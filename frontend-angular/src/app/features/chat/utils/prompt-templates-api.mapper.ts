import type { Template } from '@features/chat/components/template-selector/template-selector.component';

/** GET /prompt-templates — item shape from the live API. */
export type PromptTemplateListApiItem = {
  id: string;
  name: string;
  description?: string | null;
  systemPrompt?: string | null;
};

export function mapPromptTemplateListItem(item: PromptTemplateListApiItem): Template {
  return {
    value: item.id,
    label: item.name,
    desc: item.description ?? '',
    ...(item.systemPrompt ? { systemPrompt: item.systemPrompt } : {}),
  };
}

/** Supports paginated `{ content }` or a raw array from the API. */
export function parsePromptTemplatesListResponse(response: unknown): Template[] {
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
