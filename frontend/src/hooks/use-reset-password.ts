import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import type { ResetPasswordRequest, AuthSessionResponse } from '@/types/auth';

export function useResetPasswordMutation() {
  return useMutation({
    mutationFn: (request: ResetPasswordRequest) =>
      apiClient.post<AuthSessionResponse>(API_PATHS.AUTH.PASSWORD_RESET, request),
  });
}
