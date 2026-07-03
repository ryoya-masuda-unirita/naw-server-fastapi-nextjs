import { HttpClient, HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  UserApiResponse,
  UserApiRole,
  UserCreateApiResponse,
  UserFilter,
  UserUpdateApiResponse,
} from '@app-types/admin/user.types';
import { SKIP_GLOBAL_ERROR_TOAST } from '@core/interceptors/http-context.tokens';
import { USER_LIST_API_PATH } from '../user-list.constants';
import { normalizeAdminUsersListBody } from '../utils/admin-users-api-normalize';
import { UserListAuthService } from './user-list-auth.service';

export interface CreateUserPayload {
  loginId: string;
  name: string;
  role: UserApiRole;
  loginKey?: string;
}

export interface UpdateUserPayload {
  name?: string;
  resetPassword?: boolean;
  role?: UserApiRole;
  loginKey?: string;
}

@Injectable({ providedIn: 'root' })
export class UserListApiService {
  private readonly http = inject(HttpClient);
  private readonly userListAuth = inject(UserListAuthService);

  async list(filter: UserFilter): Promise<UserApiResponse> {
    const raw = await firstValueFrom(
      this.http.get<unknown>(USER_LIST_API_PATH.LIST, this.buildRequestOptions(filter)),
    );
    return normalizeAdminUsersListBody(raw, filter);
  }

  async create(payload: CreateUserPayload): Promise<UserCreateApiResponse> {
    return firstValueFrom(
      this.http.post<UserCreateApiResponse>(
        USER_LIST_API_PATH.LIST,
        payload,
        this.buildRequestOptions(undefined, true),
      ),
    );
  }

  async update(loginId: string, payload: UpdateUserPayload): Promise<UserUpdateApiResponse> {
    const encoded = encodeURIComponent(loginId);
    return firstValueFrom(
      this.http.patch<UserUpdateApiResponse>(
        `${USER_LIST_API_PATH.LIST}/${encoded}`,
        payload,
        this.buildRequestOptions(undefined, true),
      ),
    );
  }

  async deleteOne(loginId: string): Promise<void> {
    const encoded = encodeURIComponent(loginId);
    await firstValueFrom(
      this.http.delete<unknown>(
        `${USER_LIST_API_PATH.LIST}/${encoded}`,
        this.buildRequestOptions(undefined, true),
      ),
    );
  }

  private buildRequestOptions(filter?: UserFilter, skipErrorToast?: boolean) {
    this.userListAuth.syncSessionFromAuthStore();
    const context = skipErrorToast
      ? new HttpContext().set(SKIP_GLOBAL_ERROR_TOAST, true)
      : undefined;
    return {
      params: filter ? this.buildHttpParams(filter) : undefined,
      headers: new HttpHeaders(this.userListAuth.getRequestHeaders()),
      withCredentials: true,
      context,
    };
  }

  private buildHttpParams(filter: UserFilter): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(this.toParams(filter))) {
      if (value !== undefined) {
        params = params.set(key, String(value));
      }
    }
    return params;
  }

  private toParams(filter: UserFilter): Record<string, string | number | boolean | undefined> {
    const sortOrder = filter.sortOrder ?? 'desc';
    const sort = filter.sortField ? `${filter.sortField},${sortOrder}` : undefined;
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
      // Backend requires these params (required=true); send "" when unfiltered.
      searchText: filter.query?.trim() ?? '',
      role: roleParam,
      sort,
      includeUsage: true,
    };
  }
}
