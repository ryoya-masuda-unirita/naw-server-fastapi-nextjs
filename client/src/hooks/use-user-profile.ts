import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import type { UserProfile } from '@/types/user.types';

/** ログインユーザー自身のプロフィール（移植元 UserService.profileQuery）。クレジット確認ダイアログがプランの上限を読む */
export function useUserProfile() {
  return useQuery({
    queryKey: ['user', 'profile'],
    queryFn: () => apiClient.get<UserProfile>(API_PATHS.USERS.PROFILE),
  });
}
