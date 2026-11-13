import type { APIRequestContext, Page } from '@playwright/test';
import { DEFAULT_ASSISTANT_NAME, MOCK_ERROR_MARKER, SECOND_ASSISTANT_NAME, deleteRoom } from '../src/api-chat.ts';
import { loginApi } from '../src/api.ts';
import { expect, roomIdFromUrl, test } from '../src/fixtures-chat.ts';
import { ChatPage, CHAT_TEXT } from '../src/pages/chat.page.ts';
import { LoginPage } from '../src/pages/login.page.ts';
import { runSql } from '../src/sql.ts';
import { excelFile, pdfFile, pngFile, unsupportedFile, wordFile, type TestFile } from '../src/test-files.ts';
import type { SeedUser } from '../src/users.ts';

/**
 * 07_チャット送信（55 項目）。項目書: 25DA61_結合テスト項目書_md/07_チャット送信.md
 *
 * 移植元との対応・環境の都合:
 * - 回答の LLM は専用環境のモック（`docker/llm_mock.py`）。質問をそのまま `[echo] <質問>` で返し、受け取ったツール（web 検索）を
 *   回答の末尾に `[mock:tools]` として添える。テンプレートは backend が質問の前に付けて LLM に送るため、エコーされた質問の中に出る。
 *   「回答が返る」「オプションが反映される」は、このエコーで確かめる
 * - 実際の LLM の回答内容や、外部のサーバー（SECURE アシスタントのローカルサーバー）が要る項目は `test.skip` にして理由を書く
 * - 「Chrome」の項目は、このテストが Chromium（Chrome と同じ描画エンジン）で動くため、同じ操作を確かめる
 * - 送信は新規チャット（/dashboard）から行う。最初のメッセージを送るとルームが作られ /chat/:roomId に移る。作られたルームは終了時に削除する
 * - プラン制限（46〜55）は、プランを持つ別のテナント（tenant-demo-b）のプランとトークン使用量を SQL で書き換えて確かめる
 *   （test-tenant のプランを変えると、並列で動く他のテストのチャットが止まるため）
 */

/** 回答が返るまで待つ時間。モックはすぐ返すが、ルームの作成・遷移を含む。 */
const ANSWER_TIMEOUT_MS = 20_000;
/** 「数百文字」の長文（項目書 07-20）。 */
const LONG_TEXT_LENGTH = 600;
/** プラン制限の確認で使うプランの月間クレジット上限と、テナント個別の上乗せ上限。 */
const PLAN_CREDIT_LIMIT = 1000;
const TENANT_EXTRA_CREDIT_LIMIT = 500;
const PLAN_TENANT_ID = 'tenant-demo-b';
const PLAN_USER: SeedUser = {
  tenantId: PLAN_TENANT_ID,
  // アシスタントが SAAS_CHAT の 1 つだけ（user02 などは RAG・SECURE で、インデックスやローカルサーバーが要る）
  loginId: 'tenant-demo-b-user04',
  password: 'admin@1234',
  role: 'USER',
  name: 'デモユーザー04',
  description: 'プラン制限の確認用（seed.sql の追加テナント）',
};
const PLAN_ID = 'plan-spec-chat';
const PLAN_SUBSCRIPTION_ID = `subscription-${PLAN_TENANT_ID}`;
const PLAN_USAGE_ID = 'spec-usage-plan';

type TrackRoom = (roomId: string) => void;

