import type { APIRequestContext } from '@playwright/test';
import { ApiError, createUser, deleteUser, type CreatedUser } from './api.ts';

/**
 * 14_チーム管理用の API ヘルパー。チーム（グループ）と、その所属ユーザー・アシスタント・テンプレートを API で準備する。
 * テストのチームは専用の名前（接頭辞つき）で作り、終わったら消す。
 */

export interface TestGroup {
  id: string;
  name: string;
}

export interface TestAssistant {
  id: string;
  name: string;
}

/** クラウド(一般)のアシスタントを作るときの接続先（seed-demo の Azure OpenAI）とモデル。 */
const CLOUD_GENERAL_ENDPOINT_ID = '30000000000040008000000000000001';
const CLOUD_GENERAL_MODEL = 'gpt-4o';

export interface TestTemplate {
  id: string;
  name: string;
}

async function expectOk(res: Awaited<ReturnType<APIRequestContext['post']>>, what: string): Promise<void> {
  if (!res.ok()) throw new ApiError(`${what}に失敗しました: ${res.status()} ${await res.text()}`);
}

/**
 * チームを API で作る。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @param name チーム名
 * @returns 作ったチーム
 * @throws ApiError 作成に失敗したとき
 */
export async function createGroup(api: APIRequestContext, name: string): Promise<TestGroup> {
  const res = await api.post('/api/admin/groups', { data: { name } });
  await expectOk(res, `チーム ${name} の作成`);
  const body = (await res.json()) as { id: string; name: string };
  return { id: body.id, name: body.name };
}

/**
 * チームを API で消す（テストの後片付け）。すでにないときはエラーにしない。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @param groupId 消すチームの ID
 */
export async function deleteGroup(api: APIRequestContext, groupId: string): Promise<void> {
  const res = await api.delete(`/api/admin/groups/${groupId}`);
  if (!res.ok() && res.status() !== 404) throw new ApiError(`チームの削除に失敗しました: ${res.status()} ${await res.text()}`);
}

/**
 * 画面で作ったチームを、チーム名の接頭辞で探してすべて消す。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @param namePrefix 消すチーム名の接頭辞
 */
export async function deleteGroupsByPrefix(api: APIRequestContext, namePrefix: string): Promise<void> {
  const res = await api.get('/api/admin/groups', { params: { q: namePrefix, size: 100 } });
  if (!res.ok()) return;
  const body = (await res.json()) as { data: { id: string; name: string }[] };
  for (const group of body.data.filter((item) => item.name.startsWith(namePrefix))) {
    await deleteGroup(api, group.id);
  }
}

/**
 * チームにユーザーを追加する。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @param groupId チームの ID
 * @param userIds 追加するユーザーの ID（users.id）
 * @throws ApiError 追加に失敗したとき
 */
export async function addGroupUsers(api: APIRequestContext, groupId: string, userIds: string[]): Promise<void> {
  const res = await api.post(`/api/admin/groups/${groupId}/users`, { data: { userIds } });
  await expectOk(res, 'チームへのユーザー追加');
}

/**
 * チーム内の権限（チームの管理者かどうか）を変える。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @param groupId チームの ID
 * @param userId ユーザーの ID（users.id）
 * @param groupAdmin チームの管理者にするか
 * @throws ApiError 更新に失敗したとき
 */
export async function setGroupUserRole(
  api: APIRequestContext,
  groupId: string,
  userId: string,
  groupAdmin: boolean,
): Promise<void> {
  const res = await api.patch(`/api/admin/groups/${groupId}/users/${userId}`, { data: { groupAdmin } });
  await expectOk(res, 'チーム内の権限変更');
}

/**
 * チームにアシスタントを追加する。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @param groupId チームの ID
 * @param assistantIds 追加するアシスタントの ID
 * @throws ApiError 追加に失敗したとき
 */
export async function addGroupAssistants(api: APIRequestContext, groupId: string, assistantIds: string[]): Promise<void> {
  const res = await api.post(`/api/admin/groups/${groupId}/assistants`, { data: { assistantIds } });
  await expectOk(res, 'チームへのアシスタント追加');
}

/**
 * チームにテンプレートを追加する。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @param groupId チームの ID
 * @param templateIds 追加するテンプレートの ID
 * @throws ApiError 追加に失敗したとき
 */
export async function addGroupTemplates(api: APIRequestContext, groupId: string, templateIds: string[]): Promise<void> {
  const res = await api.post(`/api/admin/groups/${groupId}/prompt-templates`, { data: { templateIds } });
  await expectOk(res, 'チームへのテンプレート追加');
}

/**
 * テナントのアシスタントを名前で引いて、ID の対応表にする。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @returns アシスタント名 → ID
 * @throws ApiError 取得に失敗したとき
 */
