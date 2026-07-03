import { inject, Injectable } from '@angular/core';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@app/core/constants/api-paths.config';
import type {
  GroupApiItem,
  GroupApiResponse,
  GroupDetailApiItem,
  GroupListFilter,
  GroupNamePayload,
} from '@app-types/admin/group-management.types';
import { mapGroupDetail } from '../utils/group-api.mappers';

@Injectable({ providedIn: 'root' })
export class GroupApiService {
  private readonly api = inject(ApiClientService);

  async list(filter: GroupListFilter): Promise<GroupApiResponse> {
    return this.api.get<GroupApiResponse>(API_PATHS.ADMIN.GROUPS.LIST, {
      params: this.toParams(filter),
    });
  }

  async getById(id: string): Promise<GroupDetailApiItem> {
    const raw = await this.api.get<unknown>(API_PATHS.ADMIN.GROUPS.DETAIL(id));
    return mapGroupDetail(raw);
  }

  async create(payload: GroupNamePayload): Promise<GroupDetailApiItem> {
    const raw = await this.api.post<unknown>(API_PATHS.ADMIN.GROUPS.LIST, payload, {
      skipGlobalErrorToast: true,
    });
    return mapGroupDetail(raw);
  }

  async update(id: string, payload: GroupNamePayload): Promise<GroupDetailApiItem> {
    const raw = await this.api.patch<unknown>(API_PATHS.ADMIN.GROUPS.DETAIL(id), payload, {
      skipGlobalErrorToast: true,
    });
    return mapGroupDetail(raw);
  }

  async delete(id: string): Promise<void> {
    await this.api.delete<unknown>(API_PATHS.ADMIN.GROUPS.DETAIL(id), {
      skipGlobalErrorToast: true,
    });
  }

  private toParams(filter: GroupListFilter): Record<string, string | number | undefined> {
    const sort = filter.sortField ? `${filter.sortField},${filter.sortOrder ?? 'desc'}` : undefined;
    return {
      page: Math.max(0, filter.pageIndex - 1),
      size: filter.pageSize,
      q: filter.query,
      sort,
    };
  }
}
