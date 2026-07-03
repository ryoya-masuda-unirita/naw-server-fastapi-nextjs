import { inject, Injectable } from '@angular/core';
import { ApiClientService } from '@core/services/api-client';
import type {
  TemplateApiItem,
  TemplateApiResponse,
  TemplateFilter,
} from '@app-types/admin/template.types';
import { TEMPLATE_LIST_API_PATH } from '../template-list.constants';

/** Server contract for `POST /api/admin/prompt-templates`. */
export interface CreateTemplatePayload {
  name: string;
  description?: string;
  systemPrompt: string;
  groups?: string[];
}

@Injectable({ providedIn: 'root' })
export class TemplateListApiService {
  private readonly api = inject(ApiClientService);

  async list(filter: TemplateFilter): Promise<TemplateApiResponse> {
    return this.api.get<TemplateApiResponse>(TEMPLATE_LIST_API_PATH.LIST, {
      params: this.toParams(filter),
    });
  }

  async create(payload: CreateTemplatePayload): Promise<TemplateApiItem> {
    return this.api.post<TemplateApiItem>(TEMPLATE_LIST_API_PATH.LIST, payload, {
      skipGlobalErrorToast: true,
    });
  }

  async update(id: string, payload: CreateTemplatePayload): Promise<TemplateApiItem> {
    return this.api.patch<TemplateApiItem>(`${TEMPLATE_LIST_API_PATH.LIST}/${id}`, payload, {
      skipGlobalErrorToast: true,
    });
  }

  async deleteOne(id: string): Promise<void> {
    await this.api.delete<unknown>(`${TEMPLATE_LIST_API_PATH.LIST}/${id}`, {
      skipGlobalErrorToast: true,
    });
  }

  private toParams(filter: TemplateFilter): Record<string, string | number | undefined> {
    const sort = filter.sortField ? `${filter.sortField},${filter.sortOrder ?? 'desc'}` : undefined;
    return {
      page: Math.max(0, filter.pageIndex - 1),
      size: filter.pageSize,
      team: filter.team,
      search: filter.query,
      sort,
    };
  }
}
