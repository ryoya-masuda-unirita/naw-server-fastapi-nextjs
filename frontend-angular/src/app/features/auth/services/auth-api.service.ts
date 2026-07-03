import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { injectMutation } from '@tanstack/angular-query-experimental';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@core/constants/api-paths.config';
import type {
  AuthSessionResponse,
  BackendAuthResponse,
  LoginRequest,
  LoginResponse,
  LoginSuccessResponse,
  ResetPasswordRequest,
} from '../types';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly api = inject(ApiClientService);
  private readonly http = inject(HttpClient);

  loginMutation = injectMutation(() => ({
    mutationFn: async (credentials: LoginRequest): Promise<LoginResponse> => {
      return this.api.post<LoginResponse>(API_PATHS.AUTH.LOGIN, credentials);
    },
  }));

  resetPasswordMutation = injectMutation(() => ({
    mutationFn: async (request: ResetPasswordRequest): Promise<AuthSessionResponse> => {
      return this.api.post<AuthSessionResponse>(API_PATHS.AUTH.PASSWORD_RESET, request);
    },
  }));

  async loginWithKey(loginKey: string): Promise<LoginSuccessResponse> {
    return this.api.post<LoginSuccessResponse>(API_PATHS.AUTH.LOGIN_KEY, { loginKey });
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post(API_PATHS.AUTH.LOGOUT, null, { responseType: 'text' }));
  }

  async getSession(): Promise<BackendAuthResponse | null> {
    try {
      return await this.api.get<BackendAuthResponse>(API_PATHS.AUTH.SESSION);
    } catch {
      return null;
    }
  }
}
