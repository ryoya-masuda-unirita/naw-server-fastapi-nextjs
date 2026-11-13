import type { APIRequestContext } from '@playwright/test';
import { ApiError } from './api.ts';

/**
 * テンプレート（プロンプトテンプレート）の API ヘルパー（カテゴリ 19 用）。
 * 画面の操作の前に必要なテストデータを作る・テストの後で消すために使う。テスト対象の操作そのものには使わない。
 */

const TEMPLATES_PATH = '/api/admin/prompt-templates';
const GROUPS_PATH = '/api/admin/groups';
/** グループ（チーム）一覧を全件取るためのサイズ。 */
const GROUPS_PAGE_SIZE = 1000;

export interface TemplateInput {
  name: string;
  systemPrompt: string;
  description?: string;
  /** 所属させるチーム（グループ）の ID。 */
  groupIds?: string[];
}

export interface CreatedTemplate {
  id: string;
  name: string;
  systemPrompt: string;
}

async function expectOk(res: Awaited<ReturnType<APIRequestContext['post']>>, what: string): Promise<void> {
  if (!res.ok()) throw new ApiError(`${what}に失敗しました: ${res.status()} ${await res.text()}`);
}

/**
 * テンプレートを作り、指定のチームに所属させる。
 *
 * @param admin テナント管理者でログイン済みの API
 * @param input テンプレートの内容
 * @returns 作ったテンプレート
 * @throws ApiError 作成・チームへの追加に失敗したとき
 */
export async function createTemplate(admin: APIRequestContext, input: TemplateInput): Promise<CreatedTemplate> {
  const res = await admin.post(TEMPLATES_PATH, {
    data: { name: input.name, systemPrompt: input.systemPrompt, description: input.description ?? '' },
  });
  await expectOk(res, `テンプレート ${input.name} の作成`);
  const created = (await res.json()) as { id: string };
  for (const groupId of input.groupIds ?? []) {
    const link = await admin.post(`${GROUPS_PATH}/${groupId}/prompt-templates`, { data: { templateIds: [created.id] } });
    await expectOk(link, `テンプレート ${input.name} のチームへの追加`);
  }
  return { id: created.id, name: input.name, systemPrompt: input.systemPrompt };
}

/**
 * テンプレートを削除する。すでにないときはエラーにしない（テストの中で消していても後片付けで呼べる）。
 *
 * @param admin テナント管理者でログイン済みの API
 * @param id テンプレート ID
 * @throws ApiError 404 以外で失敗したとき
 */
export async function deleteTemplate(admin: APIRequestContext, id: string): Promise<void> {
  const res = await admin.delete(`${TEMPLATES_PATH}/${id}`);
  if (!res.ok() && res.status() !== 404) throw new ApiError(`テンプレートの削除に失敗しました: ${res.status()} ${await res.text()}`);
}

/**
 * チーム（グループ）の名前から ID を引く。
 *
 * @param admin テナント管理者でログイン済みの API
 * @param name チーム名
 * @returns グループ ID
 * @throws ApiError 見つからないとき
 */
export async function findGroupId(admin: APIRequestContext, name: string): Promise<string> {
  const res = await admin.get(GROUPS_PATH, { params: { size: GROUPS_PAGE_SIZE } });
  await expectOk(res, 'チーム一覧の取得');
  const body = (await res.json()) as { data: { id: string; name: string }[] };
  const group = body.data.find((item) => item.name === name);
  if (!group) throw new ApiError(`チーム ${name} が見つかりません`);
  return group.id;
}
