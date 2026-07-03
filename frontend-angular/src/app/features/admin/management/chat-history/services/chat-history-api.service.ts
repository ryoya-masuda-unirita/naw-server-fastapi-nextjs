import { inject, Injectable } from '@angular/core';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@core/constants/api-paths.config';
import type {
  ChatHistoryApiResponse,
  ChatHistoryFilter,
  ChatHistorySortField,
} from '@app-types/chat-history.types';

export interface ChatHistoryUserOption {
  userId: string;
  userName: string;
}

export interface ChatHistoryListParams {
  page: number;
  size: number;
  userId?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  name?: string;
  orderBy: string;
  reverse: boolean;
}

@Injectable({ providedIn: 'root' })
export class ChatHistoryApiService {
  private readonly api = inject(ApiClientService);

  async listUsers(): Promise<ChatHistoryUserOption[]> {
    const res = await this.api.get<ChatHistoryApiResponse>(API_PATHS.ADMIN.HISTORIES.LIST, {
      params: { page: 0, size: 20, orderBy: 'updatedAt', reverse: true },
    });
    return Array.from(
      new Map(
        res.content
          .filter((item) => item.userId && item.userName)
          .map((item) => [
            item.userId,
            { userId: item.userId ?? '', userName: item.userName ?? '' },
          ]),
      ).values(),
    );
  }

  async list(filter: ChatHistoryFilter): Promise<ChatHistoryApiResponse> {
    const params = this.toParams(filter);
    return this.api.get<ChatHistoryApiResponse>(API_PATHS.ADMIN.HISTORIES.LIST, {
      params,
    });
  }

  private toParams(
    filter: ChatHistoryFilter,
  ): Record<string, string | number | boolean | undefined> {
    const sortField = filter.sortField ?? 'updatedAt';
    const sortOrder = filter.sortOrder ?? 'desc';
    return {
      page: Math.max(0, filter.pageIndex - 1),
      size: filter.pageSize,
      userId: filter.userId,
      createdAtFrom: toIsoDate(filter.periodFrom),
      createdAtTo: toIsoDate(filter.periodTo),
      name: filter.query,
      orderBy: toOrderBy(sortField),
      reverse: sortOrder === 'desc',
    };
  }
}

function toOrderBy(sortField: ChatHistorySortField): string {
  return sortField === 'roomName' ? 'name' : sortField;
}

/**
 * UI emits dates as `YYYY/MM/DD` (slash); the API contract expects ISO
 * `YYYY-MM-DD`. Without this conversion the mock filter misses every row,
 * because lexicographic compare of `'2026-…'` (ISO timestamps) against
 * `'2026/…'` (slash dates) is always less-than (`-` < `/` in ASCII).
 */
function toIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/\//g, '-');
}
