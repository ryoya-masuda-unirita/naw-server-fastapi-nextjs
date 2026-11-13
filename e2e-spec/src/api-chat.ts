import type { APIRequestContext } from '@playwright/test';
import { ApiError } from './api.ts';
import type { TestFile } from './test-files.ts';

/**
 * チャット（ルーム・メッセージ）のテストデータを API で準備するヘルパー（07_チャット送信・08_チャット検索・11_チャット詳細で使う）。
 * 回答は backend がテナントの接続先（e2e-spec では LLM のモック。`docker/llm_mock.py`）から取るため、
 * 回答の本文は `[echo] <質問>` になる。
 */

/** seed の「汎用アシスタント」（test-tenant の既定のアシスタント。モックの接続先につながる）。 */
export const DEFAULT_ASSISTANT_ID = '10000000000040008000000000000001';
export const DEFAULT_ASSISTANT_NAME = '汎用アシスタント';
/** seed のもう 1 つのアシスタント（アシスタントの切り替えの確認用）。 */
export const SECOND_ASSISTANT_ID = 'a1000000000040008000000000000001';
export const SECOND_ASSISTANT_NAME = 'アシスタント確認用01';

/** LLM のモックの回答の接頭辞（`[echo] <質問>`）。 */
export const ECHO_PREFIX = '[echo] ';
/** この文字列を質問に含めると、モックが HTTP 500 を返す。 */
export const MOCK_ERROR_MARKER = '[MOCK_ERROR]';
/** この文字列を質問に含めると、モックが 1 チャンクごとに少し待つ（ストリーミング中の確認用）。 */
export const MOCK_SLOW_MARKER = '[MOCK_SLOW]';

export interface CreatedRoom {
  id: string;
  name: string;
  assistantId: string;
}

export interface SentMessage {
  /** POST /api/messages が返したメッセージ ID（質問と回答の組）。 */
  messageId: string;
  question: string;
  answer: string;
}

export interface SendOptions {
  assistantId?: string;
  /** 直前のメッセージ ID。省略すると新しい会話の起点（親なし）。 */
  parentMessageId?: string | null;
  useWebSearch?: boolean;
  additionalPrompt?: string;
  createLibrary?: boolean;
  /** 再生成・編集のときの回答（message_content）の ID。 */
  messageContentId?: string;
  /** 添付するファイル。 */
  files?: TestFile[];
  /** true なら、回答の取得が失敗しても（LLM のエラーなど）エラーにせず、回答を空にして返す。エラー状態のメッセージを用意するときに使う。 */
  tolerateAnswerError?: boolean;
}

async function expectOk(res: Awaited<ReturnType<APIRequestContext['post']>>, what: string): Promise<void> {
  if (!res.ok()) throw new ApiError(`${what}に失敗しました: ${res.status()} ${await res.text()}`);
}

/**
 * ルームを API で作る。
 *
 * @param api ログイン済みの APIRequestContext（ルームの所有者）
 * @param name ルーム名
 * @param assistantId 既定のアシスタント
 * @returns 作ったルーム
 * @throws ApiError 作成に失敗したとき
 */
export async function createRoom(
  api: APIRequestContext,
  name: string,
  assistantId: string = DEFAULT_ASSISTANT_ID
): Promise<CreatedRoom> {
  const res = await api.post('/api/rooms', { data: { name, assistantId } });
  await expectOk(res, `ルーム ${name} の作成`);
  const body = (await res.json()) as { id: string; name: string };
  return { id: body.id, name: body.name, assistantId };
}

/**
 * ルームを API で削除する（テストの後片付け）。すでにないときはエラーにしない。
 *
 * @param api ログイン済みの APIRequestContext（ルームの所有者）
 * @param roomId 削除するルーム
 * @throws ApiError 404 以外で失敗したとき
 */
export async function deleteRoom(api: APIRequestContext, roomId: string): Promise<void> {
  const res = await api.delete(`/api/rooms/${roomId}`);
  if (!res.ok() && res.status() !== 404) {
    throw new ApiError(`ルームの削除に失敗しました: ${res.status()} ${await res.text()}`);
  }
}

/**
 * メッセージ（質問）を作って回答を受け取る。画面の送信と同じく POST /api/messages → POST /api/messages/content（SSE）で行う。
 *
 * @param api ログイン済みの APIRequestContext
 * @param roomId ルーム
 * @param text 質問
 * @param options アシスタント・ツール・ライブラリ作成など
 * @returns 作ったメッセージ ID と、質問・回答
 * @throws ApiError 作成・回答の取得に失敗したとき
 */
