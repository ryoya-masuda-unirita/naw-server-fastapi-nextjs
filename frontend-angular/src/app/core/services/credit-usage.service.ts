import { inject, Injectable, signal } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@core/constants/api-paths.config';
import type { CreditUsageResponse } from '@app-types/credit-usage.type';

@Injectable({
  providedIn: 'root',
})
export class CreditUsageService {
  private readonly api = inject(ApiClientService);

  private readonly requestId = signal(0);

  readonly meQuery = injectQuery(() => {
    const id = this.requestId();
    return {
      queryKey: ['credit-usage', 'me', id],
      enabled: id > 0,
      queryFn: (): Promise<CreditUsageResponse> =>
        this.api.get<CreditUsageResponse>(API_PATHS.CREDIT_USAGE.ME),
    };
  });

  readonly workspaceQuery = injectQuery(() => {
    const id = this.requestId();
    return {
      queryKey: ['credit-usage', 'workspace', id],
      enabled: id > 0,
      queryFn: (): Promise<CreditUsageResponse> =>
        this.api.get<CreditUsageResponse>(API_PATHS.CREDIT_USAGE.WORKSPACE),
    };
  });

  /** Triggers parallel fetch of personal and workspace credit usage. */
  fetchUsage(): void {
    this.requestId.update((n) => n + 1);
  }
}
