import type { SubscriptionResponse } from '@/types/common';

export interface UserProfile {
  id: string;
  loginId: string;
  name: string;
  role: string;
  /** ログインキーが設定されているか。平文は返らない。 */
  hasLoginKey: boolean;
  password?: string;
  avatar?: string | null;
  subscription?: SubscriptionResponse;
}
