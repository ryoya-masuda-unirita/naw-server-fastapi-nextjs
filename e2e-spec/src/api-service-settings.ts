import type { APIRequestContext } from '@playwright/test';
import { ApiError } from './api.ts';

/**
 * 管理コンソールの「サービス設定」系（15_アシスタント・16_チャット履歴・17_学習データ）のテストデータを API で作る・消すヘルパー。
 * 準備と後片付けだけに使い、テスト対象の操作そのものは画面から行う。
 * ID は backend/seed.sql・seed-demo.sql の値（専用環境に入っている）。
 */

/** seed.sql の動作確認用エンドポイント。Azure OpenAI（チャット）。クラウド(一般)のアシスタントの接続先。 */
export const SEED_CHAT_ENDPOINT_ID = '30000000000040008000000000000001';
/** seed.sql のローカルサーバー。セキュアのアシスタント・ローカルの学習先フォルダの接続先。 */
export const SEED_LOCAL_ENDPOINT_ID = 'e1000000000040008000000000000001';
/** seed.sql のベクトル DB と埋め込み。クラウドの学習先フォルダの接続先（2 つで 1 組）。 */
export const SEED_VDB_ENDPOINT_ID = 'e1000000000040008000000000000002';
export const SEED_EMBEDDING_ENDPOINT_ID = 'e1000000000040008000000000000003';

/** seed.sql の学習先フォルダ（読むだけ）。 */
export const SEED_LOCAL_FOLDER_ID = 'f1000000000040008000000000000001';
export const SEED_LOCAL_FOLDER_NAME = '学習データ確認用ローカルフォルダ';
export const SEED_CLOUD_FOLDER_ID = 'f1000000000040008000000000000002';
export const SEED_CLOUD_FOLDER_NAME = '学習データ確認用クラウドフォルダ';
export const SEED_EMPTY_FOLDER_ID = 'f1000000000040008000000000000003';
export const SEED_EMPTY_FOLDER_NAME = '学習データ確認用0件フォルダ';

/** seed.sql の「動作確認用グループ」（アシスタント確認用01 が所属）。 */
export const SEED_GROUP_ID = '20000000000040008000000000000001';

export type AssistantServerType = 'SECURE' | 'SAAS_CHAT' | 'SAAS_RAG';

export interface CreateAssistantOptions {
  name: string;
  type?: AssistantServerType;
  description?: string;
  includeHistory?: boolean;
  categoryIds?: string[];
  groups?: string[];
}

export interface CreatedAssistant {
  id: string;
  name: string;
}

export interface CreatedCategory {
  id: string;
  name: string;
}

async function expectOk(res: Awaited<ReturnType<APIRequestContext['post']>>, what: string): Promise<void> {
  if (!res.ok()) throw new ApiError(`${what}に失敗しました: ${res.status()} ${await res.text()}`);
}

/**
 * アシスタントを API で作る（POST /api/admin/assistants）。接続先は種別ごとの seed のエンドポイント。
 *
 * @param admin テナント管理者でログイン済みの APIRequestContext
 * @param options アシスタントの指定
 * @returns 作ったアシスタント
 * @throws ApiError 作成に失敗したとき
 */
export async function createAssistant(admin: APIRequestContext, options: CreateAssistantOptions): Promise<CreatedAssistant> {
  const type = options.type ?? 'SAAS_CHAT';
  const endpoints =
    type === 'SECURE'
      ? [{ id: SEED_LOCAL_ENDPOINT_ID, model: 'local-server-model' }]
      : [{ id: SEED_CHAT_ENDPOINT_ID, model: 'gpt-4o' }];
  const res = await admin.post('/api/admin/assistants', {
    data: {
      type,
      name: options.name,
      description: options.description ?? '',
      includeHistory: options.includeHistory ?? false,
      iconColor: '',
      groups: options.groups ?? [],
      categoryIds: options.categoryIds ?? [],
      indexId: type === 'SAAS_RAG' ? SEED_CLOUD_FOLDER_ID : '',
      endpoints: endpoints.map((endpoint) => ({ ...endpoint, url: '' })),
    },
  });
  await expectOk(res, `アシスタント ${options.name} の作成`);
  const body = (await res.json()) as { id: string };
  return { id: body.id, name: options.name };
}

