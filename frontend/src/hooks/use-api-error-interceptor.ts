import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { setApiErrorHandler } from '@/lib/api-client';
import { createApiErrorHandler } from '@/lib/api-error-handler';
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
  const { t } = useTranslation();
  const invalidateSession = useAuthStore((state) => state.invalidateSession);

  useEffect(() => {
    setApiErrorHandler(
      createApiErrorHandler({
        translate: (key) => t(key),
        showErrorToast,
        onUnauthorized: () => {
          invalidateSession();
          // 移植元はフルページ遷移だと「戻る」が効かなくなるため Router で遷移している。同じくする
          navigate(ROUTES.AUTH.LOGIN);
        },
      })
    );
    return () => setApiErrorHandler(null);
  }, [navigate, t, invalidateSession, showErrorToast]);
}
