import type { APIRequestContext } from '@playwright/test';
import { ApiError } from './api.ts';
import { TENANT_ID } from './users.ts';

/**
 * 12_ワークスペース設定用の API ヘルパー。テナント名の取得・復元と、API（ローカルサーバーの接続先）の準備・後片付けに使う。
 * ワークスペース設定で追加・編集・削除できるのは、接続先が Local Server（`LOCAL_SERVER`）のものだけ。
 */

export const LOCAL_SERVER_TYPE = 'LOCAL_SERVER';

export interface TestEndpoint {
  id: string;
  endpointName: string;
  endpoint: string;
}

async function expectOk(res: Awaited<ReturnType<APIRequestContext['post']>>, what: string): Promise<void> {
  if (!res.ok()) throw new ApiError(`${what}に失敗しました: ${res.status()} ${await res.text()}`);
}

/**
 * ワークスペース（テナント）の名前を API で取る。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @returns ワークスペース名
 * @throws ApiError 取得に失敗したとき
 */
export async function getTenantName(api: APIRequestContext): Promise<string> {
  const res = await api.get('/api/admin/tenants');
  await expectOk(res, 'ワークスペース情報の取得');
  return ((await res.json()) as { tenantName: string }).tenantName;
}

/**
 * ワークスペース名を API で変える（テスト後に元の名前へ戻すために使う）。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @param tenantName 設定する名前
 * @throws ApiError 更新に失敗したとき
 */
export async function setTenantName(api: APIRequestContext, tenantName: string): Promise<void> {
  const res = await api.patch(`/api/admin/tenants/${TENANT_ID}`, { data: { tenantName } });
  await expectOk(res, 'ワークスペース名の更新');
}

/**
 * API（エンドポイント）を API で追加する。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @param endpointName 表示名
 * @param endpoint 接続先 URL
 * @returns 追加したエンドポイント
 * @throws ApiError 追加に失敗したとき
 */
export async function createEndpoint(api: APIRequestContext, endpointName: string, endpoint: string): Promise<TestEndpoint> {
  const res = await api.post(`/api/admin/tenants/${TENANT_ID}/endpoints`, {
    data: { type: LOCAL_SERVER_TYPE, endpointName, endpoint, apiKey: 'SpecApiKey0123456789abcdefghijkl' },
  });
  await expectOk(res, `API ${endpointName} の追加`);
  const body = (await res.json()) as { id: string };
  return { id: body.id, endpointName, endpoint };
}

/**
 * API（エンドポイント）を API で消す（テストの後片付け）。すでにないときはエラーにしない。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @param endpointId 消すエンドポイントの ID
 */
export async function deleteEndpoint(api: APIRequestContext, endpointId: string): Promise<void> {
  const res = await api.delete(`/api/admin/tenants/${TENANT_ID}/endpoints/${endpointId}`);
  if (!res.ok() && res.status() !== 404) throw new ApiError(`APIの削除に失敗しました: ${res.status()} ${await res.text()}`);
}

/**
 * 表示名が接頭辞で始まる API をすべて消す（画面で追加した API の後片付け）。
 *
 * @param api テナント管理者でログイン済みの APIRequestContext
 * @param namePrefix 表示名の接頭辞
 */
export async function deleteEndpointsByPrefix(api: APIRequestContext, namePrefix: string): Promise<void> {
  const res = await api.get(`/api/admin/tenants/${TENANT_ID}/endpoints`);
  if (!res.ok()) return;
  const endpoints = (await res.json()) as { id: string; endpointName: string }[];
  for (const endpoint of endpoints.filter((item) => item.endpointName.startsWith(namePrefix))) {
    await deleteEndpoint(api, endpoint.id);
  }
}
