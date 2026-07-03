import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { SKIP_GLOBAL_ERROR_TOAST } from '@core/interceptors/http-context.tokens';
import { firstValueFrom } from 'rxjs';

export interface ApiRequestConfig {
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  /** Default `json`. Use `text` when the API returns a plain-text body (e.g. message id only). */
  responseType?: 'json' | 'text';
  /** When true, errorInterceptor will not show a global error toast for this request. */
  skipGlobalErrorToast?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private readonly http = inject(HttpClient);

  async get<T>(url: string, config?: ApiRequestConfig): Promise<T> {
    return firstValueFrom(
      this.http.get<T>(url, {
        params: this.buildParams(config?.params),
        context: this.buildContext(config),
      }),
    );
  }

  async post<T>(url: string, body?: unknown, config?: ApiRequestConfig): Promise<T> {
    const params = this.buildParams(config?.params);
    const headers = config?.headers;
    const context = this.buildContext(config);

    if (config?.responseType === 'text') {
      return firstValueFrom(
        this.http.post(url, body, {
          params,
          headers,
          context,
          responseType: 'text',
        }),
      ) as Promise<T>;
    }

    return firstValueFrom(this.http.post<T>(url, body, { params, headers, context }));
  }

  async put<T>(url: string, body?: unknown, config?: ApiRequestConfig): Promise<T> {
    return firstValueFrom(
      this.http.put<T>(url, body, {
        params: this.buildParams(config?.params),
        context: this.buildContext(config),
      }),
    );
  }

  async patch<T>(url: string, body?: unknown, config?: ApiRequestConfig): Promise<T> {
    return firstValueFrom(
      this.http.patch<T>(url, body, {
        params: this.buildParams(config?.params),
        context: this.buildContext(config),
      }),
    );
  }

  async delete<T>(url: string, config?: ApiRequestConfig & { body?: unknown }): Promise<T> {
    return firstValueFrom(
      this.http.delete<T>(url, {
        params: this.buildParams(config?.params),
        body: config?.body,
        context: this.buildContext(config),
      }),
    );
  }

  /** POST to an absolute URL (bypasses baseUrlInterceptor when url starts with http). */
  async postFromCustomUrl<T>(
    absoluteUrl: string,
    body?: unknown,
    config?: Pick<ApiRequestConfig, 'headers'>,
  ): Promise<T> {
    return firstValueFrom(this.http.post<T>(absoluteUrl, body, { headers: config?.headers }));
  }

  private buildContext(config?: ApiRequestConfig): HttpContext | undefined {
    if (!config?.skipGlobalErrorToast) {
      return undefined;
    }
    return new HttpContext().set(SKIP_GLOBAL_ERROR_TOAST, true);
  }

  private buildParams(
    params?: Record<string, string | number | boolean | undefined>,
  ): HttpParams | undefined {
    if (!params) return undefined;
    let httpParams = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        httpParams = httpParams.set(key, String(value));
      }
    }
    return httpParams;
  }
}