/**
 * アシスタントを API で消す（後片付け）。すでにいなくてもエラーにしない。
 *
 * @param admin テナント管理者でログイン済みの APIRequestContext
 * @param assistant 消すアシスタント
 */
export async function deleteAssistant(admin: APIRequestContext, assistant: Pick<CreatedAssistant, 'id'>): Promise<void> {
  const res = await admin.delete(`/api/admin/assistants/${assistant.id}`);
  if (!res.ok() && res.status() !== 404) {
    throw new ApiError(`アシスタントの削除に失敗しました: ${res.status()} ${await res.text()}`);
  }
}

/**
 * 名前に前方一致で含まれるアシスタントを API で全部消す（画面から作ったものの後片付け）。
 *
 * @param admin テナント管理者でログイン済みの APIRequestContext
 * @param keyword 名前に含まれる文字列
 */
export async function deleteAssistantsByKeyword(admin: APIRequestContext, keyword: string): Promise<void> {
  const res = await admin.get('/api/admin/assistants', { params: { search: keyword, size: 100 } });
  await expectOk(res, 'アシスタント一覧の取得');
  const body = (await res.json()) as { content: { id: string; name: string }[] };
  for (const item of body.content) {
    if (item.name.includes(keyword)) await deleteAssistant(admin, item);
  }
}

/**
 * アシスタントのカテゴリを API で作る。
 *
 * @param admin テナント管理者でログイン済みの APIRequestContext
 * @param name カテゴリ名（16 文字以内）
 * @param description 説明
 * @returns 作ったカテゴリ
 * @throws ApiError 作成に失敗したとき
 */
export async function createCategory(admin: APIRequestContext, name: string, description = ''): Promise<CreatedCategory> {
  const res = await admin.post('/api/admin/assistant-categories', { data: { name, description } });
  await expectOk(res, `カテゴリ ${name} の作成`);
  const body = (await res.json()) as { id: string };
  return { id: body.id, name };
}

/**
 * アシスタントのカテゴリを API で消す（後片付け）。すでにいなくてもエラーにしない。
 *
 * @param admin テナント管理者でログイン済みの APIRequestContext
 * @param category 消すカテゴリ
 */
export async function deleteCategory(admin: APIRequestContext, category: Pick<CreatedCategory, 'id'>): Promise<void> {
  const res = await admin.delete(`/api/admin/assistant-categories/${category.id}`);
  if (!res.ok() && res.status() !== 404) {
    throw new ApiError(`カテゴリの削除に失敗しました: ${res.status()} ${await res.text()}`);
  }
}

/**
 * 名前に含まれる文字列でカテゴリを API で全部消す（画面から作ったものの後片付け）。
 *
 * @param admin テナント管理者でログイン済みの APIRequestContext
 * @param keyword 名前に含まれる文字列
 */
export async function deleteCategoriesByKeyword(admin: APIRequestContext, keyword: string): Promise<void> {
  const res = await admin.get('/api/admin/assistant-categories');
  await expectOk(res, 'カテゴリ一覧の取得');
  const body = (await res.json()) as { id: string; name: string }[] | { content: { id: string; name: string }[] };
  const items = Array.isArray(body) ? body : body.content;
  for (const item of items) {
    if (item.name.includes(keyword)) await deleteCategory(admin, item);
  }
}

export interface CreatedFolder {
  id: string;
  name: string;
}

/**
 * 学習先フォルダを API で作る（POST /api/admin/indexes）。
 *
 * @param admin テナント管理者でログイン済みの APIRequestContext
 * @param name フォルダ名
 * @param kind ローカル（LOCAL）かクラウド（SAAS_GLOBAL）
 * @param endpointIds 接続先のエンドポイント ID（既定は seed のもの）
 * @returns 作ったフォルダ
 * @throws ApiError 作成に失敗したとき
 */
