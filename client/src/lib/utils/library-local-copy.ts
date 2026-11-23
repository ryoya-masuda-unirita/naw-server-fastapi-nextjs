import { apiClient } from '@/lib/api-client';
import type { MessageListAssistant } from '@/types/chat/message-api.type';

// 移植元 chat/services/library-content-api.service.ts の deleteLocalCopy と、
// chat/utils/message-content-endpoint.resolver.ts のうち削除に要る部分

const LOCAL_AUTH_HEADER = 'X-Server-Auth-Key';
const SECURE_ASSISTANT_TYPE = 'SECURE';
const LOCAL_SERVER_ENDPOINT_TYPE = 'LOCAL_SERVER';

interface LocalLibraryTarget {
  url: string;
  apiKey: string;
}

/**
 * ローカルサーバーに本文を持つライブラリの削除先を求める。
 * NAW 側で本文を持つ（SECURE 以外）・エンドポイントの情報が足りない場合は null。
 */
export function resolveLocalLibraryTarget(
  libraryId: string,
  assistant: MessageListAssistant | null | undefined,
): LocalLibraryTarget | null {
  if (!assistant || assistant.type !== SECURE_ASSISTANT_TYPE) return null;

  const endpoint =
    assistant.endpoints.find((item) => item.type === LOCAL_SERVER_ENDPOINT_TYPE) ??
    assistant.endpoints[0];
  const destination = endpoint?.destination?.trim();
  const apiKey = endpoint?.apiKey?.trim();
  if (!destination || !apiKey) return null;

  const base = destination.endsWith('/') ? destination : `${destination}/`;
  return { url: new URL(`api/libraries/${libraryId}`, base).href, apiKey };
}

/**
 * NAW の削除に成功したあと、ローカルサーバーの本文を消す。失敗しても投げない。
 * 移植元の設計どおり、ローカル側の削除失敗は NAW の削除の成否に含めない（本文が孤立するのを許容する）。
 */
export async function deleteLocalLibraryCopy(
  libraryId: string,
  assistant: MessageListAssistant | null | undefined,
): Promise<void> {
  const target = resolveLocalLibraryTarget(libraryId, assistant);
  if (!target) return;
  try {
    await apiClient.delete<void>(target.url, {
      headers: { [LOCAL_AUTH_HEADER]: target.apiKey },
      skipGlobalErrorToast: true,
    });
  } catch {
    // 上の docstring のとおり、失敗は意図的に無視する
  }
}
