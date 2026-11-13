import type { APIRequestContext, Locator, Page } from '@playwright/test';
import {
  MOCK_ERROR_MARKER,
  MOCK_SLOW_MARKER,
  createAssistant,
  createRoom,
  deleteAssistant,
  sendMessage,
} from '../src/api-chat.ts';
import { expect, test, type MakeRoomOptions } from '../src/fixtures-chat.ts';
import { ChatPage, CHAT_TEXT, DESKTOP_VIEWPORT, MOBILE_VIEWPORT } from '../src/pages/chat.page.ts';
import { runSql } from '../src/sql.ts';
import { pngFile } from '../src/test-files.ts';

/**
 * 11_チャット詳細（77 項目）。項目書: 25DA61_結合テスト項目書_md/11_チャット詳細.md
 *
 * 移植元との対応・環境の都合:
 * - 回答の LLM は専用環境のモック（`docker/llm_mock.py`）。質問を `[echo] <質問>` で返し、回答のたびに `[mock:call] <通し番号>` を添える。
 *   再生成・編集で「新しい回答が作られた」ことは、この通し番号が前の回答と変わることで確かめる。
 *   ライブラリ作成のときはタイトル `モックのライブラリ-<通し番号>` のライブラリが作られ、ビューアのタイトルの番号で区別する
 * - ルーム・メッセージ・ライブラリは API で用意する（`makeRoom`）。確かめる操作そのものは画面から行う
 * - PDF 保存は、印刷用のウィンドウが開き、ライブラリの内容が写されることで確かめる（ヘッドレスのブラウザでは印刷ダイアログ自体は確かめられない）
 * - 「Chrome」の項目は、このテストが Chromium（Chrome と同じ描画エンジン）で動くため、同じ操作を確かめる
 * - 「エラー状態メッセージの再試行」（11-34）は、移植元・React ともにエラー表示に再試行ボタンはなく、回答の「再生成」で再送する
 */

/** ストリーミングや再生成の完了を待つ時間。 */
const ANSWER_TIMEOUT_MS = 20_000;
const LIBRARY_TITLE_PREFIX = 'モックのライブラリ-';
const VIEWER_COLLAPSED_WIDTH_PX = 52;
const VIEWER_MIN_WIDTH_PX = 280;
const VIEWER_MAX_WIDTH_PX = 1018;
/** 幅の誤差の許容（px）。 */
const WIDTH_TOLERANCE_PX = 2;
/** 「編集最大長」で使う長いテキストの文字数。移植元に最大長の制限はない（項目書の備考）。 */
const LONG_EDIT_LENGTH = 5000;
/** 連続送信の最大回数（項目書 11-59〜68）。 */
const CONSECUTIVE_SEND_COUNT = 10;

/** 質問に付けるオプション（Web 検索・ライブラリ作成・テンプレート）の組み合わせ。 */
interface OptionCombo {
  webSearch: boolean;
  library: boolean;
  template: boolean;
}

/** 項目書の「組み合わせ-1〜8」の順（11-04〜11 と 11-14〜21 で共通）。 */
const OPTION_COMBOS: OptionCombo[] = [
  { webSearch: false, library: false, template: false },
  { webSearch: true, library: false, template: false },
  { webSearch: false, library: true, template: false },
  { webSearch: false, library: false, template: true },
  { webSearch: true, library: true, template: false },
  { webSearch: true, library: false, template: true },
  { webSearch: false, library: true, template: true },
  { webSearch: true, library: true, template: true },
];

function viewerOf(page: Page): Locator {
  return page.getByRole('complementary', { name: 'ビューワー' });
}

function viewerTitleButton(page: Page): Locator {
  return viewerOf(page).getByRole('button', { name: '資料を切り替え' });
}

/** ビューアに出ているライブラリのタイトルの通し番号。 */
async function viewerLibraryNumber(page: Page): Promise<number> {
  // ライブラリの一覧と本文の取得が終わるまでタイトルは空
  await expect(viewerTitleButton(page)).toContainText(LIBRARY_TITLE_PREFIX, { timeout: ANSWER_TIMEOUT_MS });
  const title = (await viewerTitleButton(page).innerText()).trim();
  const match = new RegExp(`${LIBRARY_TITLE_PREFIX}(\\d+)`).exec(title);
  if (!match) throw new Error(`ビューアのタイトルからライブラリの番号を取れません: ${title}`);
  return Number(match[1]);
}

/** 回答の本文から `[mock:call] <番号>` の番号を取る。 */
async function answerCallNumber(answer: Locator): Promise<number> {
  const text = await answer.getByTestId('chat-response-container').innerText();
  const match = /\[mock:call\] (\d+)/.exec(text);
  if (!match) throw new Error(`回答に通し番号がありません: ${text}`);
  return Number(match[1]);
}

async function fetchTemplate(api: APIRequestContext): Promise<{ name: string; systemPrompt: string }> {
  const res = await api.get('/api/prompt-templates', { params: { page: 0, size: 10 } });
  const body = (await res.json()) as { content: { name: string; systemPrompt: string }[] };
  const [first] = body.content;
  if (!first) throw new Error('プロンプトテンプレートが seed にありません');
  return first;
}

/** ルームの URL を開く（ログイン済みの前提）。 */
async function openRoom(page: Page, roomId: string): Promise<ChatPage> {
  const chat = new ChatPage(page);
  await chat.gotoRoom(roomId);
  return chat;
}

