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
import { createQuotaTenant, dropQuotaTenant, type QuotaScenario, type QuotaTenant } from './db-quota.ts';
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
 *   makeQuotaTenant クレジット上限と今月の利用量を決めた専用のテナントを DB に作る。終了時に自動で削除される
 *
 * 後片付けは、1 つが失敗しても残りを続け、最後にまとめて報告する（テストの失敗の原因を覆い隠さず、残骸も増やさない）。
 */

export { expect } from './fixtures.ts';

export type RoomOwner = 'tenantAdmin' | 'user';

export interface ServiceSettingsFixtures {
  assistantsPage: AssistantsPage;
  chatHistoryPage: ChatHistoryPage;
  trainingDataPage: TrainingDataPage;
  prefix: string;
  makeRoom: (owner: RoomOwner, name: string) => Promise<CreatedRoom>;
  makeQuotaTenant: (scenario: QuotaScenario) => QuotaTenant;
}

/**
 * 後片付けの処理を順に実行する。1 つが失敗しても残りを実行し、失敗があれば最後にまとめて投げる。
 *
 * @param steps 後片付けの処理
 * @throws AggregateError 1 つ以上の処理が失敗したとき
 */
async function runCleanup(steps: (() => Promise<void> | void)[]): Promise<void> {
  const errors: unknown[] = [];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, '後片付けに失敗しました');
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
    // アシスタントを先に消してから、カテゴリ・フォルダ（アシスタントが使っているものは消せないため）
    await runCleanup([
      () => deleteAssistantsByKeyword(adminApi, prefix),
      () => deleteCategoriesByKeyword(adminApi, prefix),
      () => deleteFoldersByKeyword(adminApi, prefix),
    ]);
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
    await runCleanup([
      ...created.map(({ owner, room }) => async () => {
        const api = owners[owner];
        if (api) await deleteRoom(api, room);
      }),
      async () => {
        await owners.user?.dispose();
      },
    ]);
  },

  // eslint-disable-next-line no-empty-pattern -- Playwright は fixture の第 1 引数を分割代入で受ける必要がある
  makeQuotaTenant: async ({}, use) => {
    const tenants: QuotaTenant[] = [];
    await use((scenario) => {
      const tenant = createQuotaTenant(scenario);
      tenants.push(tenant);
      return tenant;
    });
    await runCleanup(tenants.map((tenant) => () => dropQuotaTenant(tenant)));
  },
});
