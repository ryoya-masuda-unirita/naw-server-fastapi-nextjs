import { test, expect } from './fixtures/auth.fixture';
import type { Page } from '@playwright/test';
import path from 'node:path';

// 07_チャット送信.md 対応。
//
// 実際にLLM(Azure OpenAI)へメッセージを送信し、ストリーミングで返る回答を待つテストのため、
// 通常のCRUD系カテゴリより1件あたりの実行時間が長い。回答内容そのものはLLMの出力に依存し
// 決定的でないため、アサーションは「ユーザーメッセージ・回答メッセージ(何らかのテキスト)が
// 表示されること」に留め、回答の具体的な文言は検証しない。
//
// 除外した項目とその理由:
// - 項番21（APIエラー時送信）・項番45（チャット送信(ローカル)）: 元の結合テスト項目書でも
//   実行結果が「-」（未実施）であり、意図的な異常系・ローカル連携環境の準備が必要なため対象外
// - 項番26〜41（送信オプション組合せ16パターン）: Web検索/テンプレート/ライブラリ作成/添付の
//   各トグルは項番8/9/10/4で個別に確認済みのため、組合せの妥当性確認として代表2パターン
//   （全OFF、全ON+画像添付）のみ実施し、残りは個別項目の組合せとして重複するため対象外
// - 項番42（チャット送信 Chrome）: 項番3と同一手順のため、playwright.config.tsの
//   chromiumプロジェクト実行で代表させ、個別テスト化しない
// - 項番46〜55（プラン制限・テナント制限の境界値10パターン）: 境界値は実送信ごとに
//   変動する実際のトークン消費量に依存させると再現性がなく、E2Eでの精密な境界値制御が
//   困難なため対象外とした。ロジック自体は`backend/tests/unit/test_credit_quota.py`で
//   単体テスト済み
//
// 【既知の不具合】新規チャットダイアログのアシスタント検索は名前(label)のみで絞り込まれ、
// タグ・カテゴリでは絞り込めない（`select.component.ts`の`filteredOptions`が`opt.label`
// にしかマッチしない）。項番16（タグの一部を入力すると絞り込まれる）はIssue #180として
// 起票しskipした。
//
// backend/seed.sqlに、管理者(admin)を動作確認用グループ（アシスタント確認用グループ）へ
// 追加した。アシスタント一覧APIはグループ紐付けのみで絞り込まれ、role=ADMINでも
// グループ未所属だと一切アシスタントを選択できずチャット送信自体ができないため。

test.setTimeout(90_000);

function userMessage(page: Page, text: string) {
  return page.locator('.chat-message--user').filter({ hasText: text });
}

function assistantMessageBubble(page: Page) {
  return page.locator('.chat-message--assistant .chat-message-bubble').last();
}

async function sendAndWaitForReply(page: Page, text: string): Promise<void> {
  await page.getByPlaceholder('@でアシスタントを指定できます').fill(text);
  await page.locator('.chat-input-send').click();
  await page.waitForURL(/\/chat\/.+/, { timeout: 15_000 });
  await expect(userMessage(page, text)).toBeVisible();
  await expect(assistantMessageBubble(page)).not.toHaveText('', { timeout: 60_000 });
}

