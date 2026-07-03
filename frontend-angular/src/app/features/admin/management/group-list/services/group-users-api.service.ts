import { inject, Injectable } from '@angular/core';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@app/core/constants/api-paths.config';
import type { GroupMemberUserFilter } from '@app-types/admin/group-management.types';
import type { PagedResponse } from '@app-types/api-response.type';
import type { UserApiItem, UserApiResponse, UserFilter } from '@app-types/admin/user.types';
import { normalizeAdminUsersListBody } from '@features/admin/management/user-list/utils/admin-users-api-normalize';
import { mapGroupMemberUser, parseSpringPage } from '../utils/group-api.mappers';

@Injectable({ providedIn: 'root' })
export class GroupUsersApiService {
  private readonly api = inject(ApiClientService);

  async list(filter: UserFilter): Promise<UserApiResponse> {
    const raw = await this.api.get<unknown>(API_PATHS.ADMIN.USERS.LIST, {
      params: this.toTenantListParams(filter),
    });
    return normalizeAdminUsersListBody(raw, filter);
  }

  async listByGroup(
    groupId: string,
    filter: GroupMemberUserFilter,
  ): Promise<PagedResponse<UserApiItem>> {
    const raw = await this.api.get<unknown>(API_PATHS.ADMIN.GROUPS.USERS(groupId), {
      params: this.toGroupListParams(filter),
    });
    return parseSpringPage(raw, mapGroupMemberUser);
  }

  async addUsers(groupId: string, userIds: string[]): Promise<void> {
    await this.api.post<void>(
      API_PATHS.ADMIN.GROUPS.USERS(groupId),
      { userIds },
      {
        skipGlobalErrorToast: true,
      },
    );
  }

  async remove(groupId: string, userId: string): Promise<void> {
    await this.api.delete<void>(API_PATHS.ADMIN.GROUPS.USER_DETAIL(groupId, userId), {
      skipGlobalErrorToast: true,
    });
  }

  async updateRole(groupId: string, userId: string, groupAdmin: boolean): Promise<void> {
    await this.api.patch<void>(
      API_PATHS.ADMIN.GROUPS.USER_DETAIL(groupId, userId),
      { groupAdmin },
      { skipGlobalErrorToast: true },
    );
  }

  private toTenantListParams(filter: UserFilter): Record<string, string | number | undefined> {
    const sort = filter.sortField ? `${filter.sortField},${filter.sortOrder ?? 'desc'}` : undefined;
    const roleParam =
      filter.role === 'admin'
        ? 'ADMIN'
        : filter.role === 'system'
          ? 'SYSTEM'
          : filter.role === 'user'
            ? 'USER'
            : '';
    return {
      page: Math.max(0, filter.pageIndex - 1),
      size: filter.pageSize,
      searchText: filter.query?.trim() ?? '',
      role: roleParam,
      sort,
      excludeGroupId: filter.excludeGroupId,
    };
  }

  private toGroupListParams(
    filter: GroupMemberUserFilter,
  ): Record<string, string | number | boolean | undefined> {
    const sort = filter.sortField ? `${filter.sortField},${filter.sortOrder ?? 'desc'}` : undefined;
    return {
      page: Math.max(0, filter.pageIndex - 1),
      size: filter.pageSize,
      searchText: filter.query?.trim() ?? '',
      role: filter.role,
      sort,
      includeUsage: true,
    };
  }
}