export async function assistantIdsByName(api: APIRequestContext): Promise<Map<string, string>> {
  const res = await api.get('/api/admin/assistants', { params: { size: 100 } });
  await expectOk(res, 'アシスタント一覧の取得');
  const body = (await res.json()) as { content?: { id: string; name: string }[]; data?: { id: string; name: string }[] };
  const items = body.content ?? body.data ?? [];
  return new Map(items.map((item) => [item.name, item.id]));
}

/**
 * プロンプトテンプレートを API で作る。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @param name テンプレート名（32 文字以内）
 * @param systemPrompt システムプロンプト
 * @returns 作ったテンプレート
 * @throws ApiError 作成に失敗したとき
 */
export async function createTemplate(api: APIRequestContext, name: string, systemPrompt = 'テスト用のシステムプロンプト'): Promise<TestTemplate> {
  const res = await api.post('/api/admin/prompt-templates', { data: { name, description: `${name}の説明`, systemPrompt } });
  await expectOk(res, `テンプレート ${name} の作成`);
  const body = (await res.json()) as { id: string; name: string };
  return { id: body.id, name: body.name };
}

/**
 * プロンプトテンプレートを API で消す（テストの後片付け）。すでにないときはエラーにしない。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @param templateId 消すテンプレートの ID
 */
export async function deleteTemplate(api: APIRequestContext, templateId: string): Promise<void> {
  const res = await api.delete(`/api/admin/prompt-templates/${templateId}`);
  if (!res.ok() && res.status() !== 404) throw new ApiError(`テンプレートの削除に失敗しました: ${res.status()} ${await res.text()}`);
}

/**
 * テスト用ユーザーを並列でまとめて作る（チームのページ送りなど、多くのユーザーが要るとき）。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @param count 作る人数
 * @param loginIdFor 連番からログイン ID を作る関数
 * @param nameFor 連番から表示名を作る関数
 * @returns 作ったユーザー
 */
export async function createUsers(
  api: APIRequestContext,
  count: number,
  loginIdFor: (index: number) => string,
  nameFor: (index: number) => string,
): Promise<CreatedUser[]> {
  const indexes = Array.from({ length: count }, (_, index) => index);
  return Promise.all(indexes.map((index) => createUser(api, { loginId: loginIdFor(index), name: nameFor(index), activate: false })));
}

/**
 * まとめて作ったユーザーを消す。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @param users 消すユーザー
 */
export async function deleteUsers(api: APIRequestContext, users: Pick<CreatedUser, 'loginId'>[]): Promise<void> {
  await Promise.all(users.map((user) => deleteUser(api, user)));
}

/**
 * クラウド(一般)のアシスタントを API で作る（チームのアシスタントタブのページ送りなど、多くのアシスタントが要るとき）。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @param name アシスタント表示名
 * @param categoryIds 付けるカテゴリの ID
 * @returns 作ったアシスタント
 * @throws ApiError 作成に失敗したとき
 */
export async function createAssistant(api: APIRequestContext, name: string, categoryIds: string[] = []): Promise<TestAssistant> {
  const res = await api.post('/api/admin/assistants', {
    data: {
      name,
      type: 'SAAS_CHAT',
      endpoints: [{ id: CLOUD_GENERAL_ENDPOINT_ID, model: CLOUD_GENERAL_MODEL }],
      categoryIds,
    },
  });
  await expectOk(res, `アシスタント ${name} の作成`);
  const body = (await res.json()) as { id: string };
  return { id: body.id, name };
}

/**
 * アシスタントを API で消す（テストの後片付け）。すでにないときはエラーにしない。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @param assistantId 消すアシスタントの ID
 */
export async function deleteAssistant(api: APIRequestContext, assistantId: string): Promise<void> {
  const res = await api.delete(`/api/admin/assistants/${assistantId}`);
  if (!res.ok() && res.status() !== 404) throw new ApiError(`アシスタントの削除に失敗しました: ${res.status()} ${await res.text()}`);
}

/**
 * アシスタントのカテゴリを API で作る。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @param name カテゴリ名
 * @returns 作ったカテゴリ
 * @throws ApiError 作成に失敗したとき
 */
export async function createCategory(api: APIRequestContext, name: string): Promise<{ id: string; name: string }> {
  const res = await api.post('/api/admin/assistant-categories', { data: { name } });
  await expectOk(res, `カテゴリ ${name} の作成`);
  const body = (await res.json()) as { id: string };
  return { id: body.id, name };
}

/**
 * アシスタントのカテゴリを API で消す（テストの後片付け）。すでにないときはエラーにしない。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @param categoryId 消すカテゴリの ID
 */
export async function deleteCategory(api: APIRequestContext, categoryId: string): Promise<void> {
  const res = await api.delete(`/api/admin/assistant-categories/${categoryId}`);
  if (!res.ok() && res.status() !== 404) throw new ApiError(`カテゴリの削除に失敗しました: ${res.status()} ${await res.text()}`);
}
