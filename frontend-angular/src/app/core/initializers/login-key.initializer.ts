import { inject, provideAppInitializer } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { STORAGE_KEYS } from '@core/constants';
import { ToastService } from '@core/services/toast.service';
import { AuthStore } from '@core/stores/auth.store';
import { TranslateService } from '@ngx-translate/core';

/**
 * URL クエリパラメータ `loginkey` を検出したら、router 初期ナビゲーションより前に
 * naw-server の `POST /auth/login-key` で認証する。injection context 内で実行すること。
 *
 * - ルーティング前に動くため、認証済みユーザーでも noAuthGuard に阻まれず再認証（切替）できる。
 * - `window.location.search` を直接読むので、リダイレクトのクエリ保持挙動に依存しない。
 * - loginkey 不在時は即 return し通常起動を妨げない。
 */
export async function runLoginKeyInitializer(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const loginKey = params.get('loginkey');
  if (!loginKey) return;

  // テナントをサブドメインから解決できない環境向けに tenantId クエリも受け付ける
  // （authInterceptor が X-Tenant-ID ヘッダを付与できるようにする）。
  const tenantId = params.get('tenantId');
  if (tenantId) {
    sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, tenantId);
  }

  // inject() は最初の await より前（同期コンテキスト内）で呼ぶ必要がある。
  const authStore = inject(AuthStore);
  const toast = inject(ToastService);
  const translate = inject(TranslateService);
  const ok = await authStore.loginWithKey(loginKey);
  if (!ok) {
    // APP_INITIALIZER は並列実行されるため、instant() だと翻訳未ロード時にキーがそのまま返る。
    const message = await firstValueFrom(translate.get('AUTH.LOGIN_KEY.ERROR'));
    toast.error(message);
  }

  // URL から認証パラメータを除去（履歴・ブックマークに鍵を残さない）。
  params.delete('loginkey');
  params.delete('tenantId');
  const qs = params.toString();
  history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
}

export function provideLoginKeyInitializer() {
  return provideAppInitializer(() => runLoginKeyInitializer());
}
