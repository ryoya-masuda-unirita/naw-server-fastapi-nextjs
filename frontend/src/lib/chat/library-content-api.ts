import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import {
  findSecureLocalEndpoint,
  resolveAssistantEndpoint,
} from '@/lib/chat/message-content-endpoint';
import type { MessageListAssistant } from '@/types/chat/message-api.type';

// 移植元 chat/services/library-content-api.service.ts の fetch・fetchBody

const LOCAL_AUTH_HEADER = 'X-Server-Auth-Key';

/** GET /api/libraries/{id} のうち、タイトルと本文の取得先を決めるのに使う値 */
interface LibraryDetailResponse {
  id: string;
  title: string | null;
  assistant: MessageListAssistant | null;
}

/** GET /api/libraries/{id}/content */
interface LibraryBodyResponse {
  data: string;
}

export interface LibraryContent {
  title: string;
  data: string;
}

function buildLocalLibraryContentUrl(destination: string, libraryId: string): string {
  const base = destination.endsWith('/') ? destination : `${destination}/`;
  return new URL(`api/libraries/${libraryId}/content`, base).href;
}

async function fetchNawBody(libraryId: string): Promise<string> {
  const response = await apiClient.get<LibraryBodyResponse>(API_PATHS.VIEWER.CONTENT(libraryId));
  return response.data ?? '';
}

/**
 * ライブラリの本文を取得する。SECURE アシスタントのライブラリはローカルサーバーから、それ以外は NAW から取る。
 *
 * Raises
 * ------
 * Error
 *     SECURE アシスタントのエンドポイントの情報が足りないとき。
 */
export async function fetchLibraryBody(
  libraryId: string,
  assistant: MessageListAssistant | null | undefined,
): Promise<string> {
  if (!assistant) return fetchNawBody(libraryId);

  const resolved = resolveAssistantEndpoint(assistant);
  if (resolved.kind === 'naw') return fetchNawBody(libraryId);
  if (resolved.kind === 'invalid') {
    throw new Error(`Invalid library content endpoint: ${resolved.reason}`);
  }

  const endpoint = findSecureLocalEndpoint(assistant);
  if (!endpoint?.destination) {
    throw new Error('Invalid library content endpoint: missing_destination');
  }
  const response = await apiClient.get<LibraryBodyResponse>(
    buildLocalLibraryContentUrl(endpoint.destination, libraryId),
    { headers: { [LOCAL_AUTH_HEADER]: resolved.apiKey }, skipGlobalErrorToast: true },
  );
  return response.data ?? '';
}

/** ライブラリのタイトルと本文を取得する（移植元 `LibraryContentApiService.fetch`） */
export async function fetchLibraryContent(libraryId: string): Promise<LibraryContent> {
  const detail = await apiClient.get<LibraryDetailResponse>(API_PATHS.LIBRARY.DETAIL(libraryId));
  const data = await fetchLibraryBody(libraryId, detail.assistant);
  return { title: detail.title ?? '', data };
}
