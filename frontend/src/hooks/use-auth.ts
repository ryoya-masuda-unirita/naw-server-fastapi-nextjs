import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import type {
  LoginRequest,
  ResetPasswordRequest,
  LoginResponse,
  AuthSessionResponse,
} from '@/types/auth';

export function useLoginMutation() {
  return useMutation({
    mutationFn: (credentials: LoginRequest) =>
      apiClient.post<LoginResponse>(API_PATHS.AUTH.LOGIN, credentials),
  });
}

export function useResetPasswordMutation() {
  return useMutation({
    mutationFn: (request: ResetPasswordRequest) =>
      apiClient.post<AuthSessionResponse>(
        API_PATHS.AUTH.PASSWORD_RESET,
        request
      ),
  });
}

export function useLogoutMutation() {
  return useMutation({
    mutationFn: () => apiClient.post(API_PATHS.AUTH.LOGOUT, null),
  });
}

export function useSessionQuery() {
  return useQuery({
    queryKey: ['session'],
    queryFn: () => apiClient.get(API_PATHS.AUTH.SESSION),
    staleTime: 1000 * 60 * 5,
  });
}
