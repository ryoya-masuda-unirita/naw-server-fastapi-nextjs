import { inject, Injectable } from '@angular/core';
import { ApiClientService } from '@core/services/api-client';
import type { GroupTemplateListFilter } from '@app-types/admin/group-management.types';
import { API_PATHS } from '@app/core/constants/api-paths.config';
import type { TemplateApiItem } from '@app-types/admin/template.types';
import type { PagedResponse } from '@app-types/api-response.type';
import { mapGroupTemplateItem, parseSpringPage } from '../utils/group-api.mappers';

@Injectable({ providedIn: 'root' })
export class GroupTemplatesApiService {
  private readonly api = inject(ApiClientService);

  async list(filter: GroupTemplateListFilter): Promise<PagedResponse<TemplateApiItem>> {
    const raw = await this.api.get<unknown>(API_PATHS.ADMIN.PROMPT_TEMPLATES.LIST, {
      params: this.toTenantListParams(filter),
    });
    return parseSpringPage(raw, mapGroupTemplateItem);
  }

  async listByGroup(
    groupId: string,
    filter: GroupTemplateListFilter,
  ): Promise<PagedResponse<TemplateApiItem>> {
    const raw = await this.api.get<unknown>(API_PATHS.ADMIN.GROUPS.TEMPLATES(groupId), {
      params: this.toGroupListParams(filter),
    });
    return parseSpringPage(raw, mapGroupTemplateItem);
  }

  async addTemplates(groupId: string, templateIds: string[]): Promise<void> {
    await this.api.post<void>(
      API_PATHS.ADMIN.GROUPS.TEMPLATES(groupId),
      { templateIds },
      { skipGlobalErrorToast: true },
    );
  }

  async remove(groupId: string, templateId: string): Promise<void> {
    await this.api.delete<void>(API_PATHS.ADMIN.GROUPS.TEMPLATE_DETAIL(groupId, templateId), {
      skipGlobalErrorToast: true,
    });
  }

  private toTenantListParams(
    filter: GroupTemplateListFilter,
  ): Record<string, string | number | undefined> {
    const sort = filter.sortField ? `${filter.sortField},${filter.sortOrder ?? 'desc'}` : undefined;
    return {
      page: Math.max(0, filter.pageIndex - 1),
      size: filter.pageSize,
      search: filter.search?.trim() ?? '',
      excludeGroupId: filter.excludeGroupId,
      sort,
    };
  }

  private toGroupListParams(
    filter: GroupTemplateListFilter,
  ): Record<string, string | number | undefined> {
    return this.toTenantListParams(filter);
  }
}
