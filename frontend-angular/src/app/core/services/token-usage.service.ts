import { inject, Injectable } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { buildTokenUsageDateRange } from '@core/utils/api-datetime.util';
import { ApiClientService } from './api-client';
import { API_PATHS } from '../constants/api-paths.config';
import type { TokenUsageSummaryResponse } from '@app-types/token-usage.type';

function tokenUsageUrl(path: string, period: 'today' | 'month'): string {
  const { from, to } = buildTokenUsageDateRange(period);
  const params = new URLSearchParams({ from, to });
  return `${path}?${params.toString()}`;
}

@Injectable({
  providedIn: 'root',
})
export class TokenUsageService {
  private readonly api = inject(ApiClientService);

  readonly tokenUsagesTodayQuery = injectQuery(() => {
    const { from, to } = buildTokenUsageDateRange('today');
    return {
      queryKey: ['token-usages', 'today', from, to],
      queryFn: (): Promise<TokenUsageSummaryResponse> =>
        this.api.get<TokenUsageSummaryResponse>(tokenUsageUrl(API_PATHS.TOKEN_USAGES.GET, 'today')),
    };
  });

  readonly tokenUsagesMonthQuery = injectQuery(() => {
    const { from, to } = buildTokenUsageDateRange('month');
    return {
      queryKey: ['token-usages', 'month', from, to],
      queryFn: (): Promise<TokenUsageSummaryResponse> =>
        this.api.get<TokenUsageSummaryResponse>(tokenUsageUrl(API_PATHS.TOKEN_USAGES.GET, 'month')),
    };
  });
}
