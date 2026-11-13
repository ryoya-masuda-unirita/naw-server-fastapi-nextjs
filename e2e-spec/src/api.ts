import { request, type APIRequestContext } from '@playwright/test';
import { API_URL } from './env.ts';
import { TENANT_ID, USERS, type SeedUser } from './users.ts';

/**
 * backend の API を直接呼ぶヘルパー。テストデータの準備と後片付けに使う（画面操作の代わりに使い、テスト対象の操作そのものには使わない）。
 * セッションは Cookie で持つため、ログインした APIRequestContext をそのまま使い回す。
 */

export class ApiError extends Error {}

/** 作ったユーザーの初期パスワードを変えるときの、テナントのパスワードポリシー（12 文字以上・大小英字・数字・記号）を満たす値。 */
export const DEFAULT_NEW_PASSWORD = 'Spec@Pass1234Ab';

export interface CreatedUser {
  /** backend の users.id。 */
  id: string;
  loginId: string;
  password: string;
  tenantId: string;
  /** issueLoginKey: true で作ったときの平文のログインキー（作成時の応答でしか取れない）。 */
  loginKey?: string;
}

export interface CreateUserOptions {
  loginId: string;
  name?: string;
  role?: 'ADMIN' | 'USER';
  /** true ならログインキーを発行する。 */
  issueLoginKey?: boolean;
  /** 初回のパスワード設定まで済ませた状態にするか（既定 true）。false なら初回ログイン（パスワード設定が必要）の状態のまま。 */
  activate?: boolean;
  /** activate のときに設定するパスワード。既定は DEFAULT_NEW_PASSWORD。 */
  password?: string;
  tenantId?: string;
}

/**
 * 認証なしの API コンテキストを作る。使い終わったら dispose する。
 *
 * @param tenantId X-Tenant-ID ヘッダーに付けるテナント ID
 * @returns APIRequestContext
 */
export async function newApiContext(tenantId: string = TENANT_ID): Promise<APIRequestContext> {
  return request.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Tenant-ID': tenantId } });
}

/**
 * API でログインした APIRequestContext を作る（セッション Cookie 入り）。使い終わったら dispose する。
 *
 * @param user ログインするユーザー
 * @returns ログイン済みの APIRequestContext
 * @throws ApiError ログインに失敗したとき
 */
export async function loginApi(user: Pick<SeedUser, 'tenantId' | 'loginId' | 'password'>): Promise<APIRequestContext> {
  const api = await newApiContext(user.tenantId);
  const res = await api.post('/auth/login', { data: { username: user.loginId, password: user.password } });
  if (!res.ok()) {
    await api.dispose();
    throw new ApiError(`API ログインに失敗しました（${user.loginId}）: ${res.status()} ${await res.text()}`);
  }
  return api;
}

/**
 * テナント管理者としてログインした APIRequestContext を作る。
 *
 * @param tenantId テナント ID
 * @returns ログイン済みの APIRequestContext
 */
export async function loginAsTenantAdmin(tenantId: string = TENANT_ID): Promise<APIRequestContext> {
  return loginApi({ ...USERS.tenantAdmin, tenantId });
}

async function expectOk(res: Awaited<ReturnType<APIRequestContext['post']>>, what: string): Promise<void> {
  if (!res.ok()) throw new ApiError(`${what}に失敗しました: ${res.status()} ${await res.text()}`);
}

/**
 * ログインできるユーザーを API で作る（POST /api/admin/users → 初期パスワードを設定）。
 *
 * @param admin テナント管理者でログイン済みの APIRequestContext
 * @param options ユーザーの指定
 * @returns 作ったユーザー（パスワードは設定後のもの）
 * @throws ApiError 作成・パスワード設定に失敗したとき
 */
export async function createUser(admin: APIRequestContext, options: CreateUserOptions): Promise<CreatedUser> {
  const tenantId = options.tenantId ?? TENANT_ID;
  const res = await admin.post('/api/admin/users', {
    data: {
      loginId: options.loginId,
      name: options.name ?? options.loginId,
      role: options.role ?? 'USER',
      issueLoginKey: options.issueLoginKey ?? false,
    },
  });
  await expectOk(res, `ユーザー ${options.loginId} の作成`);
  const body = (await res.json()) as { id: string; initialPassword: string; loginKey: string | null };

  let password = body.initialPassword;
  if (options.activate ?? true) {
    password = options.password ?? DEFAULT_NEW_PASSWORD;
    const anonymous = await newApiContext(tenantId);
    try {
      const reset = await anonymous.post('/auth/password/reset', {
        data: { loginId: options.loginId, oldPassword: body.initialPassword, newPassword: password },
      });
      await expectOk(reset, `ユーザー ${options.loginId} の初期パスワード設定`);
    } finally {
      await anonymous.dispose();
    }
  }
  return { id: body.id, loginId: options.loginId, password, tenantId, loginKey: body.loginKey ?? undefined };
}

/**
 * ユーザーを API で削除する（テストの後片付け）。すでにいなくてもエラーにしない。
 *
 * @param admin テナント管理者でログイン済みの APIRequestContext
 * @param user 削除するユーザー
 */
export async function deleteUser(admin: APIRequestContext, user: Pick<CreatedUser, 'loginId'>): Promise<void> {
  const res = await admin.delete(`/api/admin/users/${encodeURIComponent(user.loginId)}`);
  // 404 は、テストの中ですでに削除した場合。なお削除 API の {user_id} は users.id ではなくログイン ID
  if (!res.ok() && res.status() !== 404) {
    throw new ApiError(`ユーザーの削除に失敗しました: ${res.status()} ${await res.text()}`);
  }
}

export interface SessionUser {
  /** users.id ではなくログイン ID（GET /api/auth の id）。 */
  id: string;
  name: string;
  role: string;
}

/**
 * いまのセッションのユーザーを API（GET /api/auth）で取る。ブラウザのコンテキストの request（page.request）を渡すと、
 * 画面でログインしている人が誰かを確かめられる（Cookie を共有するため）。
 *
 * @param context Cookie を持つ APIRequestContext
 * @param tenantId X-Tenant-ID ヘッダーに付けるテナント ID
 * @returns ログイン中のユーザー。未ログインなら null
 * @throws ApiError 401・403 以外で失敗したとき
 */
export async function getSessionUser(context: APIRequestContext, tenantId: string = TENANT_ID): Promise<SessionUser | null> {
  const res = await context.get(`${API_URL}/api/auth`, { headers: { 'X-Tenant-ID': tenantId } });
  if (res.status() === 401 || res.status() === 403) return null;
  if (!res.ok()) throw new ApiError(`セッションの取得に失敗しました: ${res.status()} ${await res.text()}`);
  return (await res.json()) as SessionUser;
}