export async function createFolder(
  admin: APIRequestContext,
  name: string,
  kind: 'LOCAL' | 'SAAS_GLOBAL',
  endpointIds?: string[]
): Promise<CreatedFolder> {
  const local = kind === 'LOCAL';
  const res = await admin.post('/api/admin/indexes', {
    data: {
      name,
      description: 'E2E 用',
      type: kind,
      endpointIds: endpointIds ?? (local ? [SEED_LOCAL_ENDPOINT_ID] : [SEED_VDB_ENDPOINT_ID, SEED_EMBEDDING_ENDPOINT_ID]),
      groupIds: [],
      ...(local ? { add: 'svc-spec-add', delete: 'svc-spec-delete', get: 'svc-spec-get' } : {}),
    },
  });
  await expectOk(res, `学習先フォルダ ${name} の作成`);
  const body = (await res.json()) as { id: string };
  return { id: body.id, name };
}

/**
 * 学習先フォルダを API で消す（後片付け）。すでにいなくてもエラーにしない。
 *
 * @param admin テナント管理者でログイン済みの APIRequestContext
 * @param folder 消すフォルダ
 */
export async function deleteFolder(admin: APIRequestContext, folder: Pick<CreatedFolder, 'id'>): Promise<void> {
  // 学習データが残っているフォルダは消せないことがあるので、先に中身を消す
  const files = await admin.get(`/api/admin/indexes/${folder.id}/files`, { params: { size: 100 } });
  if (files.ok()) {
    const body = (await files.json()) as { content: { id: string }[] };
    for (const file of body.content) await deleteFile(admin, folder.id, file);
  }
  const res = await admin.delete(`/api/admin/indexes/${folder.id}`);
  if (!res.ok() && res.status() !== 404) {
    throw new ApiError(`学習先フォルダの削除に失敗しました: ${res.status()} ${await res.text()}`);
  }
}

/**
 * 名前に含まれる文字列で学習先フォルダを API で全部消す（画面から作ったものの後片付け）。
 *
 * @param admin テナント管理者でログイン済みの APIRequestContext
 * @param keyword 名前に含まれる文字列
 */
export async function deleteFoldersByKeyword(admin: APIRequestContext, keyword: string): Promise<void> {
  const res = await admin.get('/api/admin/indexes', { params: { searchText: keyword, size: 100 } });
  await expectOk(res, '学習先フォルダ一覧の取得');
  const body = (await res.json()) as { content: { id: string; name: string }[] };
  for (const item of body.content) {
    if (item.name.includes(keyword)) await deleteFolder(admin, item);
  }
}

export interface CreatedFile {
  id: string;
  displayName: string;
}

/**
 * 学習データ（ファイル）を API で追加する（POST /api/admin/indexes/{id}/files）。
 *
 * @param admin テナント管理者でログイン済みの APIRequestContext
 * @param folderId 追加先のフォルダ ID
 * @param displayName 表示名
 * @param content ファイルの中身（テキスト）
 * @returns 追加したファイル
 * @throws ApiError 追加に失敗したとき
 */
export async function createFile(admin: APIRequestContext, folderId: string, displayName: string, content = 'E2E 用の学習データです。'): Promise<CreatedFile> {
  const res = await admin.post(`/api/admin/indexes/${folderId}/files`, {
    params: { name: `${displayName}.txt`, displayName, splitLength: 500 },
    multipart: { file: { name: `${displayName}.txt`, mimeType: 'text/plain', buffer: Buffer.from(content, 'utf-8') } },
  });
  await expectOk(res, `学習データ ${displayName} の追加`);
  const body = (await res.json()) as { id: string };
  return { id: body.id, displayName };
}

