import type { APIRequestContext } from '@playwright/test';
import { ApiError } from './api.ts';

/**
 * 09_ライブラリ用の API ヘルパー。ライブラリはチャットの回答から作る機能なので、
 * メッセージ（ルームごと作られる）→ ライブラリのスタブ → 名前・タグ・共有先の更新、の順で API から作る。
 */

/** ライブラリの元にするメッセージのアシスタント（seed-demo の「汎用アシスタント」）。 */
const BASE_ASSISTANT_ID = '10000000000040008000000000000001';

export interface TestLibrary {
  id: string;
  messageId: string;
  title: string;
}

export interface TestLibraryTag {
  id: string;
  name: string;
}

async function expectOk(res: Awaited<ReturnType<APIRequestContext['post']>>, what: string): Promise<void> {
  if (!res.ok()) throw new ApiError(`${what}に失敗しました: ${res.status()} ${await res.text()}`);
}

/**
 * ライブラリを API で作る。
 *
 * @param api ライブラリの作成者でログイン済みの APIRequestContext
 * @param options title: ライブラリ名、tagIds: 付けるタグの ID、groupIds: 共有するグループの ID
 * @returns 作ったライブラリ
 * @throws ApiError 作成に失敗したとき
 */
export async function createLibrary(
  api: APIRequestContext,
  options: { title: string; tagIds?: string[]; groupIds?: string[] },
): Promise<TestLibrary> {
  const messageRes = await api.post('/api/messages', { data: { assistantId: BASE_ASSISTANT_ID, isCreateLibrary: true } });
  await expectOk(messageRes, 'ライブラリ元のメッセージ作成');
  const { id: messageId } = (await messageRes.json()) as { id: string };

  const stubRes = await api.post('/api/libraries', { data: { messageId } });
  await expectOk(stubRes, 'ライブラリの作成');
  const { data } = (await stubRes.json()) as { data: { id: string } };

  const updateRes = await api.put(`/api/libraries/${data.id}`, {
    data: { name: options.title, groups: options.groupIds ?? [], tags: options.tagIds ?? [] },
  });
  await expectOk(updateRes, 'ライブラリ名の設定');
  return { id: data.id, messageId, title: options.title };
}

/**
 * ライブラリと、その元のメッセージを消す（テストの後片付け）。すでにないときはエラーにしない。
 *
 * @param api ライブラリの作成者でログイン済みの APIRequestContext
 * @param library 消すライブラリ
 */
export async function deleteLibrary(api: APIRequestContext, library: TestLibrary): Promise<void> {
  const res = await api.delete(`/api/libraries/${library.id}`);
  if (!res.ok() && res.status() !== 404) throw new ApiError(`ライブラリの削除に失敗しました: ${res.status()} ${await res.text()}`);
  await api.delete(`/api/messages/${library.messageId}`);
}

/**
 * ライブラリのタグを API で作る（テナント管理者）。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @param name タグ名
 * @param description タグの説明
 * @returns 作ったタグ
 * @throws ApiError 作成に失敗したとき
 */
export async function createLibraryTag(api: APIRequestContext, name: string, description?: string): Promise<TestLibraryTag> {
  const res = await api.post('/api/admin/library-tags', { data: { name, description } });
  await expectOk(res, `タグ ${name} の作成`);
  const body = (await res.json()) as { id: string; name: string };
  return { id: body.id, name: body.name };
}

/**
 * ライブラリのタグを API で消す（テストの後片付け）。すでにないときはエラーにしない。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @param ids 消すタグの ID
 */
export async function deleteLibraryTags(api: APIRequestContext, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  // 一括削除 API は本文つきの DELETE。すでに消えている ID が混じると失敗するので、結果は見ない
  await api.delete('/api/admin/library-tags', { data: { ids } });
}

/**
 * 接頭辞で始まる名前のタグをまとめて消す（画面で作ったタグの後片付け）。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @param namePrefix 消すタグ名の接頭辞
 */
export async function deleteLibraryTagsByPrefix(api: APIRequestContext, namePrefix: string): Promise<void> {
  const res = await api.get('/api/admin/library-tags', { params: { search: namePrefix, size: 100 } });
  if (!res.ok()) return;
  const page = (await res.json()) as { content: { id: string; name: string }[] };
  await deleteLibraryTags(
    api,
    page.content.filter((tag) => tag.name.startsWith(namePrefix)).map((tag) => tag.id),
  );
}
