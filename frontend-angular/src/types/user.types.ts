import type { SubscriptionResponse } from '@app-types/common';

export interface UserProfile {
  id: string;
  loginId: string;
  name: string;
  role: string;
  loginKey: string | null;
  password?: string;
  avatar?: string | null;
  subscription?: SubscriptionResponse;
}
