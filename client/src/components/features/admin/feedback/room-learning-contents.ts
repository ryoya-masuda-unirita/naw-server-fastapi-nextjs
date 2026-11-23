import { apiClient } from '@/lib/api-client';
import { fetchMessageContents } from '@/lib/chat/message-contents-api';
import { API_PATHS } from '@/lib/constants/api-paths';
import type { MessageContentApiItem, MessagesListApiResponse } from '@/types/chat/message-api.type';
import { selectVisibleThread } from './room-thread';

/**
 * 追加学習に送れない理由。
 * - `empty`: ルームにやり取りが無い
 * - `missing`: 本文を取れないやり取りがある（失敗・件数の不一致・`status=ERROR`）
 * - `fetch_failed`: 通信の失敗だけが理由（共通のエラートーストが出るので、画面では重ねて出さない）
 */
export type RoomLearningErrorReason = 'empty' | 'missing' | 'fetch_failed';

export class RoomLearningError extends Error {
  readonly reason: RoomLearningErrorReason;

  constructor(reason: RoomLearningErrorReason, message: string) {
    super(message);
    this.name = 'RoomLearningError';
    this.reason = reason;
  }
}

/**
 * チャット画面に表示されるルームのやり取りの全文を取る（移植元 `fetchRoomContents`）。
 * ローカルのアシスタントのメッセージはローカル用サーバーにあるため、チャット画面と同じ振り分け
 * （`fetchMessageContents`）で取る。送れない場合は `RoomLearningError` を投げる。
 */
export async function fetchRoomContents(roomId: string): Promise<MessageContentApiItem[]> {
  const list = await apiClient.get<MessagesListApiResponse>(API_PATHS.MESSAGES.LIST, {
    params: { roomId },
  });
  const thread = selectVisibleThread(list.messages ?? []);
  // 評価したあとにやり取りを全件削除したルームを送ると、質問も回答も無いルームの情報だけが学習データになる
  if (thread.length === 0) {
    throw new RoomLearningError('empty', 'ルームにやり取りが無いため、追加学習を送りません');
  }
  const { contents, failures } = await fetchMessageContents({
    ...list,
    messages: thread,
  });
  // 欠けたやり取りを学習させると、利用者が評価した内容と違うものが学習データになるため送らない。
  // 削除されたローカルのアシスタントのメッセージは本文が返らず、失敗にも数えられないので件数でも確かめる。
  // 回答の生成に失敗したやり取り（status が ERROR）は、エラーの文が回答として入ってくるので同じく送らない
  const hasFailedContent = contents.some((content) => content.status === 'ERROR');
  if (failures.length > 0 || contents.length !== thread.length || hasFailedContent) {
    const onlyFetchFailed =
      failures.length > 0 && failures.every((failure) => failure.reason === 'fetch_failed');
    throw new RoomLearningError(
      onlyFetchFailed ? 'fetch_failed' : 'missing',
      'ルームのやり取りの一部を取れなかったため、追加学習を送りません',
    );
  }
  return contents;
}
