import { getSiblingRecords } from '@/lib/chat/message-thread';
import type { MessageListApiItem } from '@/types/chat/message-api.type';

/**
 * ルームのメッセージのうち、チャット画面に既定で表示される 1 本の流れ（根から親子をたどり、各段で最新の版）を、
 * やり取りの順に返す。編集・再生成で捨てた版を学習させないため、チャット画面（buildVisibleThread）と同じ選び方にする
 * （移植元 `room-thread.ts`）。
 */
export function selectVisibleThread(records: MessageListApiItem[]): MessageListApiItem[] {
  const thread: MessageListApiItem[] = [];
  let parentId: string | null = null;
  // 親子が循環したデータでも止まるよう、たどる段数をメッセージの数までにする
  while (thread.length < records.length) {
    const siblings = getSiblingRecords(records, parentId);
    const latest = siblings[siblings.length - 1];
    if (!latest) break;
    thread.push(latest);
    parentId = latest.id;
  }
  return thread;
}