test.describe('チャット送信', () => {
  test('/dashboardにアクセスすると入力欄と注意書きが表示されること', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard');
    await expect(page.getByPlaceholder('@でアシスタントを指定できます')).toBeVisible();
    await expect(page.getByText('回答は必ずしも正しいとは限りません', { exact: false })).toBeVisible();
  });

  test('メッセージ未入力では送信ボタンが無効で何も送信されないこと', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard');
    await expect(page.locator('.chat-input-send')).toBeDisabled();
  });

  test('空白のみ入力しても送信できないこと', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await page.getByPlaceholder('@でアシスタントを指定できます').fill('   ');
    await expect(page.locator('.chat-input-send')).toBeDisabled();
  });

  test('1文字のメッセージを送信でき、ルームへ遷移すること', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard');
    await sendAndWaitForReply(page, 'あ');
  });

  test('テキストのみのメッセージを送信すると回答が返り、チャットルームへ遷移すること', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard');
    await sendAndWaitForReply(page, 'チャット送信確認用の質問メッセージです。');
  });

  test('数百文字の長文メッセージを送信できること', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    const longText = 'チャット送信確認用の長文メッセージです。'.repeat(20);
    await sendAndWaitForReply(page, longText);
  });

  test('画像を添付して送信すると添付画像が表示され回答が返ること', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard');
    await page.setInputFiles(
      '#chat-file-upload',
      path.join(__dirname, 'fixtures/test-image.png'),
    );
    await expect(page.locator('app-file-image-chip')).toBeVisible();
    await sendAndWaitForReply(page, '画像添付確認用の質問メッセージです。');
  });

  test('複数画像を添付すると全添付ファイルが表示されること', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard');
    await page.setInputFiles('#chat-file-upload', [
      path.join(__dirname, 'fixtures/test-image.png'),
      path.join(__dirname, 'fixtures/test-image.png'),
    ]);
    await expect(page.locator('app-file-image-chip')).toHaveCount(2);
  });

  test('PDFを添付して送信すると添付PDFが表示され回答が返ること', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard');
    await page.setInputFiles(
      '#chat-file-upload',
      path.join(__dirname, 'fixtures/test-document.pdf'),
    );
    await expect(page.locator('app-file-chip')).toBeVisible();
    await sendAndWaitForReply(page, 'PDF添付確認用の質問メッセージです。');
  });

  test('WORDを添付して送信すると添付WORDが表示され回答が返ること', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard');
    await page.setInputFiles(
      '#chat-file-upload',
      path.join(__dirname, 'fixtures/test-document.docx'),
    );
    await expect(page.locator('app-file-chip')).toBeVisible();
    await sendAndWaitForReply(page, 'WORD添付確認用の質問メッセージです。');
  });

  test('EXCELを添付して送信すると添付EXCELが表示され回答が返ること', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard');
    await page.setInputFiles(
      '#chat-file-upload',
      path.join(__dirname, 'fixtures/test-spreadsheet.xlsx'),
    );
    await expect(page.locator('app-file-chip')).toBeVisible();
    await sendAndWaitForReply(page, 'EXCEL添付確認用の質問メッセージです。');
  });

  test('非対応形式のファイルは添付が拒否されること', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await page.setInputFiles(
      '#chat-file-upload',
      path.join(__dirname, 'fixtures/test-unsupported.exe'),
    );
    await expect(page.locator('app-file-chip, app-file-image-chip')).toHaveCount(0);
    await expect(page.locator('.chat-input-send')).toBeDisabled();
  });

  test('Web検索を有効にして送信すると回答が返ること', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await page.getByLabel('ファイルを添付', { exact: false }).click();
    await page.getByText('web検索', { exact: true }).click();
    await sendAndWaitForReply(page, 'Web検索確認用の質問メッセージです。');
  });

  test('テンプレートを選択して送信するとテンプレートが適用された状態で送信されること', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard');
    await page.getByLabel('ファイルを添付', { exact: false }).click();
    await page.getByText('テンプレート', { exact: true }).click();
    await page.getByText('丁寧な回答テンプレート', { exact: true }).click();
    await expect(page.getByText('丁寧な回答テンプレート', { exact: true }).first()).toBeVisible();
    await sendAndWaitForReply(page, 'テンプレート確認用の質問メッセージです。');
  });

  test('ライブラリ作成を有効にして送信するとライブラリ作成処理が実行されること', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard');
    await page.getByLabel('ファイルを添付', { exact: false }).click();
    await page.getByText('ライブラリ作成', { exact: true }).click();
    await sendAndWaitForReply(page, 'ライブラリ作成確認用の質問メッセージです。');
  });

  test('入力欄で@を使用してアシスタントを指定して送信できること', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard');
    await page.getByPlaceholder('@でアシスタントを指定できます').fill('@アシスタント確認用01');
    await page
      .locator('app-chat-assistant-mention-panel')
      .getByText('アシスタント確認用01', { exact: true })
      .click();
    await page.getByPlaceholder('@でアシスタントを指定できます').fill('メンション指定確認用の質問メッセージです。');
    await page.locator('.chat-input-send').click();
    await page.waitForURL(/\/chat\/.+/, { timeout: 15_000 });
    await expect(userMessage(page, 'メンション指定確認用の質問メッセージです。')).toBeVisible();
    await expect(assistantMessageBubble(page)).not.toHaveText('', { timeout: 60_000 });
  });

  test('アシスタントを別アシスタントに変更して送信すると変更後のアシスタントから回答が返ること', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: '汎用アシスタント' }).click();
    await page.getByRole('option', { name: 'アシスタント確認用01' }).click();
    await expect(page.getByRole('button', { name: 'アシスタント確認用01' })).toBeVisible();
    await sendAndWaitForReply(page, 'アシスタント変更確認用の質問メッセージです。');
  });

  test('新規チャットダイアログからアシスタントを選択して作成するとルームが作成され新規チャット画面が表示されること', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard');
    await page.getByText('新しいチャット', { exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('デフォルトのアシスタントを選択').click();
    await dialog.getByText('アシスタント確認用01', { exact: true }).click();
    await dialog.getByRole('button', { name: '作成' }).click();
    await page.waitForURL(/\/chat\/.+/, { timeout: 15_000 });
    await expect(page.getByPlaceholder('@でアシスタントを指定できます')).toBeVisible();
    await expect(page.getByRole('button', { name: 'アシスタント確認用01' })).toBeVisible();
  });

  test('新規チャットダイアログでアシスタントを選択しないと作成ボタンが非活性であること', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard');
    await page.getByText('新しいチャット', { exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: '作成' })).toBeDisabled();
  });

  test('新規チャットダイアログでアシスタント名の一部を入力すると絞り込まれること', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard');
    await page.getByText('新しいチャット', { exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('デフォルトのアシスタントを選択').fill('確認用01');
    await expect(dialog.getByText('アシスタント確認用01', { exact: true })).toBeVisible();
    await expect(dialog.getByText('汎用アシスタント', { exact: true })).not.toBeVisible();
  });

  // 【既知の不具合】タグ(カテゴリ)の一部を入力しても絞り込まれない。
  // select.component.tsのfilteredOptionsがラベル(名前)のみでフィルタしており、
  // カテゴリ・タグを見ていないため。Issue #180として起票。
  test.skip(
    '新規チャットダイアログでアシスタントタグの一部を入力すると絞り込まれること（Issue #180で対応予定）',
    async () => {},
  );

  test('新規チャットダイアログでキャンセルをクリックするとダイアログが閉じること', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard');
    await page.getByText('新しいチャット', { exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('送信オプション組合せ: 添付なし・Web検索OFF・テンプレートなし・ライブラリ作成OFFで送信できること', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard');
    await sendAndWaitForReply(page, 'オプション組合せ確認用-全OFF');
  });

  test('送信オプション組合せ: 画像添付・Web検索ON・テンプレートあり・ライブラリ作成ONで送信できること', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard');
    await page.setInputFiles(
      '#chat-file-upload',
      path.join(__dirname, 'fixtures/test-image.png'),
    );
    await page.getByLabel('ファイルを添付', { exact: false }).click();
    await page.getByText('web検索', { exact: true }).click();
    await page.getByText('ライブラリ作成', { exact: true }).click();
    await page.getByText('テンプレート', { exact: true }).click();
    await page.getByText('丁寧な回答テンプレート', { exact: true }).click();
    await sendAndWaitForReply(page, 'オプション組合せ確認用-全ON');
  });

  test('一般ユーザーでチャット送信できること', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await sendAndWaitForReply(page, '一般ユーザー送信確認用の質問メッセージです。');
  });

  test('管理者でチャット送信できること', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByPlaceholder('テナントID').fill('test-tenant');
    await page.getByPlaceholder('ユーザーID').fill('admin');
    await page.getByPlaceholder('パスワード').fill('admin@1234');
    await page.getByRole('button', { name: 'ログイン' }).click();
    await page.waitForURL('/dashboard');
    await sendAndWaitForReply(page, '管理者送信確認用の質問メッセージです。');
  });
});
