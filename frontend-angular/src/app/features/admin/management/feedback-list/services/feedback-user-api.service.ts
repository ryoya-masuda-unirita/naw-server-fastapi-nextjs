import { inject, Injectable } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@core/constants/api-paths.config';
import type { GetFeedbackUserViewModel } from '@app-types/admin/feedback.types';
import type { UserApiResponse, UserFilter } from '@app-types/admin/user.types';
import { UserListApiService } from '@features/admin/management/user-list/services/user-list-api.service';

export type FeedbackUserQueryParams = Record<string, string | number | undefined> & {
  page?: number;
  size?: number;
  responseStatus?: string;
  satisfaction?: string;
  sortField?: string;
  sortOrder?: string;
};

@Injectable({ providedIn: 'root' })
export class FeedbackUserApiService {
  private readonly api = inject(ApiClientService);
  private readonly userListApiService = inject(UserListApiService);

  fetchFeedbackUsers(params: FeedbackUserQueryParams = {}): Promise<GetFeedbackUserViewModel> {
    return this.api.get<GetFeedbackUserViewModel>(API_PATHS.ADMIN.FEEDBACK_USERS.LIST, {
      params,
    });
  }

  injectFeedbackUsersQuery(paramsFn: () => FeedbackUserQueryParams = () => ({})) {
    return injectQuery(() => {
      const params = paramsFn();
      return {
        queryKey: ['feedback', 'users', params] as const,
        queryFn: (): Promise<GetFeedbackUserViewModel> => this.fetchFeedbackUsers(params),
      };
    });
  }

  injectAdminUsersQuery(paramsFn: () => UserFilter) {
    return injectQuery(() => {
      const params = paramsFn();
      return {
        queryKey: ['admin', 'users', params] as const,
        queryFn: (): Promise<UserApiResponse> => this.userListApiService.list(params),
      };
    });
  }
}
