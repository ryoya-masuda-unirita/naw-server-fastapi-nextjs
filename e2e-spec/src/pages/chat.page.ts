import { expect, type Locator, type Page } from '@playwright/test';

/** チャット画面（/dashboard・/chat/new・/chat/:roomId）の Page Object。 */

export const DASHBOARD_PATH = '/dashboard';
export const CHAT_NEW_PATH = '/chat/new';
export const chatRoomPath = (roomId: string): string => `/chat/${roomId}`;
export const chatViewerPath = (roomId: string): string => `/chat/viewer/${roomId}`;

/** 画面の文言（public/i18n/ja.json の CHAT.*・HEADER.*。移植元の ja.json と同じ）。 */
export const CHAT_TEXT = {
  disclaimer: '回答は必ずしも正しいとは限りません。重要な情報は確認するようにしてください。',
  placeholder: '@でアシスタントを指定できます',
  newChatTitle: '新しいチャットを作成',
  searchModalTitle: 'チャットを検索',
  searchEmpty: '表示するデータがありません',
  unknownAssistant: '不明なアシスタント',
  unresolvedActionDisabled: 'アシスタントが存在しないため、編集・再生成はできません',
  editNote: 'このメッセージを編集すると、回答を新しく生成します。生成後は回答を切り替えることができます。',
  shareDialogTitle: 'チャットを共有',
  ratingDialogTitle: 'チャットを評価',
  viewerEmpty: 'ライブラリがありません',
  creditLimitTitle: '1人あたりのクレジット上限に達したため、チャットのご利用を制限しています',
} as const;

/** 画面のビューポート（Tailwind の md = 768px を境に、サイドのビューアとモバイルのメニューが切り替わる）。 */
export const DESKTOP_VIEWPORT = { width: 1280, height: 800 } as const;
export const MOBILE_VIEWPORT = { width: 390, height: 800 } as const;

export class ChatPage {
  readonly page: Page;
  readonly textarea: Locator;
  readonly sendButton: Locator;
  readonly addMenuButton: Locator;
  readonly addMenu: Locator;
  readonly fileInput: Locator;
  readonly assistantSelectButton: Locator;
  readonly assistantOptions: Locator;
  readonly messageItems: Locator;
  readonly userMessages: Locator;
  readonly assistantMessages: Locator;
  readonly headerTitle: Locator;
  readonly dialog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.textarea = page.getByTestId('chat-input-textarea');
    this.sendButton = page.getByTestId('chat-send-button');
    this.addMenuButton = page.getByTestId('chat-attach-button');
    this.addMenu = page.locator('.chat-multi-panel[role=menu]').first();
    this.fileInput = page.getByTestId('chat-attach-file-input');
    this.assistantSelectButton = page.getByTestId('assistant-select-button');
    this.assistantOptions = page.getByTestId('assistant-option-item');
    this.messageItems = page.getByTestId('chat-message-item');
    this.userMessages = page.locator('article.chat-message--user');
    this.assistantMessages = page.locator('article.chat-message--assistant');
    this.headerTitle = page.locator('.chat-page-header-title');
    this.dialog = page.getByRole('dialog');
  }

  /** 新規チャット画面（/dashboard）を開く。 */
  async gotoDashboard(): Promise<void> {
    await this.page.goto(DASHBOARD_PATH);
    await expect(this.textarea).toBeVisible();
    await this.expectAssistantsLoaded();
  }

  /**
   * 入力欄のアシスタント選択に、既定のアシスタントの名前が出るまで待つ。
   * アシスタント一覧の取得前に送ると、アシスタントが決まらずルームを作れない（送信しても画面が変わらない）ため、送る前に必ず待つ。
   */
  async expectAssistantsLoaded(): Promise<void> {
    await expect(this.assistantSelectButton).not.toHaveText('');
  }

  /** ルームの画面を開き、メッセージの読み込みが終わるまで待つ。 */
  async gotoRoom(roomId: string): Promise<void> {
    await this.page.goto(chatRoomPath(roomId));
    await expect(this.textarea).toBeVisible();
    await expect(this.page.locator('.chat-main')).toBeVisible();
    await this.expectAssistantsLoaded();
  }

  /** 入力欄に質問を入れる（送信はしない）。 */
  async typeMessage(text: string): Promise<void> {
    await this.textarea.fill(text);
  }

  /** 質問を入力して送信ボタンを押す。 */
  async send(text: string): Promise<void> {
    await this.typeMessage(text);
    await this.sendButton.click();
  }

  /** ルームの画面で質問を送り、回答の表示（ストリーミングの完了）まで待つ。 */
  async sendAndWaitForAnswer(text: string): Promise<void> {
    const answersBefore = await this.assistantMessages.count();
    await this.send(text);
    await this.expectAnswerCount(answersBefore + 1);
  }

  /** 回答が `count` 件になり、すべて生成が終わっている（読み込み中の表示がない）。 */
  async expectAnswerCount(count: number): Promise<void> {
    await expect(this.assistantMessages).toHaveCount(count);
    await expect(this.assistantMessages.last().getByTestId('chat-response-container')).toBeVisible();
  }

  /** 「＋」メニューを開く。 */
  async openAddMenu(): Promise<void> {
    await this.addMenuButton.click();
    await expect(this.addMenu).toBeVisible();
  }

  /** 「＋」メニューの項目（添付・web検索・ライブラリ作成・テンプレート）。 */
  addMenuItem(name: RegExp | string): Locator {
    return this.page.getByRole('menuitem', { name });
  }

  /** 「＋」メニューから web 検索を有効にする。 */
  async enableWebSearch(): Promise<void> {
    await this.openAddMenu();
    await this.addMenuItem('web検索').click();
    await this.closeAddMenu();
  }

  /** 「＋」メニューからライブラリ作成を有効にする。 */
  async enableCreateLibrary(): Promise<void> {
    await this.openAddMenu();
    await this.page.getByTestId('chat-create-library-toggle').click();
    await this.closeAddMenu();
  }

  /** 「＋」メニューからテンプレートを選ぶ（PC 幅では右に出るサブメニューから）。 */
  async selectTemplate(templateName: string): Promise<void> {
    await this.openAddMenu();
    await this.addMenu.getByRole('menuitem', { name: /テンプレート/ }).click();
    await this.page.getByRole('menu').getByText(templateName, { exact: true }).first().click();
    await this.closeAddMenu();
  }

  /** メニューを閉じる（入力欄の外側をクリックする）。 */
  async closeAddMenu(): Promise<void> {
    if (await this.addMenu.isVisible()) await this.page.locator('.chat-main header').first().click({ position: { x: 5, y: 5 } });
    await expect(this.addMenu).toBeHidden();
  }

  /** ファイルを添付する（画面の `<input type=file>` に直接渡す。選択ダイアログは使わない）。 */
  async attachFiles(files: { name: string; mimeType: string; buffer: Buffer }[]): Promise<void> {
    await this.fileInput.setInputFiles(files);
  }

  /** 入力欄の右下のボタンでアシスタントを選ぶ。 */
  async selectAssistant(name: string): Promise<void> {
    await this.assistantSelectButton.click();
    await this.assistantOptions.filter({ hasText: name }).first().click();
    await expect(this.assistantSelectButton).toContainText(name);
  }

  /** メッセージ（質問 / 回答）の操作ボタン。 */
  actionButton(article: Locator, label: string): Locator {
    return article.getByRole('button', { name: label, exact: true });
  }
}
