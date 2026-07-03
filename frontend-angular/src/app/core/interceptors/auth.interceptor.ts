import { HttpInterceptorFn } from '@angular/common/http';
import { resolveTenantId } from '@core/utils/tenant.helpers';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tenantId = resolveTenantId();
  const headers: Record<string, string> = {};
  if (tenantId) {
    headers['X-Tenant-ID'] = tenantId;
  }
  return next(req.clone({ setHeaders: headers, withCredentials: true }));
};
