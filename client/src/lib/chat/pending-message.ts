/**
 * 新規チャット画面で最初のメッセージを送るとき、ルームを作って移動した先の画面に渡す送信内容。
 * 移植元は `router.navigate(..., { state: { pendingMessage } })` で渡し、移動先が `history.state` から読んで消す。
 * React では履歴の state ではなくモジュール内に置く（ルームの ID を鍵にするので、別のルームへ漏れず、
 * StrictMode で effect が 2 回走っても 1 回しか取り出せない）。再読み込みで消えるのは移植元と同じ。
 */
import type { SendMessageOptions } from '@/store/messages-store';

export interface PendingMessage {
  content: string;
  files: File[];
  options: SendMessageOptions;
}

const pendingByRoomId = new Map<string, PendingMessage>();

/** ルームへ移動する直前に、そのルームで送る内容を預ける */
export function setPendingMessage(roomId: string, message: PendingMessage): void {
  pendingByRoomId.set(roomId, message);
}

/** 預けた内容を取り出す（取り出すと消える）。なければ null */
export function takePendingMessage(roomId: string): PendingMessage | null {
  const message = pendingByRoomId.get(roomId) ?? null;
  pendingByRoomId.delete(roomId);
  return message;
}