/**
 * 学習データ（ファイル）を API で消す（後片付け）。すでにいなくてもエラーにしない。
 *
 * @param admin テナント管理者でログイン済みの APIRequestContext
 * @param folderId フォルダ ID
 * @param file 消すファイル
 */
export async function deleteFile(admin: APIRequestContext, folderId: string, file: Pick<CreatedFile, 'id'>): Promise<void> {
  const res = await admin.delete(`/api/admin/indexes/${folderId}/files/${file.id}`);
  if (!res.ok() && res.status() !== 404) {
    throw new ApiError(`学習データの削除に失敗しました: ${res.status()} ${await res.text()}`);
  }
}

export interface CreatedTenantEndpoint {
  id: string;
  name: string;
}

/**
 * ワークスペース設定の接続先 API（テナントのエンドポイント）を API で追加する。
 *
 * @param admin テナント管理者でログイン済みの APIRequestContext
 * @param tenantId テナント ID
 * @param name 接続先の名前
 * @param type 接続先の種別（既定: ローカルサーバー）
 * @returns 追加した接続先
 * @throws ApiError 追加に失敗したとき
 */
export async function createTenantEndpoint(
  admin: APIRequestContext,
  tenantId: string,
  name: string,
  type: 'LOCAL_SERVER' | 'VDB' | 'AZURE_OPENAI_EMBEDDING' = 'LOCAL_SERVER'
): Promise<CreatedTenantEndpoint> {
  const res = await admin.post(`/api/admin/tenants/${tenantId}/endpoints`, {
    data: { type, endpointName: name, endpoint: 'https://e2e-spec.example.com', apiKey: 'dummy-api-key' },
  });
  await expectOk(res, `接続先 ${name} の追加`);
  const body = (await res.json()) as { id: string };
  return { id: body.id, name };
}

/**
 * 接続先 API を API で消す（後片付け）。すでにいなくてもエラーにしない。
 *
 * @param admin テナント管理者でログイン済みの APIRequestContext
 * @param tenantId テナント ID
 * @param endpoint 消す接続先
 */
export async function deleteTenantEndpoint(
  admin: APIRequestContext,
  tenantId: string,
  endpoint: Pick<CreatedTenantEndpoint, 'id'>
): Promise<void> {
  const res = await admin.delete(`/api/admin/tenants/${tenantId}/endpoints/${endpoint.id}`);
  if (!res.ok() && res.status() !== 404) {
    throw new ApiError(`接続先の削除に失敗しました: ${res.status()} ${await res.text()}`);
  }
}

/** seed.sql の「汎用アシスタント」。チャットルームの作成に使う。 */
export const SEED_ASSISTANT_ID = '10000000000040008000000000000001';

export interface CreatedRoom {
  id: string;
  name: string;
}

/**
 * チャットルームを API で作る（POST /api/rooms。ログイン中のユーザーのルームになる）。
 *
 * @param api ルームの持ち主でログイン済みの APIRequestContext
 * @param name チャット名
 * @returns 作ったルーム
 * @throws ApiError 作成に失敗したとき
 */
export async function createRoom(api: APIRequestContext, name: string): Promise<CreatedRoom> {
  const res = await api.post('/api/rooms', { data: { name, assistantId: SEED_ASSISTANT_ID } });
  await expectOk(res, `チャット ${name} の作成`);
  const body = (await res.json()) as { id: string };
  return { id: body.id, name };
}

/**
 * チャットルームを API で消す（後片付け。持ち主のコンテキストで呼ぶ）。すでにいなくてもエラーにしない。
 *
 * @param api ルームの持ち主でログイン済みの APIRequestContext
 * @param room 消すルーム
 */
export async function deleteRoom(api: APIRequestContext, room: Pick<CreatedRoom, 'id'>): Promise<void> {
  const res = await api.delete(`/api/rooms/${room.id}`);
  if (!res.ok() && res.status() !== 404) {
    throw new ApiError(`チャットの削除に失敗しました: ${res.status()} ${await res.text()}`);
  }
}
