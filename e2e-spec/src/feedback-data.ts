import { randomUUID } from 'node:crypto';
import { quote, sql } from './sql-e.ts';
import { TENANT_ID } from './users.ts';

/**
 * フィードバック管理（カテゴリ 18）用のテストデータを SQL で入れる・消す。
 *
 * 回答にフィードバック（GOOD/BAD）を付けるには、チャットの回答（LLM）が要る。専用環境には LLM がないため、
 * ルーム・メッセージ・回答・フィードバックの行を直接入れる。画面に出る列は seed のデータと同じ形になる。
 */

/** 「田中 太郎」（seed のグループ管理者。ルームの持ち主として使う）。 */
const OWNER_USER_ID = '00000000-0000-4000-8000-000000000201';
/** 「社内ヘルプデスク」（seed-demo のアシスタント）。 */
export const HELP_DESK_ASSISTANT_ID = 'd0300000000400080000000000000001';
export const HELP_DESK_ASSISTANT_NAME = '社内ヘルプデスク';
/** 追加学習の学習先にできるフォルダ（seed-demo。画面の名前は「社内規程・FAQ」）。 */
export const FAQ_FOLDER_ID = 'd1000000000400080000000000000001';
export const FAQ_FOLDER_NAME = '社内規程・FAQ';
/** 学習先フォルダに紐づくデータが 1 件もないフォルダ（seed）。 */
export const OTHER_FOLDER_ID = 'd1000000000400080000000000000002';
export const OTHER_FOLDER_NAME = '営業ナレッジ（社内サーバー）';

/** 更新日時を未来にして、更新日時の降順（既定）で必ず 1 ページ目に出るようにする。 */
const FUTURE_OFFSET = "interval '1 hour'";

export type MessageRatingValue = 'GOOD' | 'BAD';
export type RoomRatingValue = 'EXCELLENT' | 'VERY_GOOD' | 'GOOD' | 'AVERAGE' | 'POOR';

export interface FeedbackFixture {
  feedbackId: string;
  roomId: string;
  messageId: string;
  /** 一覧で行を見つけるための、他と重ならない質問文。 */
  question: string;
  answer: string;
  roomName: string;
}

export interface FeedbackFixtureOptions {
  /** 質問文・ルーム名の接頭辞（行を見分ける用）。 */
  label: string;
  messageRating?: MessageRatingValue;
  roomRating?: RoomRatingValue;
  assistantId?: string;
  /** フィードバックの学習先フォルダ ID（なければ追加学習 OFF）。 */
  indexId?: string | null;
}

function newId(): string {
  return randomUUID().replaceAll('-', '');
}

/**
 * ルーム・メッセージ・回答・フィードバックを 1 組入れる。
 *
 * @param options 評価・アシスタント・学習先フォルダの指定
 * @returns 入れた行の ID と、一覧で見分けるための文言
 */
export function createFeedbackFixture(options: FeedbackFixtureOptions): FeedbackFixture {
  const feedbackId = newId();
  const roomId = newId();
  const messageId = newId();
  const contentId = newId();
  const assistantId = options.assistantId ?? HELP_DESK_ASSISTANT_ID;
  const question = `${options.label}の質問 ${feedbackId.slice(0, 8)}`;
  const answer = `${options.label}の回答 ${feedbackId.slice(0, 8)}`;
  const roomName = `${options.label}のルーム ${feedbackId.slice(0, 8)}`;
  const roomRating = options.roomRating ? quote(options.roomRating) : 'NULL';
  const indexId = options.indexId ? quote(options.indexId) : 'NULL';
  sql(`
    INSERT INTO rooms (id, tenant_id, name, default_assistant_id, user_id, rating, created_at, updated_at)
    VALUES (${quote(roomId)}, ${quote(TENANT_ID)}, ${quote(roomName)}, ${quote(assistantId)}, ${quote(OWNER_USER_ID)}, ${roomRating}, now() + ${FUTURE_OFFSET}, now() + ${FUTURE_OFFSET});
    INSERT INTO messages (id, tenant_id, room_id, assistant_id)
    VALUES (${quote(messageId)}, ${quote(TENANT_ID)}, ${quote(roomId)}, ${quote(assistantId)});
    INSERT INTO message_contents (id, tenant_id, message_id, status, question, answer, created_at, updated_at)
    VALUES (${quote(contentId)}, ${quote(TENANT_ID)}, ${quote(messageId)}, 'OK', ${quote(question)}, ${quote(answer)}, now() + ${FUTURE_OFFSET}, now() + ${FUTURE_OFFSET});
    INSERT INTO message_feedbacks (id, tenant_id, user_id, message_id, rating, index_id, created_at, updated_at)
    VALUES (${quote(feedbackId)}, ${quote(TENANT_ID)}, ${quote(OWNER_USER_ID)}, ${quote(messageId)}, ${quote(options.messageRating ?? 'GOOD')}, ${indexId}, now() + ${FUTURE_OFFSET}, now() + ${FUTURE_OFFSET});
  `);
  return { feedbackId, roomId, messageId, question, answer, roomName };
}

/**
 * ルームに紐づく追加学習のファイル行を入れる（満足度タブの「学習先フォルダ」はこの行から決まる）。
 *
 * @param roomId ルーム ID
 * @param indexId 学習先フォルダ ID
 */
export function createRoomLearningFile(roomId: string, indexId: string): void {
  sql(`
    INSERT INTO files (id, tenant_id, name, display_name, status, user_id, index_id, room_id)
    VALUES (${quote(newId())}, ${quote(TENANT_ID)}, 'spec-room.md', 'spec-room.md', 0, ${quote(OWNER_USER_ID)}, ${quote(indexId)}, ${quote(roomId)});
  `);
}

/**
 * {@link createFeedbackFixture} で入れた行と、それに紐づく追加学習のファイル行を消す。
 *
 * @param fixture 入れた行
 */
export function deleteFeedbackFixture(fixture: FeedbackFixture): void {
  sql(`
    DELETE FROM files WHERE room_id = ${quote(fixture.roomId)} OR feedback_id = ${quote(fixture.feedbackId)};
    DELETE FROM message_feedbacks WHERE id = ${quote(fixture.feedbackId)};
    DELETE FROM message_contents WHERE message_id = ${quote(fixture.messageId)};
    DELETE FROM messages WHERE id = ${quote(fixture.messageId)};
    DELETE FROM rooms WHERE id = ${quote(fixture.roomId)};
  `);
}