/** 画面の URL がルームに変わるまで待ち、そのルームを終了時の削除の対象にする。 */
async function trackCurrentRoom(page: Page, trackRoom: TrackRoom): Promise<string> {
  await expect(page).toHaveURL(/\/chat\/[^/?#]+$/, { timeout: ANSWER_TIMEOUT_MS });
  const roomId = roomIdFromUrl(page) ?? new URL(page.url()).pathname.split('/').pop();
  if (!roomId) throw new Error(`ルームの ID を URL から取れませんでした: ${page.url()}`);
  trackRoom(roomId);
  return roomId;
}

/** 新規チャットから質問を送り、ルームの画面で回答が出るまで待つ。 */
async function sendFromDashboard(chat: ChatPage, page: Page, trackRoom: TrackRoom, text: string): Promise<void> {
  await chat.send(text);
  await trackCurrentRoom(page, trackRoom);
  await chat.expectAnswerCount(1);
}

function templateOf(templates: { name: string; systemPrompt: string }[]): { name: string; systemPrompt: string } {
  const [first] = templates;
  if (!first) throw new Error('プロンプトテンプレートが seed にありません');
  return first;
}

async function fetchTemplates(api: APIRequestContext): Promise<{ name: string; systemPrompt: string }[]> {
  const res = await api.get('/api/prompt-templates', { params: { page: 0, size: 10 } });
  const body = (await res.json()) as { content: { name: string; systemPrompt: string }[] };
  return body.content;
}

test.describe('07_チャット送信', () => {
  test('[07-01] 新規チャット画面表示', async ({ loginAs, page }) => {
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await expect(chat.textarea).toBeVisible();
    await expect(page.getByText(CHAT_TEXT.disclaimer)).toBeVisible();
  });

  test('[07-02] 送信ボタン無効（未入力）', async ({ loginAs, page }) => {
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await expect(chat.sendButton).toBeDisabled();
    // Enter を押しても何も送られず、画面は新規チャットのまま
    await chat.textarea.press('Enter');
    await expect(page).not.toHaveURL(/\/chat\/[^/]+$/);
    await expect(chat.userMessages).toHaveCount(0);
  });

  test('[07-03] テキストのみ送信', async ({ loginAs, page, trackRoom, uniqueId }) => {
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    const text = uniqueId('text');
    await sendFromDashboard(chat, page, trackRoom, text);
    await expect(chat.userMessages.first()).toContainText(text);
    await expect(chat.assistantMessages.first()).toContainText(`[echo] ${text}`);
  });

  test('[07-04] 画像添付送信', async ({ loginAs, page, trackRoom, uniqueId }) => {
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    const image = pngFile();
    await chat.attachFiles([image]);
    await expect(page.locator('.chat-input-textarea-wrap img')).toHaveCount(1);
    await sendFromDashboard(chat, page, trackRoom, uniqueId('image'));
    await expect(chat.userMessages.first().locator('.chat-user-attachments img')).toHaveCount(1);
  });

  const documentCases: { id: string; title: string; file: () => TestFile }[] = [
    { id: '07-05', title: 'PDF添付送信', file: pdfFile },
    { id: '07-06', title: 'WORD添付送信', file: wordFile },
    { id: '07-07', title: 'EXCEL添付送信', file: excelFile },
  ];
  for (const { id, title, file } of documentCases) {
    test(`[${id}] ${title}`, async ({ loginAs, page, trackRoom, uniqueId }) => {
      const chat = new ChatPage(page);
      await loginAs('user');
      await chat.gotoDashboard();
      const attachment = file();
      await chat.attachFiles([attachment]);
      await expect(page.locator('.chat-input-textarea-wrap').getByText(attachment.name)).toBeVisible();
      await sendFromDashboard(chat, page, trackRoom, uniqueId('doc'));
      // 送った質問に、添付ファイルの名前が表示される
      await expect(chat.userMessages.first().locator('.chat-user-attachments')).toContainText(attachment.name);
    });
  }

  test('[07-08] Web検索ON送信', async ({ loginAs, page, trackRoom, uniqueId }) => {
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await chat.enableWebSearch();
    await sendFromDashboard(chat, page, trackRoom, uniqueId('web'));
    // 実際の Web 検索はできないため、web 検索のツールを付けて LLM に送ったこと（モックが受け取ったツール）で確かめる
    await expect(chat.assistantMessages.first()).toContainText('[mock:tools] web_search');
  });

  test('[07-09] テンプレート選択送信', async ({ loginAs, page, trackRoom, uniqueId, chatApi }) => {
    const chat = new ChatPage(page);
    const template = templateOf(await fetchTemplates(await chatApi('user')));
    await loginAs('user');
    await chat.gotoDashboard();
    await chat.selectTemplate(template.name);
    const text = uniqueId('tmpl');
    await sendFromDashboard(chat, page, trackRoom, text);
    // テンプレートの本文が質問に付いて LLM に送られた（エコーされた質問の中に、テンプレートの本文と質問の両方が出る）
    await expect(chat.assistantMessages.first()).toContainText(template.systemPrompt);
    await expect(chat.assistantMessages.first()).toContainText(text);
  });

  test('[07-10] ライブラリ作成ON送信', async ({ loginAs, page, trackRoom, uniqueId }) => {
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await chat.enableCreateLibrary();
    await chat.send(uniqueId('library'));
    await trackCurrentRoom(page, trackRoom);
    // ライブラリ作成の処理が走り、ビューアにライブラリのタイトルが出る
    await expect(page.getByRole('complementary', { name: 'ビューワー' })).toContainText('モックのライブラリ', {
      timeout: ANSWER_TIMEOUT_MS,
    });
  });

  test('[07-11] @アシスタント指定', async ({ loginAs, page, trackRoom, uniqueId }) => {
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await chat.typeMessage('@');
    await page.getByRole('option', { name: new RegExp(SECOND_ASSISTANT_NAME) }).first().click();
    await expect(chat.assistantSelectButton).toContainText(SECOND_ASSISTANT_NAME);
    await sendFromDashboard(chat, page, trackRoom, uniqueId('mention'));
    await expect(chat.assistantMessages.first().locator('.chat-message-sender')).toHaveText(SECOND_ASSISTANT_NAME);
  });

  test('[07-12] アシスタント選択変更', async ({ loginAs, page, trackRoom, uniqueId }) => {
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await chat.selectAssistant(SECOND_ASSISTANT_NAME);
    await sendFromDashboard(chat, page, trackRoom, uniqueId('switch'));
    await expect(chat.assistantMessages.first().locator('.chat-message-sender')).toHaveText(SECOND_ASSISTANT_NAME);
  });

  test.describe('新規チャットダイアログ', () => {
    /** サイドバーの「新しいチャット」を押してダイアログを開く。 */
    async function openNewChatDialog(page: Page): Promise<void> {
      await page.getByRole('button', { name: '新しいチャット', exact: true }).click();
      await expect(page.getByRole('dialog').getByText(CHAT_TEXT.newChatTitle)).toBeVisible();
    }

    /** ダイアログの検索欄に入力して、選択肢を開く。 */
    async function searchAssistant(page: Page, query: string): Promise<void> {
      const input = page.getByRole('dialog').locator('input').first();
      await input.click();
      await input.fill(query);
    }

    test('[07-13] 新規チャットダイアログ', async ({ loginAs, page, trackRoom }) => {
      const chat = new ChatPage(page);
      await loginAs('user');
      await chat.gotoDashboard();
      await openNewChatDialog(page);
      await searchAssistant(page, DEFAULT_ASSISTANT_NAME);
      await page.getByRole('dialog').getByRole('option', { name: new RegExp(DEFAULT_ASSISTANT_NAME) }).first().click();
      await page.getByRole('dialog').getByRole('button', { name: '作成', exact: true }).click();

      await trackCurrentRoom(page, trackRoom);
      await expect(chat.textarea).toBeVisible();
      await expect(chat.assistantSelectButton).toContainText(DEFAULT_ASSISTANT_NAME);
      // 選択したアシスタントの説明（seed の「汎用アシスタント」の説明）
      await expect(page.locator('.chat-main p.text-body', { hasText: '一般的な質問に回答するアシスタント' })).toBeVisible();
    });

    test('[07-14] 新規チャットダイアログ（アシスタント未選択）', async ({ loginAs, page }) => {
      const chat = new ChatPage(page);
      await loginAs('user');
      await chat.gotoDashboard();
      await openNewChatDialog(page);
      await expect(page.getByRole('dialog').getByRole('button', { name: '作成', exact: true })).toBeDisabled();
    });

    test('[07-15] 新規チャットダイアログ（名前で絞り込み）', async ({ loginAs, page }) => {
      const chat = new ChatPage(page);
      await loginAs('user');
      await chat.gotoDashboard();
      await openNewChatDialog(page);
      await searchAssistant(page, '確認用01');
      const options = page.getByRole('dialog').getByRole('option');
      await expect(options).toHaveCount(1);
      await expect(options.first()).toContainText(SECOND_ASSISTANT_NAME);
    });

    test('[07-16] 新規チャットダイアログ（タグで絞り込み）', async ({ loginAs, page }) => {
      const chat = new ChatPage(page);
      await loginAs('user');
      await chat.gotoDashboard();
      await openNewChatDialog(page);
      // 「アシスタント表示名・カテゴリで検索できます」（画面の案内）。カテゴリ名の一部で絞り込む
      await searchAssistant(page, '業務効率');
      const options = page.getByRole('dialog').getByRole('option');
      await expect(options.first()).toContainText(DEFAULT_ASSISTANT_NAME);
      await expect(options.filter({ hasText: SECOND_ASSISTANT_NAME })).toHaveCount(0);
    });

    test('[07-17] 新規チャットダイアログ（キャンセル）', async ({ loginAs, page }) => {
      const chat = new ChatPage(page);
      await loginAs('user');
      await chat.gotoDashboard();
      await openNewChatDialog(page);
      await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeHidden();
    });
  });

  test('[07-18] 注意書き表示', async ({ loginAs, page }) => {
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await expect(page.getByText(CHAT_TEXT.disclaimer)).toBeVisible();
  });

  test('[07-19] 送信後ルーム遷移', async ({ loginAs, page, trackRoom, uniqueId }) => {
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await chat.send(uniqueId('first'));
    const roomId = await trackCurrentRoom(page, trackRoom);
    await expect(page).toHaveURL(new RegExp(`/chat/${roomId}$`));
    await chat.expectAnswerCount(1);
  });

  test('[07-20] 長文メッセージ送信', async ({ loginAs, page, trackRoom, uniqueId }) => {
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    const text = `${uniqueId('long')} ${'長文のテスト。'.repeat(Math.ceil(LONG_TEXT_LENGTH / 7))}`.slice(0, LONG_TEXT_LENGTH);
    await sendFromDashboard(chat, page, trackRoom, text);
    await expect(chat.userMessages.first().locator('.chat-user-text')).toHaveText(text);
    await expect(chat.assistantMessages.first()).toContainText(text.slice(0, 40));
  });

  test('[07-21] APIエラー時送信', async ({ loginAs, page, trackRoom }) => {
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    // モックの LLM が 500 を返す質問
    await chat.send(`${MOCK_ERROR_MARKER} エラーの確認`);
    await trackCurrentRoom(page, trackRoom);
    await expect(chat.assistantMessages.first().getByRole('alert')).toBeVisible({ timeout: ANSWER_TIMEOUT_MS });
    await expect(chat.assistantMessages.first()).toContainText('回答エラー');
  });

  test('[07-22] 非対応ファイル添付', async ({ loginAs, page }) => {
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await chat.attachFiles([unsupportedFile()]);
    // 非対応の種類は添付されない（添付のチップが出ず、送信もできない）
    await expect(page.locator('.chat-input-textarea-wrap').getByText('sample.exe')).toHaveCount(0);
    await expect(chat.sendButton).toBeDisabled();
  });

  test('[07-23] 1文字メッセージ送信', async ({ loginAs, page, trackRoom }) => {
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await sendFromDashboard(chat, page, trackRoom, 'あ');
    await expect(chat.userMessages.first().locator('.chat-user-text')).toHaveText('あ');
    await expect(chat.assistantMessages.first()).toContainText('[echo] あ');
  });

  test('[07-24] 空メッセージ送信不可', async ({ loginAs, page }) => {
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await chat.typeMessage('   ');
    await expect(chat.sendButton).toBeDisabled();
    await chat.textarea.press('Enter');
    await expect(page).not.toHaveURL(/\/chat\/[^/]+$/);
    await expect(chat.userMessages).toHaveCount(0);
  });

  test('[07-25] 複数画像添付', async ({ loginAs, page, trackRoom, uniqueId }) => {
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await chat.attachFiles([pngFile('first.png'), pngFile('second.png'), pngFile('third.png')]);
    await expect(page.locator('.chat-input-textarea-wrap img')).toHaveCount(3);
    await sendFromDashboard(chat, page, trackRoom, uniqueId('images'));
    await expect(chat.userMessages.first().locator('.chat-user-attachments img')).toHaveCount(3);
  });

  // 送信オプションの組み合わせ（添付 × Web 検索 × テンプレート × ライブラリ作成 = 16 通り）。項番 26〜41 が 001〜016 に対応する
  const COMBO_FIRST_NUMBER = 26;
  const combos: { attachImage: boolean; webSearch: boolean; template: boolean; library: boolean }[] = [];
  for (const attachImage of [false, true]) {
    for (const webSearch of [false, true]) {
      for (const template of [false, true]) {
        for (const library of [false, true]) combos.push({ attachImage, webSearch, template, library });
      }
    }
  }
  combos.forEach((combo, index) => {
    const number = COMBO_FIRST_NUMBER + index;
    const label = String(index + 1).padStart(3, '0');
    test(`[07-${number}] 送信オプション組合せ-${label}`, async ({ loginAs, page, trackRoom, uniqueId, chatApi }) => {
      const chat = new ChatPage(page);
      const template = combo.template ? templateOf(await fetchTemplates(await chatApi('user'))) : null;
      await loginAs('user');
      await chat.gotoDashboard();
      if (combo.attachImage) await chat.attachFiles([pngFile()]);
      if (combo.webSearch) await chat.enableWebSearch();
      if (template) await chat.selectTemplate(template.name);
      if (combo.library) await chat.enableCreateLibrary();

      const text = uniqueId('combo');
      await chat.send(text);
      await trackCurrentRoom(page, trackRoom);

      if (combo.library) {
        // ライブラリ作成のときは、回答の代わりにビューアにライブラリが作られる
        await expect(page.getByRole('complementary', { name: 'ビューワー' })).toContainText('モックのライブラリ', {
          timeout: ANSWER_TIMEOUT_MS,
        });
      } else {
        await chat.expectAnswerCount(1);
        const answer = chat.assistantMessages.first();
        await expect(answer).toContainText(text);
        if (combo.webSearch) await expect(answer).toContainText('[mock:tools] web_search');
        else await expect(answer).not.toContainText('[mock:tools]');
        if (template) await expect(answer).toContainText(template.systemPrompt);
        else await expect(answer).not.toContainText('ページ送り確認用のシステムプロンプト');
      }
      if (combo.attachImage) {
        await expect(chat.userMessages.first().locator('.chat-user-attachments img')).toHaveCount(1);
      }
    });
  });

  test('[07-42] チャット送信 Chrome', async ({ loginAs, page, trackRoom, uniqueId, browserName }) => {
    // このテストは Chromium（Chrome と同じ描画エンジン）で動く
    expect(browserName).toBe('chromium');
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    const text = uniqueId('chrome');
    await sendFromDashboard(chat, page, trackRoom, text);
    await expect(chat.assistantMessages.first()).toContainText(`[echo] ${text}`);
  });

  test('[07-43] 一般ユーザー送信', async ({ loginAs, page, trackRoom, uniqueId }) => {
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    const text = uniqueId('user');
    await sendFromDashboard(chat, page, trackRoom, text);
    await expect(chat.assistantMessages.first()).toContainText(`[echo] ${text}`);
  });

  test('[07-44] 管理者送信', async ({ loginAs, page, uniqueId, chatApi }) => {
    const chat = new ChatPage(page);
    await loginAs('tenantAdmin');
    await chat.gotoDashboard();
    const text = uniqueId('admin');
    await chat.send(text);
    // 管理者のルームは管理者の API で消す（trackRoom は一般ユーザー用）
    await expect(page).toHaveURL(/\/chat\/[^/?#]+$/, { timeout: ANSWER_TIMEOUT_MS });
    const roomId = new URL(page.url()).pathname.split('/').pop() ?? '';
    try {
      await chat.expectAnswerCount(1);
      await expect(chat.assistantMessages.first()).toContainText(`[echo] ${text}`);
    } finally {
      await deleteRoom(await chatApi('tenantAdmin'), roomId);
    }
  });

  test('[07-45] チャット送信(ローカル)', async () => {
    test.skip(
      true,
      'type=SECURE のアシスタントは、社内のローカルサーバー（server-local / Waha! の連携先）に直接つなぐ。専用環境にはローカルサーバーがなく、確かめられないため'
    );
  });

  test.describe('プラン制限', () => {
    // プラン・使用量はテナント全体の状態。同じテナントで並列に書き換えないよう、順番に流す
    test.describe.configure({ mode: 'serial' });

    test.beforeAll(() => {
      // tenant-demo-b の契約を、上限が小さい専用のプランに切り替える（終了時に元へ戻す）
      runSql(`
        INSERT INTO plans (id, name, max_users, max_credits_per_month) VALUES ('${PLAN_ID}', 'Spec Chat', 20, ${PLAN_CREDIT_LIMIT})
          ON CONFLICT (id) DO UPDATE SET max_credits_per_month = ${PLAN_CREDIT_LIMIT};
        UPDATE subscriptions SET plan_id = '${PLAN_ID}' WHERE id = '${PLAN_SUBSCRIPTION_ID}';
        DELETE FROM token_usages WHERE tenant_id = '${PLAN_TENANT_ID}';
      `);
    });

    test.afterAll(() => {
      runSql(`
        DELETE FROM token_usages WHERE tenant_id = '${PLAN_TENANT_ID}';
        UPDATE tenants SET max_usage_based_credits_per_month = 0 WHERE id = '${PLAN_TENANT_ID}';
        UPDATE subscriptions SET plan_id = 'plan-demo' WHERE id = '${PLAN_SUBSCRIPTION_ID}';
        DELETE FROM plans WHERE id = '${PLAN_ID}';
      `);
    });

    /** 当月の使用量を `usedCredits` にし、テナント個別の上限を `tenantExtra` にする。 */
    function setUsage(usedCredits: number, tenantExtra: number): void {
      runSql(`
        UPDATE tenants SET max_usage_based_credits_per_month = ${tenantExtra} WHERE id = '${PLAN_TENANT_ID}';
        DELETE FROM token_usages WHERE tenant_id = '${PLAN_TENANT_ID}';
        INSERT INTO token_usages (id, tenant_id, model, input_credits, output_credits, embedding_credits)
          VALUES ('${PLAN_USAGE_ID}', '${PLAN_TENANT_ID}', 'gpt-4o', ${usedCredits}, 0, 0);
      `);
    }

    /** プラン制限のあるテナントのユーザーで質問を送り、メッセージ作成の応答を返す。 */
    async function sendAsPlanUser(page: Page, text: string): Promise<{ status: number; roomId: string | null }> {
      const chat = new ChatPage(page);
      await new LoginPage(page).login(PLAN_USER);
      await chat.gotoDashboard();
      const responsePromise = page.waitForResponse(
        (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/messages/content',
        { timeout: ANSWER_TIMEOUT_MS }
      );
      await chat.send(text);
      const response = await responsePromise;
      return { status: response.status(), roomId: roomIdFromUrl(page) };
    }

    /** 作られたルームを、プラン制限のあるテナントのユーザーで消す。 */
    async function cleanupRooms(): Promise<void> {
      const api = await loginApi(PLAN_USER);
      try {
        const res = await api.get('/api/rooms', { params: { page: 0, size: 100 } });
        const body = (await res.json()) as { content: { id: string; name: string }[] };
        for (const room of body.content.filter((r) => r.name.startsWith('spec-plan'))) await deleteRoom(api, room.id);
      } finally {
        await api.dispose();
      }
    }

    test.afterEach(async () => {
      await cleanupRooms();
    });

    const planCases: { id: string; title: string; used: number; tenantExtra: number; accepted: boolean }[] = [
      { id: '07-46', title: 'チャット送信-プラン制限-プラン制限内', used: 0, tenantExtra: 0, accepted: true },
      { id: '07-47', title: 'チャット送信-プラン制限-プラン制限MAX', used: PLAN_CREDIT_LIMIT - 1, tenantExtra: 0, accepted: true },
      { id: '07-48', title: 'チャット送信-プラン制限-プラン制限MAX', used: PLAN_CREDIT_LIMIT, tenantExtra: 0, accepted: false },
      { id: '07-49', title: 'チャット送信-プラン制限-プラン制限超え', used: PLAN_CREDIT_LIMIT + 1, tenantExtra: 0, accepted: false },
      {
        id: '07-50',
        title: 'チャット送信-プラン制限+テナント制限-プラン制限内',
        used: PLAN_CREDIT_LIMIT - 100,
        tenantExtra: TENANT_EXTRA_CREDIT_LIMIT,
        accepted: true,
      },
      {
        id: '07-51',
        title: 'チャット送信-プラン制限+テナント制限-プラン制限MAX',
        used: PLAN_CREDIT_LIMIT,
        tenantExtra: TENANT_EXTRA_CREDIT_LIMIT,
        accepted: true,
      },
      {
        id: '07-52',
        title: 'チャット送信-プラン制限+テナント制限-プラン制限超え-テナント制限内',
        used: PLAN_CREDIT_LIMIT + 100,
        tenantExtra: TENANT_EXTRA_CREDIT_LIMIT,
        accepted: true,
      },
      {
        id: '07-53',
        title: 'チャット送信-プラン制限+テナント制限-プラン制限超え-テナント制限MAX',
        used: PLAN_CREDIT_LIMIT + TENANT_EXTRA_CREDIT_LIMIT - 1,
        tenantExtra: TENANT_EXTRA_CREDIT_LIMIT,
        accepted: true,
      },
      {
        id: '07-54',
        title: 'チャット送信-プラン制限+テナント制限-プラン制限超え-テナント制限MAX',
        used: PLAN_CREDIT_LIMIT + TENANT_EXTRA_CREDIT_LIMIT,
        tenantExtra: TENANT_EXTRA_CREDIT_LIMIT,
        accepted: false,
      },
      {
        id: '07-55',
        title: 'チャット送信-プラン制限+テナント制限-プラン制限超え-テナント制限超え',
        used: PLAN_CREDIT_LIMIT + TENANT_EXTRA_CREDIT_LIMIT + 1,
        tenantExtra: TENANT_EXTRA_CREDIT_LIMIT,
        accepted: false,
      },
    ];
    for (const { id, title, used, tenantExtra, accepted } of planCases) {
      test(`[${id}] ${title}`, async ({ page }) => {
        setUsage(used, tenantExtra);
        const { status } = await sendAsPlanUser(page, 'spec-plan limit');
        const chat = new ChatPage(page);
        if (accepted) {
          expect(status).toBe(200);
          await chat.expectAnswerCount(1);
          await expect(chat.assistantMessages.first()).toContainText('[echo] spec-plan limit');
        } else {
          // 上限に達しているときは、送信が拒否される（429）。回答は出ず、エラー表示になる
          expect(status).toBe(429);
          await expect(chat.assistantMessages.first().getByRole('alert')).toBeVisible();
          await expect(chat.assistantMessages.first()).not.toContainText('[echo]');
        }
      });
    }
  });
});
