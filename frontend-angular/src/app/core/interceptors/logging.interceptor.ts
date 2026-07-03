import { HttpInterceptorFn } from '@angular/common/http';
import { tap } from 'rxjs';
import { environment } from '@env/environment';

export const loggingInterceptor: HttpInterceptorFn = (req, next) => {
  if (environment.production) return next(req);

  console.log(`[API →] ${req.method} ${req.urlWithParams}`, req.body ?? '');

  return next(req).pipe(
    tap((event) => {
      if (event.type !== 0) {
        console.log(`[API ←] ${req.method} ${req.urlWithParams}`, event);
      }
    }),
  );
};
