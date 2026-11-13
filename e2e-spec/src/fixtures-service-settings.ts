import type { APIRequestContext } from '@playwright/test';
import { loginApi } from './api.ts';
import {
  createRoom,
  deleteAssistantsByKeyword,
  deleteCategoriesByKeyword,
  deleteFoldersByKeyword,
  deleteRoom,
  type CreatedRoom,
} from './api-service-settings.ts';
import { test as base } from './fixtures.ts';
import { AssistantsPage } from './pages/assistants.page.ts';
import { ChatHistoryPage } from './pages/chat-history.page.ts';
import { TrainingDataPage } from './pages/training-data.page.ts';
import { USERS } from './users.ts';

/**
 * 15_アシスタント・16_チャット履歴・17_学習データ用の fixture。共通の fixture（src/fixtures.ts）に足す。
 *
 *   assistantsPage  アシスタント管理画面の Page Object
 *   chatHistoryPage チャット履歴画面の Page Object
 *   trainingDataPage 学習データ画面の Page Object
 *   prefix          このテスト専用の名前の接頭辞（`d-xxxxxxxx`）。画面から作ったアシスタント・カテゴリ・学習先フォルダは、
 *                   名前にこれを含めておけば、終了時に自動で削除される（画面での削除が失敗しても残らない）
 *   makeRoom        チャットルームを API で作る（`owner` はルームの持ち主。管理者か一般ユーザー）。終了時に自動で削除される
 */

export { expect } from './fixtures.ts';

export type RoomOwner = 'tenantAdmin' | 'user';

export interface ServiceSettingsFixtures {
  assistantsPage: AssistantsPage;
  chatHistoryPage: ChatHistoryPage;
  trainingDataPage: TrainingDataPage;
  prefix: string;
  makeRoom: (owner: RoomOwner, name: string) => Promise<CreatedRoom>;
}

export const test = base.extend<ServiceSettingsFixtures>({
  assistantsPage: async ({ page }, use) => {
    await use(new AssistantsPage(page));
  },

  chatHistoryPage: async ({ page }, use) => {
    await use(new ChatHistoryPage(page));
  },

  trainingDataPage: async ({ page }, use) => {
    await use(new TrainingDataPage(page));
  },

  prefix: async ({ adminApi, uniqueId }, use) => {
    const prefix = uniqueId('d');
    await use(prefix);
    // 後片付け。アシスタントを先に消してから、カテゴリ・フォルダ（アシスタントが使っているものは消せないため）
    await deleteAssistantsByKeyword(adminApi, prefix);
    await deleteCategoriesByKeyword(adminApi, prefix);
    await deleteFoldersByKeyword(adminApi, prefix);
  },

  makeRoom: async ({ adminApi }, use) => {
    const owners: Record<RoomOwner, APIRequestContext | null> = { tenantAdmin: adminApi, user: null };
    const created: { owner: RoomOwner; room: CreatedRoom }[] = [];
    await use(async (owner, name) => {
      owners[owner] ??= await loginApi(USERS[owner]);
      const room = await createRoom(owners[owner], name);
      created.push({ owner, room });
      return room;
    });
    for (const { owner, room } of created) {
      const api = owners[owner];
      if (api) await deleteRoom(api, room);
    }
    await owners.user?.dispose();
  },
});
