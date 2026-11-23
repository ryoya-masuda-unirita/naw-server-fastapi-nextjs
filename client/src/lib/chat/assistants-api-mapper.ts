import type { Assistant } from '@/types/chat/assistant.type';

/** GET /api/assistants の 1 件（移植元 assistants-api.mapper.ts。API の形のうちチャットで使う項目だけ） */
interface AssistantListItem {
  id: string;
  name: string;
  description?: string | null;
  category?: { name: string } | string | null;
  categories?: { name: string }[];
  endpoints?: { model?: string; type?: string }[];
  isDefault?: boolean;
}

/** アシスタント 1 件を画面用にする。model は LOCAL_SERVER → CHAT 系 → 先頭のエンドポイントの順に採用する */
export function mapAssistantListItem(item: AssistantListItem): Assistant {
  const localEndpoint = item.endpoints?.find((e) => e.type === 'LOCAL_SERVER');
  const chatEndpoint = item.endpoints?.find((e) => e.type?.includes('CHAT'));
  const endpoint = localEndpoint ?? chatEndpoint ?? item.endpoints?.[0];
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
    model: endpoint?.model ?? '',
    ...(item.isDefault !== undefined ? { isDefault: item.isDefault } : {}),
  };
}

/** 配列・`{ data }`・`{ content }` のどれで返ってきても一覧にする */
export function parseAssistantsListResponse(response: unknown): Assistant[] {
  if (Array.isArray(response)) {
    return response.map((item) => mapAssistantListItem(item as AssistantListItem));
  }
  if (response && typeof response === 'object') {
    const record = response as Record<string, unknown>;
    if (Array.isArray(record['data'])) {
      return record['data'].map((item) => mapAssistantListItem(item as AssistantListItem));
    }
    if (Array.isArray(record['content'])) {
      return record['content'].map((item) => mapAssistantListItem(item as AssistantListItem));
    }
  }
  return [];
}
