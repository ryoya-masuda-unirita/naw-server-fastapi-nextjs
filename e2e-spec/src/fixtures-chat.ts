import type { APIRequestContext, Page } from '@playwright/test';
import {
  createRoom,
  deleteRoom,
  DEFAULT_ASSISTANT_ID,
  sendMessage,
  type CreatedRoom,
  type SendOptions,
  type SentMessage,
} from './api-chat.ts';
import { loginApi } from './api.ts';
import { test as base } from './fixtures.ts';
import { USERS, type RoleName } from './users.ts';

/**
 * チャット系カテゴリ（07・08・11）用の fixture。`./fixtures.ts` の fixture に加えて、ルームとメッセージの準備を提供する。
 *
 *   chatApi(role)    その権限のユーザーでログイン済みの API（ルームの所有者。画面でログインするユーザーと同じにする）
 *   makeRoom(opts)   ルームを API で作り、`messages` の質問を順に送って回答まで済ませる（終了時に自動で削除）
 *   trackRoom(id)    画面の操作で作られたルームを、終了時の削除の対象にする
 */

export { expect } from './fixtures.ts';

export interface MakeRoomOptions {
  /** ルーム名。省略すると他と重ならない名前になる。 */
  name?: string;
  assistantId?: string;
  /** ルームの所有者（画面でログインするユーザーと同じにする）。既定は一般ユーザー。 */
  as?: RoleName;
  /** 順に送る質問。各質問は直前の質問への続きとして送る。 */
  messages?: string[];
  sendOptions?: SendOptions;
}

export interface MadeRoom extends CreatedRoom {
  sent: SentMessage[];
}

export interface ChatFixtures {
  chatApi: (role?: RoleName) => Promise<APIRequestContext>;
  makeRoom: (options?: MakeRoomOptions) => Promise<MadeRoom>;
  trackRoom: (roomId: string, role?: RoleName) => void;
}

/** 画面の URL（/chat/{roomId}）からルーム ID を取る。ルームの画面でなければ null。 */
export function roomIdFromUrl(page: Page): string | null {
  const match = /\/chat\/([0-9a-f]{32})(?:[/?#]|$)/.exec(new URL(page.url()).pathname);
  return match ? match[1] : null;
}

export const test = base.extend<ChatFixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright は fixture の第 1 引数を分割代入で受ける必要がある
  chatApi: async ({}, use) => {
    const apis = new Map<RoleName, APIRequestContext>();
    await use(async (role = 'user') => {
      const existing = apis.get(role);
      if (existing) return existing;
      const api = await loginApi(USERS[role]);
      apis.set(role, api);
      return api;
    });
    for (const api of apis.values()) await api.dispose();
  },

  trackRoom: async ({ chatApi }, use) => {
    const tracked: { id: string; role: RoleName }[] = [];
    await use((roomId, role = 'user') => {
      tracked.push({ id: roomId, role });
    });
    for (const room of tracked) await deleteRoom(await chatApi(room.role), room.id);
  },

  makeRoom: async ({ chatApi, trackRoom, uniqueId }, use) => {
    await use(async (options = {}) => {
      const role = options.as ?? 'user';
      const api = await chatApi(role);
      const room = await createRoom(api, options.name ?? uniqueId('room'), options.assistantId ?? DEFAULT_ASSISTANT_ID);
      trackRoom(room.id, role);
      const sent: SentMessage[] = [];
      let parentMessageId: string | null = null;
      for (const text of options.messages ?? []) {
        const message = await sendMessage(api, room.id, text, {
          assistantId: room.assistantId,
          ...options.sendOptions,
          parentMessageId,
        });
        sent.push(message);
        parentMessageId = message.messageId;
      }
      return { ...room, sent };
    });
  },
});
