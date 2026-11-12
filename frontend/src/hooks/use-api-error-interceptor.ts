import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setApiErrorHandler } from '@/lib/api-client';
import { createApiErrorHandler } from '@/lib/api-error-handler';
import i18n from '@/lib/i18n';
import { ROUTES } from '@/lib/constants/routes';
import { useAuthStore } from '@/store/auth-store';

export interface UseApiErrorInterceptorOptions {
  /** 共通のエラートーストの表示。トースト（#278）を移植したら渡す。 */
  showErrorToast?: (message: string) => void;
}

/**
 * 移植元 errorInterceptor に相当する処理を api-client に登録する。
 * Router の中（BrowserRouter の子）で1回だけ呼ぶ。
 */
export function useApiErrorInterceptor({ showErrorToast }: UseApiErrorInterceptorOptions = {}): void {
  const navigate = useNavigate();
  const invalidateSession = useAuthStore((state) => state.invalidateSession);

  useEffect(() => {
    setApiErrorHandler(
      createApiErrorHandler({
        // useTranslation は翻訳ファイルの読み込みまで App を suspend させ、起動時のセッション確認を遅らせるため、
        // エラーが起きた時点で i18n から引く
        translate: (key) => i18n.t(key),
        showErrorToast,
        onUnauthorized: () => {
          invalidateSession();
          // 移植元はフルページ遷移だと「戻る」が効かなくなるため Router で遷移している。同じくする
          navigate(ROUTES.AUTH.LOGIN);
        },
      })
    );
    return () => setApiErrorHandler(null);
  }, [navigate, invalidateSession, showErrorToast]);
}
