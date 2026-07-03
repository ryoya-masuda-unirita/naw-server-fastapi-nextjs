import { HttpErrorResponse, HttpInterceptorFn, HttpStatusCode } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { API_PATHS, STORAGE_KEYS } from '@core/constants';
import { ROUTES } from '@core/constants/routes.config';
import { SKIP_GLOBAL_ERROR_TOAST } from '@core/interceptors/http-context.tokens';
import { ToastService } from '@core/services/toast.service';

function resolveErrorMessageKey(status: number): string {
  if (status === HttpStatusCode.Forbidden) return 'COMMON.MESSAGES.ERROR.FORBIDDEN';
  if (status === HttpStatusCode.NotFound) return 'COMMON.MESSAGES.ERROR.NOT_FOUND';
  if (status >= 500) return 'COMMON.MESSAGES.ERROR.SERVER_ERROR';
  return 'COMMON.MESSAGES.ERROR.GENERAL';
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toastService = inject(ToastService);
  const translate = inject(TranslateService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const isLoginPath = req.url.includes(API_PATHS.AUTH.LOGIN);
      const isPasswordResetPath = req.url.includes(API_PATHS.AUTH.PASSWORD_RESET);
      const isAuthPath = isPasswordResetPath || isLoginPath;
      const isLoginFailure =
        isLoginPath &&
        (error.status === HttpStatusCode.Unauthorized || error.status === HttpStatusCode.Forbidden);
      const skipToast =
        (error.status === 429 && isAuthPath) ||
        isLoginFailure ||
        req.context.get(SKIP_GLOBAL_ERROR_TOAST);
      if (!skipToast) {
        toastService.error(translate.instant(resolveErrorMessageKey(error.status)));
      }

      switch (error.status) {
        case HttpStatusCode.Unauthorized: {
          const url = req.url;
          if (!url.includes(API_PATHS.AUTH.SESSION)) {
            sessionStorage.removeItem(STORAGE_KEYS.USER);
            sessionStorage.removeItem(STORAGE_KEYS.TENANT_ID);
            // window.location.href によるフルページ遷移は SPA の履歴を破壊し
            // ブラウザの「戻る」が効かなくなるため、Router による遷移に置き換える
            void router.navigateByUrl(ROUTES.AUTH.LOGIN);
          }
          break;
        }
        case HttpStatusCode.Forbidden:
          console.error('[API] Forbidden:', error.error);
          break;
        case HttpStatusCode.InternalServerError:
          console.error('[API] Server error:', error.error);
          break;
      }

      return throwError(() => error);
    }),
  );
};
