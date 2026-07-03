import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '@env/environment';

export const baseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  if (
    req.url.startsWith('http') ||
    req.url.startsWith('/i18n/') ||
    req.url.startsWith('/assets/')
  ) {
    return next(req);
  }

  if (req.url.startsWith('/auth/')) {
    const base = environment.authBaseUrl;
    if (!base) {
      return next(req); // ローカル・相対のまま → proxy が効く
    }
    return next(req.clone({ url: `${base}${req.url}` }));
  }
  return next(req.clone({ url: `${environment.apiBaseUrl}${req.url}` }));
};
