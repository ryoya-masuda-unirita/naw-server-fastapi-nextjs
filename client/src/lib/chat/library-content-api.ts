import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import {
  buildLocalLibraryContentUrl,
  findSecureLocalEndpoint,
  resolveAssistantEndpoint,
} from '@/lib/chat/message-content-endpoint';
import type { MessageListAssistant } from '@/types/chat/message-api.type';

// 移植元 chat/services/library-content-api.service.ts の fetch / fetchBody
// （ローカルサーバーの削除 deleteLocalCopy は #136 の lib/utils/library-local-copy.ts にある）

const LOCAL_AUTH_HEADER = 'X-Server-Auth-Key';

interface LibraryDetailResponse {
  id: string;
  title: string | null;
  assistant: MessageListAssistant | null;
}

interface LibraryBodyResponse {
  data: string;
}

/** NAW サーバーからライブラリの本文を取得する */
async function fetchNawBody(libraryId: string): Promise<string> {
  const response = await apiClient.get<LibraryBodyResponse>(API_PATHS.VIEWER.CONTENT(libraryId));
  return response.data ?? '';
}

/**
 * ライブラリの本文を取得する。SECURE アシスタントのライブラリは、テナントの LOCAL_SERVER エンドポイント
 * （server-local）から取得する。それ以外は NAW サーバーから取得する。
 *
 * Parameters
 * ----------
 * libraryId : string
 *     ライブラリ ID。
 * assistant : MessageListAssistant | null | undefined
 *     ライブラリを作ったアシスタント。null・undefined なら NAW サーバーから取得する。
 *
 * Returns
 * -------
 * Promise<string>
 *     Markdown の本文。
 *
 * Raises
 * ------
 * Error
 *     SECURE のエンドポイントが不正なとき（`Invalid library content endpoint: {理由}`）。
 *     ローカルサーバーへの通信エラーは `ApiError`（共通エラートーストは出さない）。
 */
export async function fetchLibraryBody(
  libraryId: string,
  assistant: MessageListAssistant | null | undefined,
): Promise<string> {
  if (!assistant) {
    return fetchNawBody(libraryId);
  }
  const resolved = resolveAssistantEndpoint(assistant);
  if (resolved.kind === 'naw') {
    return fetchNawBody(libraryId);
  }
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

/**
 * ライブラリの詳細（タイトル・アシスタント）を NAW サーバーから取り、本文を取得して返す。
 * ビューワー（#288）がライブラリを開くときに使う（移植元 `ViewerService.loadContent` が呼ぶ `fetch`）。
 *
 * Parameters
 * ----------
 * libraryId : string
 *     ライブラリ ID。
 *
 * Returns
 * -------
 * Promise<{ title: string; data: string }>
 *     タイトル（null は空文字）と Markdown の本文。
 */
export async function fetchLibraryContent(
  libraryId: string,
): Promise<{ title: string; data: string }> {
  const detail = await apiClient.get<LibraryDetailResponse>(API_PATHS.LIBRARY.DETAIL(libraryId));
  const data = await fetchLibraryBody(libraryId, detail.assistant);
  return { title: detail.title ?? '', data };
}
