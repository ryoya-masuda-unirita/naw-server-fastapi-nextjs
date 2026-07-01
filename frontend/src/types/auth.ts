export interface LoginRequest {
  username: string;
  password: string;
}

export interface ResetPasswordRequest {
  username: string;
  oldPassword: string;
  newPassword: string;
}

export type LoginStatus = 'SUCCESS' | 'REQUIRES_PASSWORD_RESET';
export type PasswordResetReason = 'INITIAL' | 'EXPIRED';

export interface LoginSuccessResponse {
  loginStatus: 'SUCCESS';
  id: string;
  name: string;
  role: 'USER' | 'ADMIN';
  token: string;
  groups: GroupDTO[];
}

export interface LoginRequiresPasswordResetResponse {
  loginStatus: 'REQUIRES_PASSWORD_RESET';
  id: string;
  name: string;
  role: 'USER' | 'ADMIN';
  reason: PasswordResetReason;
}

export type LoginResponse =
  | LoginSuccessResponse
  | LoginRequiresPasswordResetResponse;

export interface AuthSessionResponse {
  id: string;
  name: string;
  role: 'USER' | 'ADMIN';
  token: string;
  groups: GroupDTO[];
}

export interface BackendAuthResponse {
  id: string;
  name: string;
  role: 'ADMIN' | 'USER';
  tenant_id: string;
}

export interface GroupDTO {
  groupId: string;
  groupAdmin: boolean;
}

export interface User {
  id: string;
  name: string;
  role: 'USER' | 'ADMIN';
  groups: GroupDTO[];
}

export interface PwResetNavigationState {
  username?: string;
  oldPassword?: string;
  reason?: PasswordResetReason;
}