test.describe('11_チャット詳細', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test('[11-01] ルーム内送信', async ({ loginAs, page, makeRoom, uniqueId }) => {
    const room = await makeRoom({ messages: ['最初の質問'] });
    await loginAs('user');
    const chat = await openRoom(page, room.id);
    await expect(chat.assistantMessages).toHaveCount(1);
    const text = uniqueId('add');
    await chat.sendAndWaitForAnswer(text);
    await expect(chat.userMessages).toHaveCount(2);
    await expect(chat.userMessages.last()).toContainText(text);
    await expect(chat.assistantMessages.last()).toContainText(`[echo] ${text}`);
  });

  test('[11-02] コピー（ユーザー）', async ({ loginAs, page, context, makeRoom }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const room = await makeRoom({ messages: ['コピーする質問'] });
    await loginAs('user');
    const chat = await openRoom(page, room.id);
    await chat.actionButton(chat.userMessages.first(), 'コピー').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('コピーする質問');
  });

  test('[11-03] コピー（AI）', async ({ loginAs, page, context, makeRoom }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const room = await makeRoom({ messages: ['AIの回答をコピー'] });
    await loginAs('user');
    const chat = await openRoom(page, room.id);
    await chat.actionButton(chat.assistantMessages.first(), 'コピー').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('[echo] AIの回答をコピー');
  });

  // 再生成（組み合わせ 1〜8 = 項番 4〜11）
  OPTION_COMBOS.forEach((combo, index) => {
    const label = `組み合わせ-${index + 1}`;
    test(`[11-${String(4 + index).padStart(2, '0')}] 再生成（${label}）`, async ({ loginAs, page, makeRoom, chatApi, uniqueId }) => {
      const template = await fetchTemplate(await chatApi('user'));
      const question = uniqueId('regen');
      const options: MakeRoomOptions = {
        messages: [question],
        sendOptions: {
          useWebSearch: combo.webSearch,
          createLibrary: combo.library,
          additionalPrompt: combo.template ? template.systemPrompt : undefined,
        },
      };
      const room = await makeRoom(options);
      await loginAs('user');
      const chat = await openRoom(page, room.id);
      const answer = chat.assistantMessages.first();
      await expect(answer.getByTestId('chat-response-container')).toBeVisible();
      const beforeNumber = combo.library ? await viewerLibraryNumber(page) : await answerCallNumber(answer);

      await chat.actionButton(answer, '再生成').click();

      // 既存の回答が置き換わり、回答は 1 件のまま新しい回答になる
      await expect(chat.assistantMessages).toHaveCount(1);
      if (combo.library) {
        await expect.poll(() => viewerLibraryNumber(page), { timeout: ANSWER_TIMEOUT_MS }).not.toBe(beforeNumber);
      } else {
        await expect.poll(() => answerCallNumber(answer).catch(() => beforeNumber), { timeout: ANSWER_TIMEOUT_MS }).not.toBe(beforeNumber);
        await expect(answer).toContainText(question);
        if (combo.webSearch) await expect(answer).toContainText('[mock:tools] web_search');
        if (combo.template) await expect(answer).toContainText(template.systemPrompt);
      }
    });
  });

  test('[11-12] メッセージ編集', async ({ loginAs, page, makeRoom }) => {
    const room = await makeRoom({ messages: ['編集する質問'] });
    await loginAs('user');
    const chat = await openRoom(page, room.id);
    await chat.actionButton(chat.userMessages.first(), '編集').click();
    const editor = chat.userMessages.first().locator('.chat-user-textarea');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveValue('編集する質問');
  });

  test('[11-13] 編集キャンセル', async ({ loginAs, page, makeRoom }) => {
    const room = await makeRoom({ messages: ['キャンセルする質問'] });
    await loginAs('user');
    const chat = await openRoom(page, room.id);
    const user = chat.userMessages.first();
    await chat.actionButton(user, '編集').click();
    await user.locator('.chat-user-textarea').fill('書き換えた内容');
    await user.getByRole('button', { name: 'キャンセル' }).click();
    await expect(user.locator('.chat-user-textarea')).toBeHidden();
    await expect(user.locator('.chat-user-text')).toHaveText('キャンセルする質問');
  });

  // 編集再送信（組み合わせ 1〜8 = 項番 14〜21）
  OPTION_COMBOS.forEach((combo, index) => {
    const label = `組み合わせ-${index + 1}`;
    test(`[11-${String(14 + index).padStart(2, '0')}] 編集再送信（${label}）`, async ({ loginAs, page, makeRoom, chatApi, uniqueId }) => {
      const template = await fetchTemplate(await chatApi('user'));
      const room = await makeRoom({
        messages: ['編集前の質問'],
        sendOptions: {
          useWebSearch: combo.webSearch,
          createLibrary: combo.library,
          additionalPrompt: combo.template ? template.systemPrompt : undefined,
        },
      });
      await loginAs('user');
      const chat = await openRoom(page, room.id);
      const beforeNumber = combo.library ? await viewerLibraryNumber(page) : null;

      const edited = uniqueId('edited');
      const user = chat.userMessages.first();
      await chat.actionButton(user, '編集').click();
      await user.locator('.chat-user-textarea').fill(edited);
      await user.getByRole('button', { name: '再送信' }).click();

      // 新しい質問と回答が表示され、メッセージの分岐（2/2）が出る
      await expect(chat.userMessages.first().locator('.chat-user-text')).toHaveText(edited, { timeout: ANSWER_TIMEOUT_MS });
      await expect(chat.userMessages.first().locator('.chat-pagination-label')).toHaveText('2/2');
      if (combo.library) {
        await expect.poll(() => viewerLibraryNumber(page), { timeout: ANSWER_TIMEOUT_MS }).not.toBe(beforeNumber);
      } else {
        const answer = chat.assistantMessages.first();
        await expect(answer).toContainText(`${edited}`, { timeout: ANSWER_TIMEOUT_MS });
        if (combo.webSearch) await expect(answer).toContainText('[mock:tools] web_search');
        if (combo.template) await expect(answer).toContainText(template.systemPrompt);
      }
    });
  });

  test.describe('バージョン切替', () => {
    /** 質問を 1 回編集して、2 つの版がある状態にする。 */
    async function roomWithEditedMessage(
      page: Page,
      makeRoom: (options?: MakeRoomOptions) => Promise<{ id: string }>,
      original: string,
      edited: string
    ): Promise<ChatPage> {
      const room = await makeRoom({ messages: [original] });
      const chat = await openRoom(page, room.id);
      const user = chat.userMessages.first();
      await chat.actionButton(user, '編集').click();
      await user.locator('.chat-user-textarea').fill(edited);
      await user.getByRole('button', { name: '再送信' }).click();
      await expect(chat.userMessages.first().locator('.chat-pagination-label')).toHaveText('2/2', { timeout: ANSWER_TIMEOUT_MS });
      await chat.expectAnswerCount(1);
      return chat;
    }

    test('[11-22] バージョン切替（前）', async ({ loginAs, page, makeRoom }) => {
      await loginAs('user');
      const chat = await roomWithEditedMessage(page, makeRoom, '元の質問', '編集後の質問');
      await chat.userMessages.first().getByRole('button', { name: '前のバージョン' }).click();
      await expect(chat.userMessages.first().locator('.chat-user-text')).toHaveText('元の質問');
      await expect(chat.userMessages.first().locator('.chat-pagination-label')).toHaveText('1/2');
      await expect(chat.assistantMessages.first()).toContainText('[echo] 元の質問');
    });

    test('[11-23] バージョン切替（次）', async ({ loginAs, page, makeRoom }) => {
      await loginAs('user');
      const chat = await roomWithEditedMessage(page, makeRoom, '元の質問', '編集後の質問');
      await chat.userMessages.first().getByRole('button', { name: '前のバージョン' }).click();
      await expect(chat.userMessages.first().locator('.chat-pagination-label')).toHaveText('1/2');
      await chat.userMessages.first().getByRole('button', { name: '次のバージョン' }).click();
      await expect(chat.userMessages.first().locator('.chat-user-text')).toHaveText('編集後の質問');
      await expect(chat.userMessages.first().locator('.chat-pagination-label')).toHaveText('2/2');
      await expect(chat.assistantMessages.first()).toContainText('[echo] 編集後の質問');
    });
  });

  test.describe('削除', () => {
    test('[11-24] 削除（ユーザー）', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom({ messages: ['削除する質問'] });
      await loginAs('user');
      const chat = await openRoom(page, room.id);
      await chat.actionButton(chat.userMessages.first(), '削除').click();
      await page.getByRole('dialog').getByRole('button', { name: '削除', exact: true }).click();
      // メッセージと回答の両方が消える
      await expect(chat.userMessages).toHaveCount(0);
      await expect(chat.assistantMessages).toHaveCount(0);
    });

    test('[11-25] 削除（AI）', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom({ messages: ['回答を削除する質問'] });
      await loginAs('user');
      const chat = await openRoom(page, room.id);
      await chat.actionButton(chat.assistantMessages.first(), '削除').click();
      await page.getByRole('dialog').getByRole('button', { name: '削除', exact: true }).click();
      await expect(chat.userMessages).toHaveCount(0);
      await expect(chat.assistantMessages).toHaveCount(0);
    });
  });

  test.describe('評価', () => {
    test('[11-26] Good評価', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom({ messages: ['評価する質問'] });
      await loginAs('user');
      const chat = await openRoom(page, room.id);
      const answer = chat.assistantMessages.first();
      await chat.actionButton(answer, '良い').click();
      // アクティブ（押せない状態）になり、再読み込みしても残る
      await expect(chat.actionButton(answer, '良い')).toBeDisabled();
      await page.reload();
      await expect(chat.actionButton(chat.assistantMessages.first(), '良い')).toBeDisabled();
    });

    test('[11-27] Bad評価', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom({ messages: ['評価する質問'] });
      await loginAs('user');
      const chat = await openRoom(page, room.id);
      const answer = chat.assistantMessages.first();
      await chat.actionButton(answer, '良くない').click();
      await expect(chat.actionButton(answer, '良くない')).toBeDisabled();
      await page.reload();
      await expect(chat.actionButton(chat.assistantMessages.first(), '良くない')).toBeDisabled();
    });

    test('[11-28] 評価切替', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom({ messages: ['評価を切り替える質問'] });
      await loginAs('user');
      const chat = await openRoom(page, room.id);
      const answer = chat.assistantMessages.first();
      await chat.actionButton(answer, '良い').click();
      await expect(chat.actionButton(answer, '良い')).toBeDisabled();
      await chat.actionButton(answer, '良くない').click();
      await expect(chat.actionButton(answer, '良くない')).toBeDisabled();
      await expect(chat.actionButton(answer, '良い')).toBeEnabled();
    });
  });

  test('[11-29] ヘッダー名前変更', async ({ loginAs, page, makeRoom, uniqueId }) => {
    const room = await makeRoom({ messages: ['名前を変える'] });
    await loginAs('user');
    const chat = await openRoom(page, room.id);
    const newName = uniqueId('renamed');
    await page.getByRole('button', { name: 'チャットの名前を変更' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').fill(newName);
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(chat.headerTitle).toHaveText(newName);
    await page.reload();
    await expect(chat.headerTitle).toHaveText(newName);
  });

  test('[11-30] ヘッダー共有', async ({ loginAs, page, makeRoom }) => {
    const room = await makeRoom({ messages: ['共有する'] });
    await loginAs('user');
    await openRoom(page, room.id);
    await page.getByTestId('room-share-button').click();
    await expect(page.getByRole('dialog').getByText(CHAT_TEXT.shareDialogTitle)).toBeVisible();
  });

  test('[11-31] ヘッダー評価', async ({ loginAs, page, makeRoom }) => {
    const room = await makeRoom({ messages: ['満足度を評価する'] });
    await loginAs('user');
    await openRoom(page, room.id);
    await page.locator('header').getByRole('button', { name: 'いいね' }).click();
    await expect(page.getByRole('dialog').getByText(CHAT_TEXT.ratingDialogTitle)).toBeVisible();
  });

  test('[11-32] 添付ファイル表示', async ({ loginAs, page, makeRoom, chatApi, uniqueId }) => {
    const room = await makeRoom();
    const api = await chatApi('user');
    await sendMessage(api, room.id, uniqueId('attached'), { files: [pngFile('attached.png')] });
    await loginAs('user');
    const chat = await openRoom(page, room.id);
    await expect(chat.userMessages.first().locator('.chat-user-attachments img')).toHaveCount(1);
  });

  test('[11-33] エラーメッセージ表示', async ({ loginAs, page, makeRoom }) => {
    const room = await makeRoom({
      messages: [`${MOCK_ERROR_MARKER} エラーにする質問`],
      sendOptions: { tolerateAnswerError: true },
    });
    await loginAs('user');
    const chat = await openRoom(page, room.id);
    const answer = chat.assistantMessages.first();
    await expect(answer).toContainText('回答エラー');
    await expect(answer.getByRole('alert')).toContainText('エラーが発生しました');
  });

  test('[11-34] 再試行', async ({ loginAs, page, makeRoom }) => {
    // エラーになった回答を「再生成」で再送する。2 回目はモックがエラーにしない質問に変わる必要があるため、編集してから再送する
    const room = await makeRoom({
      messages: [`${MOCK_ERROR_MARKER} 再試行する質問`],
      sendOptions: { tolerateAnswerError: true },
    });
    await loginAs('user');
    const chat = await openRoom(page, room.id);
    await expect(chat.assistantMessages.first()).toContainText('回答エラー');
    // 同じ質問のまま再送するとまたエラーになる。再送が実行されたことは、リクエストが飛ぶことで確かめる
    const resend = page.waitForRequest(
      (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/messages/content'
    );
    await chat.actionButton(chat.assistantMessages.first(), '再生成').click();
    await resend;
    await expect(chat.assistantMessages.first()).toContainText('回答エラー', { timeout: ANSWER_TIMEOUT_MS });
  });

  test('[11-35] 参照ファイル表示', async ({ loginAs, page, makeRoom }) => {
    const room = await makeRoom({ messages: ['参照ファイルのある質問'] });
    const [sent] = room.sent;
    // 参照ファイルは学習データを検索（RAG）した結果として付く。専用環境では検索できないため、回答に参照ファイルのパスを直接入れる
    runSql(
      `UPDATE message_contents SET file_paths = 'https://example.com/docs/spec-reference.pdf,https://example.com/docs/spec-guide.docx' WHERE message_id = '${sent?.messageId}';`
    );
    await loginAs('user');
    const chat = await openRoom(page, room.id);
    const references = chat.assistantMessages.first().locator('.chat-ref-section');
    await expect(references).toContainText('参考資料');
    await expect(references.getByRole('link', { name: 'spec-reference.pdf' })).toBeVisible();
    await expect(references.getByRole('link', { name: 'spec-guide.docx' })).toBeVisible();
  });

  test.describe('ビューア', () => {
    test('[11-36] ビューア非表示（AI回答前）', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom();
      await loginAs('user');
      const chat = await openRoom(page, room.id);
      await expect(chat.assistantMessages).toHaveCount(0);
      await expect(viewerOf(page)).toHaveCount(0);
    });

    test('[11-37] ビューア表示（AI回答後・デスクトップ）', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom({ messages: ['ビューアを出す'], sendOptions: { createLibrary: true } });
      await loginAs('user');
      await openRoom(page, room.id);
      await expect(viewerOf(page)).toBeVisible();
      await expect(viewerOf(page).locator('.viewer-markdown')).toBeVisible();
    });

    test('[11-38] ライブラリ作成ストリーミング表示', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom({ messages: ['最初の質問'] });
      await loginAs('user');
      const chat = await openRoom(page, room.id);
      await chat.enableCreateLibrary();
      // 1 チャンクごとに待つモックにして、ストリーミング中のビューアを確かめる
      await chat.send(`${MOCK_SLOW_MARKER} ライブラリを作る`);
      await expect(viewerOf(page)).toContainText(LIBRARY_TITLE_PREFIX, { timeout: ANSWER_TIMEOUT_MS });
      await expect(viewerOf(page)).toContainText('箇条書き2', { timeout: ANSWER_TIMEOUT_MS });
    });

    test('[11-39] ストリーミング時自動展開', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom({ messages: ['最初の質問'], sendOptions: { createLibrary: true } });
      await loginAs('user');
      const chat = await openRoom(page, room.id);
      const viewer = viewerOf(page);
      await viewer.getByRole('button', { name: 'ビューワーを閉じる' }).click();
      await expect.poll(async () => (await viewer.boundingBox())?.width).toBeLessThanOrEqual(VIEWER_COLLAPSED_WIDTH_PX + WIDTH_TOLERANCE_PX);

      await chat.enableCreateLibrary();
      await chat.send(`${MOCK_SLOW_MARKER} 折りたたんだまま作る`);
      // ストリーミングが始まるとビューアが開く
      await expect.poll(async () => (await viewer.boundingBox())?.width).toBeGreaterThan(VIEWER_MIN_WIDTH_PX);
      await expect(viewer.locator('.viewer-markdown')).toBeVisible();
    });

    test('[11-40] ビューア折りたたみ（デスクトップ）', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom({ messages: ['折りたたむ'], sendOptions: { createLibrary: true } });
      await loginAs('user');
      await openRoom(page, room.id);
      const viewer = viewerOf(page);
      await viewer.getByRole('button', { name: 'ビューワーを閉じる' }).click();
      await expect.poll(async () => (await viewer.boundingBox())?.width).toBeLessThanOrEqual(VIEWER_COLLAPSED_WIDTH_PX + WIDTH_TOLERANCE_PX);
      await expect(viewer.locator('.viewer-markdown')).toHaveCount(0);
    });

    test('[11-41] ビューア展開（デスクトップ）', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom({ messages: ['展開する'], sendOptions: { createLibrary: true } });
      await loginAs('user');
      await openRoom(page, room.id);
      const viewer = viewerOf(page);
      await viewer.getByRole('button', { name: 'ビューワーを閉じる' }).click();
      await expect(viewer.locator('.viewer-markdown')).toHaveCount(0);
      await viewer.getByRole('button', { name: 'ビューワーを開く' }).click();
      await expect(viewer.locator('.viewer-markdown')).toBeVisible();
      await expect.poll(async () => (await viewer.boundingBox())?.width).toBeGreaterThan(VIEWER_MIN_WIDTH_PX);
    });

    test('[11-42] ビューア幅リサイズ', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom({ messages: ['リサイズする'], sendOptions: { createLibrary: true } });
      await loginAs('user');
      await openRoom(page, room.id);
      const viewer = viewerOf(page);
      const handle = viewer.getByRole('separator', { name: 'ビューワーの幅を変更' });
      await expect(handle).toBeVisible();

      /** ハンドルを左右にドラッグして、ビューアの幅を返す。左へ動かすほど広がる。 */
      async function dragBy(deltaX: number): Promise<number> {
        const box = await handle.boundingBox();
        if (!box) throw new Error('リサイズのハンドルの位置を取れません');
        const startX = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await page.mouse.move(startX, y);
        await page.mouse.down();
        await page.mouse.move(startX + deltaX, y, { steps: 10 });
        await page.mouse.up();
        return (await viewer.boundingBox())?.width ?? 0;
      }

      const before = (await viewer.boundingBox())?.width ?? 0;
      const widened = await dragBy(-150);
      expect(widened).toBeGreaterThan(before + 100);
      // 範囲の下限（280px）・上限（1018px）で止まる
      expect(await dragBy(1000)).toBeGreaterThanOrEqual(VIEWER_MIN_WIDTH_PX - WIDTH_TOLERANCE_PX);
      expect(await viewer.boundingBox().then((box) => box?.width ?? 0)).toBeLessThanOrEqual(VIEWER_MIN_WIDTH_PX + WIDTH_TOLERANCE_PX);
      expect(await dragBy(-2000)).toBeLessThanOrEqual(VIEWER_MAX_WIDTH_PX + WIDTH_TOLERANCE_PX);
      expect(await viewer.boundingBox().then((box) => box?.width ?? 0)).toBeGreaterThanOrEqual(VIEWER_MAX_WIDTH_PX - WIDTH_TOLERANCE_PX);
    });

    /** ライブラリが 2 件あるルームを用意する。 */
    async function roomWithTwoLibraries(makeRoom: (options?: MakeRoomOptions) => Promise<{ id: string }>) {
      return makeRoom({ messages: ['ライブラリ1', 'ライブラリ2'], sendOptions: { createLibrary: true } });
    }

    test('[11-43] ドキュメント切替', async ({ loginAs, page, makeRoom }) => {
      const room = await roomWithTwoLibraries(makeRoom);
      await loginAs('user');
      await openRoom(page, room.id);
      const current = await viewerLibraryNumber(page);
      await viewerTitleButton(page).click();
      const items = page.getByRole('menuitem').filter({ hasText: LIBRARY_TITLE_PREFIX });
      await expect(items).toHaveCount(2);
      await items.filter({ hasNotText: `${LIBRARY_TITLE_PREFIX}${current}` }).first().click();
      const switched = await viewerLibraryNumber(page);
      expect(switched).not.toBe(current);
      // タイトルと本文が選んだライブラリのものになる
      await expect(viewerOf(page).locator('.viewer-markdown')).toContainText(`${LIBRARY_TITLE_PREFIX}${switched}`);
    });

    test('[11-44] 複数ライブラリ切替', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom({ messages: ['ライブラリ1', 'ライブラリ2', 'ライブラリ3'], sendOptions: { createLibrary: true } });
      await loginAs('user');
      await openRoom(page, room.id);
      await viewerTitleButton(page).click();
      const items = page.getByRole('menuitem').filter({ hasText: LIBRARY_TITLE_PREFIX });
      await expect(items).toHaveCount(3);
      const titles = (await items.allInnerTexts()).map((title) => title.trim());
      await viewerTitleButton(page).click();
      // 各ライブラリを順に選び、内容が切り替わることを確かめる
      for (const title of titles) {
        await viewerTitleButton(page).click();
        await page.getByRole('menuitem', { name: title }).click();
        await expect(viewerTitleButton(page)).toContainText(title);
        await expect(viewerOf(page).locator('.viewer-markdown')).toContainText(title);
      }
    });

    test('[11-45] Markdownコンテンツ表示', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom({ messages: ['Markdownを表示'], sendOptions: { createLibrary: true } });
      await loginAs('user');
      await openRoom(page, room.id);
      const markdown = viewerOf(page).locator('.viewer-markdown');
      await expect(markdown.getByRole('heading', { level: 1 })).toContainText(LIBRARY_TITLE_PREFIX);
      await expect(markdown.getByRole('heading', { level: 2, name: '概要' })).toBeVisible();
      await expect(markdown.getByText('これはエコーで作った本文です')).toBeVisible();
      await expect(markdown.getByRole('listitem')).toHaveCount(2);
      await expect(markdown.getByRole('table')).toBeVisible();
      // ```chart:bar がグラフ（SVG）として描画される
      await expect(markdown.locator('.chart-block svg')).toBeVisible();
    });

    test('[11-46] 新しいタブで開く', async ({ loginAs, page, context, makeRoom }) => {
      const room = await makeRoom({ messages: ['新しいタブで開く'], sendOptions: { createLibrary: true } });
      await loginAs('user');
      await openRoom(page, room.id);
      await viewerOf(page).getByTestId('library-summary-more-button').click();
      const popupPromise = context.waitForEvent('page');
      await page.getByRole('menuitem', { name: 'ビューワーを新しいタブで開く' }).click();
      const popup = await popupPromise;
      await popup.waitForLoadState();
      await expect(popup).toHaveURL(new RegExp(`/chat/viewer/${room.id}`));
      await expect(popup.locator('.viewer-markdown')).toContainText(LIBRARY_TITLE_PREFIX);
    });

    test('[11-47] ライブラリに保存', async ({ loginAs, page, makeRoom, chatApi, uniqueId }) => {
      const room = await makeRoom({ messages: ['ライブラリに保存'], sendOptions: { createLibrary: true } });
      await loginAs('user');
      await openRoom(page, room.id);
      const name = uniqueId('saved');
      await viewerOf(page).getByTestId('library-summary-more-button').click();
      await page.getByTestId('library-save-button').click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('ライブラリに保存').first()).toBeVisible();
      await dialog.getByRole('textbox').first().fill(name);
      await dialog.getByRole('button', { name: '保存', exact: true }).click();
      await expect(dialog).toBeHidden();
      // 保存したライブラリが一覧にある
      const api = await chatApi('user');
      const found = await api.get('/api/libraries', { params: { page: 0, size: 100 } });
      expect(await found.text()).toContain(name);
    });

    /** 「PDF保存」で開く印刷用のウィンドウ（ライブラリの内容が写される）を待つ。 */
    async function expectPrintWindow(page: Page, trigger: () => Promise<void>): Promise<void> {
      // 内容の読み込み前に押すと、空の内容が写される
      await expect(viewerOf(page).locator('.viewer-markdown')).toContainText(LIBRARY_TITLE_PREFIX);
      const popupPromise = page.context().waitForEvent('page');
      await trigger();
      const popup = await popupPromise;
      await expect(popup.locator('body')).toContainText(LIBRARY_TITLE_PREFIX);
      await expect(popup.locator('body')).toContainText('概要');
    }

    test('[11-48] PDF保存', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom({ messages: ['PDF保存'], sendOptions: { createLibrary: true } });
      await loginAs('user');
      await openRoom(page, room.id);
      await expectPrintWindow(page, async () => {
        await viewerOf(page).getByTestId('library-summary-more-button').click();
        await page.getByRole('menuitem', { name: '表示中の内容をPDFで保存' }).click();
      });
    });

    test('[11-49] Markdown内ボタンからPDF保存', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom({ messages: ['Markdown内のボタン'], sendOptions: { createLibrary: true } });
      await loginAs('user');
      await openRoom(page, room.id);
      await expectPrintWindow(page, async () => {
        await viewerOf(page).locator('.viewer-markdown').getByRole('button', { name: 'PDF保存' }).click();
      });
    });
  });

  test.describe('モバイルのビューア', () => {
    test.use({ viewport: MOBILE_VIEWPORT });

    test('[11-50] モバイルビューア非表示（サイドパネル）', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom({ messages: ['モバイル'], sendOptions: { createLibrary: true } });
      await loginAs('user');
      const chat = await openRoom(page, room.id);
      await expect(chat.assistantMessages).toHaveCount(1);
      await expect(viewerOf(page)).toBeHidden();
    });

    /** ヘッダーの「その他」から「ビューワーを開く」を選び、モバイルのビューアのモーダルを出す。 */
    async function openMobileViewer(page: Page): Promise<Locator> {
      await page.locator('header').getByRole('button', { name: 'その他' }).click();
      await page.getByRole('menuitem', { name: 'ビューワーを開く' }).click();
      const modal = page.getByRole('dialog', { name: 'ビューア' });
      await expect(modal).toBeVisible();
      return modal;
    }

    test('[11-51] モバイルビューア表示（ヘッダーメニュー）', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom({ messages: ['モバイルのビューア'], sendOptions: { createLibrary: true } });
      await loginAs('user');
      await openRoom(page, room.id);
      const modal = await openMobileViewer(page);
      await expect(modal.locator('.viewer-markdown')).toContainText(LIBRARY_TITLE_PREFIX);
      // 画面の下から出る（モーダルの下端が画面の下端）
      const box = await modal.locator('div.absolute.bottom-0').boundingBox();
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeCloseTo(MOBILE_VIEWPORT.height, -1);
    });

    test('[11-52] モバイルビューア閉じる（背景）', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom({ messages: ['背景で閉じる'], sendOptions: { createLibrary: true } });
      await loginAs('user');
      await openRoom(page, room.id);
      const modal = await openMobileViewer(page);
      // ビューアの上に見えている背景（オーバーレイ）をクリックする
      await page.mouse.click(MOBILE_VIEWPORT.width / 2, 8);
      await expect(modal).toBeHidden();
      await expect(page.getByTestId('chat-input-textarea')).toBeVisible();
    });

    test('[11-53] モバイルビューア閉じる（ボタン）', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom({ messages: ['ボタンで閉じる'], sendOptions: { createLibrary: true } });
      await loginAs('user');
      await openRoom(page, room.id);
      const modal = await openMobileViewer(page);
      await modal.getByRole('button', { name: 'ビューワーを閉じる' }).click();
      await expect(modal).toBeHidden();
      await expect(page.getByTestId('chat-input-textarea')).toBeVisible();
    });
  });

  test.describe('ビューア専用ページ', () => {
    test('[11-54] ビューア専用ページ表示', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom({ messages: ['専用ページ'], sendOptions: { createLibrary: true } });
      await loginAs('user');
      await page.goto(`/chat/viewer/${room.id}`);
      await expect(page.locator('.viewer-markdown')).toContainText(LIBRARY_TITLE_PREFIX);
      // ライブラリの一覧が読み込まれている（タイトルのメニューに出る）
      await page.getByRole('button', { name: '資料を切り替え' }).click();
      await expect(page.getByRole('menuitem').filter({ hasText: LIBRARY_TITLE_PREFIX })).toHaveCount(1);
    });

    test('[11-55] 専用ページ：新タブ項目非表示', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom({ messages: ['専用ページのメニュー'], sendOptions: { createLibrary: true } });
      await loginAs('user');
      await page.goto(`/chat/viewer/${room.id}`);
      await expect(page.locator('.viewer-markdown')).toContainText(LIBRARY_TITLE_PREFIX);
      await page.getByTestId('library-summary-more-button').click();
      await expect(page.getByRole('menuitem', { name: 'ビューワーを新しいタブで開く' })).toBeHidden();
      await expect(page.getByTestId('library-save-button')).toBeVisible();
    });
  });

  test('[11-56] ルーム切替時ビューア更新', async ({ loginAs, page, makeRoom }) => {
    const roomA = await makeRoom({ messages: ['ルームAのライブラリ'], sendOptions: { createLibrary: true } });
    const roomB = await makeRoom({ messages: ['ルームBのライブラリ'], sendOptions: { createLibrary: true } });
    await loginAs('user');
    await openRoom(page, roomA.id);
    const numberA = await viewerLibraryNumber(page);
    // サイドバーのルーム一覧からチャットBに切り替える
    await page.locator('aside').first().getByText(roomB.name, { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/chat/${roomB.id}$`));
    await expect.poll(() => viewerLibraryNumber(page)).not.toBe(numberA);
    await expect(viewerOf(page).locator('.viewer-markdown')).toContainText(`${LIBRARY_TITLE_PREFIX}${await viewerLibraryNumber(page)}`);
  });

  test('[11-57] ライブラリ0件時', async ({ loginAs, page, makeRoom }) => {
    const room = await makeRoom({ messages: ['ライブラリのない質問'] });
    await loginAs('user');
    await openRoom(page, room.id);
    const viewer = viewerOf(page);
    // ライブラリがなければビューアは自動で折りたたまれ、タイトルも本文も空
    await expect.poll(async () => (await viewer.boundingBox())?.width).toBeLessThanOrEqual(VIEWER_COLLAPSED_WIDTH_PX + WIDTH_TOLERANCE_PX);
    await expect(viewer.locator('.viewer-markdown')).toHaveCount(0);
    await expect(viewer).not.toContainText(LIBRARY_TITLE_PREFIX);
  });

  test('[11-58] ビューア操作 Chrome', async ({ loginAs, page, makeRoom, browserName }) => {
    // このテストは Chromium（Chrome と同じ描画エンジン）で動く
    expect(browserName).toBe('chromium');
    const room = await makeRoom({ messages: ['ライブラリ1', 'ライブラリ2'], sendOptions: { createLibrary: true } });
    await loginAs('user');
    await openRoom(page, room.id);
    // 表示
    await expect(viewerOf(page).locator('.viewer-markdown')).toContainText(LIBRARY_TITLE_PREFIX);
    // 切替
    const current = await viewerLibraryNumber(page);
    await viewerTitleButton(page).click();
    await page.getByRole('menuitem').filter({ hasNotText: `${LIBRARY_TITLE_PREFIX}${current}` }).filter({ hasText: LIBRARY_TITLE_PREFIX }).first().click();
    expect(await viewerLibraryNumber(page)).not.toBe(current);
    // PDF 保存
    await expect(viewerOf(page).locator('.viewer-markdown')).toContainText(LIBRARY_TITLE_PREFIX);
    const popupPromise = page.context().waitForEvent('page');
    await viewerOf(page).getByTestId('library-summary-more-button').click();
    await page.getByRole('menuitem', { name: '表示中の内容をPDFで保存' }).click();
    const popup = await popupPromise;
    await expect(popup.locator('body')).toContainText(LIBRARY_TITLE_PREFIX);
  });

  // 連続送信（1〜10 回目 = 項番 59〜68）。N 回目の追加メッセージを送る前に、N-1 件のやりとりを API で済ませておく
  for (let count = 1; count <= CONSECUTIVE_SEND_COUNT; count++) {
    test(`[11-${59 + count - 1}] 連続送信-${count}`, async ({ loginAs, page, makeRoom, uniqueId }) => {
      const previous = Array.from({ length: count - 1 }, (_, i) => `これまでの質問${i + 1}`);
      const room = await makeRoom({ messages: ['最初の質問', ...previous] });
      await loginAs('user');
      const chat = await openRoom(page, room.id);
      await expect(chat.assistantMessages).toHaveCount(count);
      const text = uniqueId(`send${count}`);
      await chat.sendAndWaitForAnswer(text);
      await expect(chat.userMessages).toHaveCount(count + 1);
      await expect(chat.userMessages.last()).toContainText(text);
      await expect(chat.assistantMessages.last()).toContainText(`[echo] ${text}`);
    });
  }

  test('[11-69] 編集空文字', async ({ loginAs, page, makeRoom }) => {
    const room = await makeRoom({ messages: ['空にする質問'] });
    await loginAs('user');
    const chat = await openRoom(page, room.id);
    const user = chat.userMessages.first();
    await chat.actionButton(user, '編集').click();
    await user.locator('.chat-user-textarea').fill('');
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/api/messages')) requests.push(request.url());
    });
    await user.getByRole('button', { name: '再送信' }).click();
    // 送信されず、編集の状態のまま・質問も回答も増えない
    await expect(user.locator('.chat-user-textarea')).toBeVisible();
    await expect(chat.userMessages).toHaveCount(1);
    await expect(chat.assistantMessages).toHaveCount(1);
    expect(requests).toEqual([]);
  });

  test('[11-70] 編集最大長', async ({ loginAs, page, makeRoom }) => {
    const room = await makeRoom({ messages: ['最大長で編集する質問'] });
    await loginAs('user');
    const chat = await openRoom(page, room.id);
    const longText = 'あ'.repeat(LONG_EDIT_LENGTH);
    const user = chat.userMessages.first();
    await chat.actionButton(user, '編集').click();
    await user.locator('.chat-user-textarea').fill(longText);
    await user.getByRole('button', { name: '再送信' }).click();
    await expect(chat.userMessages.first().locator('.chat-user-text')).toHaveText(longText, { timeout: ANSWER_TIMEOUT_MS });
    await expect(chat.userMessages.first().locator('.chat-pagination-label')).toHaveText('2/2');
    await expect(chat.assistantMessages.first()).toContainText('[echo] あああ', { timeout: ANSWER_TIMEOUT_MS });
  });

  test('[11-71] チャット詳細 Chrome', async ({ loginAs, page, context, makeRoom, browserName }) => {
    // このテストは Chromium（Chrome と同じ描画エンジン）で動く
    expect(browserName).toBe('chromium');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const room = await makeRoom({ messages: ['Chromeで操作'] });
    await loginAs('user');
    const chat = await openRoom(page, room.id);
    await chat.sendAndWaitForAnswer('追加の質問');
    await chat.actionButton(chat.assistantMessages.last(), 'コピー').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('[echo] 追加の質問');
    await chat.actionButton(chat.assistantMessages.last(), '良い').click();
    await expect(chat.actionButton(chat.assistantMessages.last(), '良い')).toBeDisabled();
    const before = await answerCallNumber(chat.assistantMessages.first());
    await chat.actionButton(chat.assistantMessages.first(), '再生成').click();
    await expect.poll(() => answerCallNumber(chat.assistantMessages.first()).catch(() => before), { timeout: ANSWER_TIMEOUT_MS }).not.toBe(before);
  });

  test('[11-72] 一般ユーザー詳細操作', async ({ loginAs, page, makeRoom, uniqueId }) => {
    const room = await makeRoom({ messages: ['一般ユーザーの操作'] });
    await loginAs('user');
    const chat = await openRoom(page, room.id);
    await chat.sendAndWaitForAnswer(uniqueId('user-detail'));
    await chat.actionButton(chat.assistantMessages.last(), '良い').click();
    await expect(chat.actionButton(chat.assistantMessages.last(), '良い')).toBeDisabled();
    const before = await answerCallNumber(chat.assistantMessages.first());
    await chat.actionButton(chat.assistantMessages.first(), '再生成').click();
    await expect.poll(() => answerCallNumber(chat.assistantMessages.first()).catch(() => before), { timeout: ANSWER_TIMEOUT_MS }).not.toBe(before);
  });

  test('[11-73] 管理者詳細操作', async ({ loginAs, page, makeRoom, uniqueId }) => {
    const room = await makeRoom({ as: 'tenantAdmin', messages: ['管理者の操作'] });
    await loginAs('tenantAdmin');
    const chat = await openRoom(page, room.id);
    await chat.sendAndWaitForAnswer(uniqueId('admin-detail'));
    await chat.actionButton(chat.assistantMessages.last(), '良い').click();
    await expect(chat.actionButton(chat.assistantMessages.last(), '良い')).toBeDisabled();
    const before = await answerCallNumber(chat.assistantMessages.first());
    await chat.actionButton(chat.assistantMessages.first(), '再生成').click();
    await expect.poll(() => answerCallNumber(chat.assistantMessages.first()).catch(() => before), { timeout: ANSWER_TIMEOUT_MS }).not.toBe(before);
  });

  test.describe('モバイルのメニュー', () => {
    test.use({ viewport: MOBILE_VIEWPORT });

    async function openMoreMenu(page: Page): Promise<void> {
      await page.locator('header').getByRole('button', { name: 'その他' }).click();
    }

    test('[11-74] モバイルメニュー操作', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom({ messages: ['モバイルのメニュー'], sendOptions: { createLibrary: true } });
      await loginAs('user');
      const chat = await openRoom(page, room.id);

      // 名前変更
      await openMoreMenu(page);
      await page.getByRole('menuitem', { name: 'チャットの名前を変更' }).click();
      await expect(page.getByRole('dialog').getByRole('textbox')).toBeVisible();
      await page.getByRole('dialog').getByRole('button', { name: 'キャンセル' }).click();
      // ビューワーを開く
      await openMoreMenu(page);
      await page.getByRole('menuitem', { name: 'ビューワーを開く' }).click();
      await expect(page.getByRole('dialog', { name: 'ビューア' })).toBeVisible();
      await page.getByRole('dialog', { name: 'ビューア' }).getByRole('button', { name: 'ビューワーを閉じる' }).click();
      // 共有
      await openMoreMenu(page);
      await page.getByRole('menuitem', { name: '共有' }).click();
      await expect(page.getByRole('dialog').getByText(CHAT_TEXT.shareDialogTitle)).toBeVisible();
      await page.getByRole('dialog').getByRole('button', { name: 'キャンセル' }).click();
      // チャットを評価
      await openMoreMenu(page);
      await page.getByRole('menuitem', { name: 'チャットを評価' }).click();
      await expect(page.getByRole('dialog').getByText(CHAT_TEXT.ratingDialogTitle)).toBeVisible();
      await expect(chat.textarea).toBeAttached();
    });

    test('[11-75] モバイル名前変更', async ({ loginAs, page, makeRoom, uniqueId }) => {
      const room = await makeRoom({ messages: ['モバイルで名前変更'] });
      await loginAs('user');
      const chat = await openRoom(page, room.id);
      const newName = uniqueId('mobile');
      await openMoreMenu(page);
      await page.getByRole('menuitem', { name: 'チャットの名前を変更' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('textbox').fill(newName);
      await dialog.getByRole('button', { name: '保存' }).click();
      await expect(chat.headerTitle).toHaveText(newName);
    });

    test('[11-76] モバイル共有', async ({ loginAs, page, makeRoom }) => {
      const room = await makeRoom({ messages: ['モバイルで共有'] });
      await loginAs('user');
      await openRoom(page, room.id);
      await openMoreMenu(page);
      await page.getByRole('menuitem', { name: '共有' }).click();
      await expect(page.getByRole('dialog').getByText(CHAT_TEXT.shareDialogTitle)).toBeVisible();
    });
  });

  test('[11-77] チャット表示（アシスタントが削除済み）', async ({ loginAs, page, chatApi, trackRoom, uniqueId }) => {
    const adminApi = await chatApi('tenantAdmin');
    const userApi = await chatApi('user');
    // 一時的なアシスタントで質問し、そのあとアシスタントを削除する
    const assistant = await createAssistant(adminApi, uniqueId('temp-assistant'));
    let assistantDeleted = false;
    try {
      // ルームの既定のアシスタントは別のもの（既定として使われているアシスタントは削除できない）
      const room = await createRoom(userApi, uniqueId('deleted-assistant'));
      trackRoom(room.id);
      await sendMessage(userApi, room.id, '削除されるアシスタントへの質問', { assistantId: assistant.id });
      await deleteAssistant(adminApi, assistant.id);
      assistantDeleted = true;

      await loginAs('user');
      const chat = await openRoom(page, room.id);
      const answer = chat.assistantMessages.first();
      // 回答の上に「不明なアシスタント」と表示される
      await expect(answer.locator('.chat-message-sender')).toHaveText(CHAT_TEXT.unknownAssistant);
      // メッセージの編集ボタン・回答の再生成ボタンが非活性
      await expect(chat.actionButton(chat.userMessages.first(), '編集')).toBeDisabled();
      await expect(chat.actionButton(answer, '再生成')).toBeDisabled();
    } finally {
      if (!assistantDeleted) await deleteAssistant(adminApi, assistant.id);
    }
  });
});
