import { inject, Injectable } from '@angular/core';
import { ApiClientService } from '@core/services/api-client';
import type { GroupAssistantListFilter } from '@app-types/admin/group-management.types';
import { API_PATHS } from '@app/core/constants/api-paths.config';
import type { AssistantApiItem } from '@app-types/admin/assistant.types';
import type { PagedResponse } from '@app-types/api-response.type';
import { mapGroupAssistantItem, parseSpringPage } from '../utils/group-api.mappers';

@Injectable({ providedIn: 'root' })
export class GroupAssistantsApiService {
  private readonly api = inject(ApiClientService);

  async list(filter: GroupAssistantListFilter): Promise<PagedResponse<AssistantApiItem>> {
    const raw = await this.api.get<unknown>(API_PATHS.ADMIN.ASSISTANTS.LIST, {
      params: this.toTenantListParams(filter),
    });
    return parseSpringPage(raw, mapGroupAssistantItem);
  }

  async listByGroup(
    groupId: string,
    filter: GroupAssistantListFilter,
  ): Promise<PagedResponse<AssistantApiItem>> {
    const raw = await this.api.get<unknown>(API_PATHS.ADMIN.GROUPS.ASSISTANTS(groupId), {
      params: this.toGroupListParams(filter),
    });
    return parseSpringPage(raw, mapGroupAssistantItem);
  }

  async addAssistants(groupId: string, assistantIds: string[]): Promise<void> {
    await this.api.post<void>(
      API_PATHS.ADMIN.GROUPS.ASSISTANTS(groupId),
      { assistantIds },
      { skipGlobalErrorToast: true },
    );
  }

  async remove(groupId: string, assistantId: string): Promise<void> {
    await this.api.delete<void>(API_PATHS.ADMIN.GROUPS.ASSISTANT_DETAIL(groupId, assistantId), {
      skipGlobalErrorToast: true,
    });
  }

  private toTenantListParams(
    filter: GroupAssistantListFilter,
  ): Record<string, string | number | undefined> {
    const sort = filter.sortField ? `${filter.sortField},${filter.sortOrder ?? 'desc'}` : undefined;
    return {
      page: Math.max(0, filter.pageIndex - 1),
      size: filter.pageSize,
      search: filter.search?.trim() || undefined,
      type: filter.type || undefined,
      categoryId: filter.categoryId || undefined,
      excludeGroupId: filter.excludeGroupId,
      sort,
    };
  }

  private toGroupListParams(
    filter: GroupAssistantListFilter,
  ): Record<string, string | number | undefined> {
    return this.toTenantListParams(filter);
  }
}
