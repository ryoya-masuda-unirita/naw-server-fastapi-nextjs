import { randomBytes } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { ApiError, loginApi, type CreatedUser } from './api.ts';
import { psql, sqlLiteral } from './psql.ts';

/**
 * チャットルームの準備用ヘルパー（10_チャットルーム用）。
 * ルームは API で作る。過去のメッセージは、LLM を呼ばずに用意するため SQL で入れる。
 * ルームは作ったユーザーの削除（fixtures の createUser の後片付け。rooms.user_id は ON DELETE CASCADE）でまとめて消えるため、個別の後片付けはしない。
 */

/** seed の汎用アシスタント（seed-demo.sql）。 */
export const GENERAL_ASSISTANT_ID = '10000000000040008000000000000001';
const ID_BYTES = 16;

export interface CreatedRoom {
  id: string;
  name: string;
}

/**
 * ユーザーとして API ログインした APIRequestContext を作る。使い終わったら dispose する。
 *
 * @param user ログインするユーザー
 * @returns ログイン済みの APIRequestContext
 */
export async function loginAsUser(user: Pick<CreatedUser, 'tenantId' | 'loginId' | 'password'>): Promise<APIRequestContext> {
  return loginApi(user);
}

/**
 * ルームを API で作る（POST /api/rooms）。
 *
 * @param api ルームの持ち主としてログイン済みの APIRequestContext
 * @param name ルーム名
 * @returns 作ったルーム
 * @throws ApiError 作成に失敗したとき
 */
export async function createRoom(api: APIRequestContext, name: string): Promise<CreatedRoom> {
  const res = await api.post('/api/rooms', { data: { name, assistantId: GENERAL_ASSISTANT_ID } });
  if (!res.ok()) throw new ApiError(`ルーム ${name} の作成に失敗しました: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as { id: string };
  return { id: body.id, name };
}

/**
 * ルームの一覧を API で取る（画面の外から、固定・名前・削除の結果を確かめる）。
 *
 * @param api ルームの持ち主としてログイン済みの APIRequestContext
 * @returns ルームの一覧（API の返す順）
 * @throws ApiError 取得に失敗したとき
 */
export async function listRooms(api: APIRequestContext): Promise<{ id: string; name: string | null; pinned: boolean }[]> {
  const res = await api.get('/api/rooms?page=0&size=100');
  if (!res.ok()) throw new ApiError(`ルームの一覧の取得に失敗しました: ${res.status()}`);
  const body = (await res.json()) as { content?: { id: string; name: string | null; pinned: boolean }[] };
  return body.content ?? [];
}

/**
 * ルームに過去のやり取り（質問と回答 1 組）を SQL で入れる。
 *
 * @param tenantId テナント ID
 * @param roomId ルーム ID
 * @param question 質問
 * @param answer 回答
 */
export function addConversation(tenantId: string, roomId: string, question: string, answer: string): void {
  const messageId = randomBytes(ID_BYTES).toString('hex');
  const contentId = randomBytes(ID_BYTES).toString('hex');
  psql(`
    INSERT INTO messages (id, tenant_id, room_id, assistant_id)
    VALUES (${sqlLiteral(messageId)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(roomId)}, ${sqlLiteral(GENERAL_ASSISTANT_ID)});
    INSERT INTO message_contents (id, tenant_id, message_id, status, question, answer)
    VALUES (${sqlLiteral(contentId)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(messageId)}, 'OK', ${sqlLiteral(question)}, ${sqlLiteral(answer)});
  `);
}