export async function sendMessage(
  api: APIRequestContext,
  roomId: string,
  text: string,
  options: SendOptions = {}
): Promise<SentMessage> {
  const assistantId = options.assistantId ?? DEFAULT_ASSISTANT_ID;
  const tools = options.useWebSearch ? [{ name: 'web_search' }] : undefined;
  const created = await api.post('/api/messages', {
    data: {
      roomId,
      assistantId,
      parentMessageId: options.parentMessageId ?? null,
      messageText: text,
      tools,
      promptTemplateContent: options.additionalPrompt,
      isCreateLibrary: options.createLibrary,
    },
  });
  await expectOk(created, 'メッセージの作成');
  const messageId = parseMessageId(await created.text());

  const textData = {
    assistantId,
    messageId,
    messageContentId: options.messageContentId,
    userInput: text,
    additionalPrompt: options.additionalPrompt,
    tools,
    createLibrary: options.createLibrary ? true : undefined,
  };
  // 同じ名前（attachmentFiles）のパートを複数送るため、Record ではなく FormData で組み立てる
  const form = new FormData();
  form.append('textData', new Blob([JSON.stringify(textData)], { type: 'application/json' }), 'textData');
  for (const file of options.files ?? []) {
    form.append('attachmentFiles', new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }), file.name);
  }
  const content = await api.post('/api/messages/content', { headers: { Accept: 'text/event-stream' }, multipart: form });
  if (!content.ok() && options.tolerateAnswerError) return { messageId, question: text, answer: '' };
  await expectOk(content, '回答の取得');
  return { messageId, question: text, answer: extractAnswer(await content.text()) };
}

function parseMessageId(body: string): string {
  const trimmed = body.trim();
  try {
    const parsed = JSON.parse(trimmed) as { data?: { id?: string }; id?: string } | string;
    if (typeof parsed === 'string') return parsed;
    const id = parsed.data?.id ?? parsed.id;
    if (id) return id;
  } catch {
    // JSON でなければ ID そのもの
  }
  return trimmed;
}

/** SSE の text_delta をつなげた回答を取り出す。 */
function extractAnswer(sse: string): string {
  let answer = '';
  for (const line of sse.split('\n')) {
    if (!line.startsWith('data:')) continue;
    try {
      const event = JSON.parse(line.slice('data:'.length).trim()) as { type?: string; text?: string };
      if (event.type === 'text_delta' && event.text) answer += event.text;
    } catch {
      // JSON でない行は無視する
    }
  }
  return answer;
}

/**
 * ルームの一覧を API で取る（名前の部分一致）。
 *
 * @param api ログイン済みの APIRequestContext
 * @param name 部分一致の検索語
 * @returns 見つかったルームの ID と名前
 */
export async function searchRooms(api: APIRequestContext, name: string): Promise<{ id: string; name: string }[]> {
  const res = await api.get('/api/rooms', { params: { name, page: 0, size: 100 } });
  await expectOk(res, 'ルームの検索');
  const body = (await res.json()) as { content: { id: string; name: string }[] };
  return body.content;
}

export interface CreatedAssistant {
  id: string;
  name: string;
}

/**
 * アシスタントを管理者の API で作る（一般ユーザーのグループ「動作確認用グループ」に公開し、モックの接続先につなぐ）。
 *
 * @param adminApi テナント管理者でログイン済みの APIRequestContext
 * @param name アシスタントの表示名
 * @returns 作ったアシスタント
 * @throws ApiError 作成に失敗したとき
 */
export async function createAssistant(adminApi: APIRequestContext, name: string): Promise<CreatedAssistant> {
  const endpoint = await findChatEndpoint(adminApi);
  const res = await adminApi.post('/api/admin/assistants', {
    data: {
      name,
      type: 'SAAS_CHAT',
      endpoints: [{ id: endpoint.id, model: 'gpt-4o' }],
      groups: [SPEC_GROUP_ID],
      description: 'e2e-spec 用の一時的なアシスタント',
      includeHistory: false,
    },
  });
  await expectOk(res, `アシスタント ${name} の作成`);
  const body = (await res.json()) as { id: string };
  return { id: body.id, name };
}

/** seed の「動作確認用グループ」（user01 が所属）。 */
const SPEC_GROUP_ID = '20000000000040008000000000000001';

async function findChatEndpoint(adminApi: APIRequestContext): Promise<{ id: string }> {
  const res = await adminApi.get('/api/admin/assistants/endpoints/SAAS_CHAT');
  await expectOk(res, 'エンドポイントの取得');
  const endpoints = (await res.json()) as { id: string; type: string }[];
  // モックの LLM につながる Azure OpenAI の接続先（Bedrock は専用環境からつながらない）
  const first = endpoints.find((endpoint) => endpoint.type === 'AZURE_OPENAI_CHAT');
  if (!first) throw new ApiError('AZURE_OPENAI_CHAT のエンドポイントが seed にありません');
  return first;
}

/**
 * アシスタントを管理者の API で削除する。すでにないときはエラーにしない。
 *
 * @param adminApi テナント管理者でログイン済みの APIRequestContext
 * @param assistantId 削除するアシスタント
 * @throws ApiError 404 以外で失敗したとき
 */
export async function deleteAssistant(adminApi: APIRequestContext, assistantId: string): Promise<void> {
  const res = await adminApi.delete(`/api/admin/assistants/${assistantId}`);
  if (!res.ok() && res.status() !== 404) {
    throw new ApiError(`アシスタントの削除に失敗しました: ${res.status()} ${await res.text()}`);
  }
}
