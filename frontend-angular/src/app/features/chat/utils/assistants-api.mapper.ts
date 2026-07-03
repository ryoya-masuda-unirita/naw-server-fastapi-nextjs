import { Assistant } from '@app/core/constants/mock-data/assistants.mock';

/** GET /assistants — item shape from the live API (array or wrapped list). */
export type AssistantListApiItem = {
  id: string;
  name: string;
  description?: string | null;
  category?: { name: string } | string | null;
  categories?: { name: string }[];
  endpoints?: { model?: string; type?: string }[];
  isDefault?: boolean;
};

export function mapAssistantListItem(item: AssistantListApiItem): Assistant {
  const chatEndpoint = item.endpoints?.find((e) => e.type?.includes('CHAT')) ?? item.endpoints?.[0];
  const category =
    (typeof item.category === 'object' && item.category?.name) ||
    (typeof item.category === 'string' ? item.category : '') ||
    item.categories?.[0]?.name ||
    '';

  return {
    id: item.id,
    name: item.name,
    description: item.description ?? '',
    category,
    model: chatEndpoint?.model ?? '',
    ...(item.isDefault !== undefined ? { isDefault: item.isDefault } : {}),
  };
}

/** Supports mock `{ data }`, paginated `{ content }`, or a raw array from the API. */
export function parseAssistantsListResponse(response: unknown): Assistant[] {
  if (Array.isArray(response)) {
    return response.map((item) => mapAssistantListItem(item as AssistantListApiItem));
  }
  if (response && typeof response === 'object') {
    const record = response as Record<string, unknown>;
    if (Array.isArray(record['data'])) {
      return record['data'].map((item) => mapAssistantListItem(item as AssistantListApiItem));
    }
    if (Array.isArray(record['content'])) {
      return record['content'].map((item) => mapAssistantListItem(item as AssistantListApiItem));
    }
  }
  return [];
}
