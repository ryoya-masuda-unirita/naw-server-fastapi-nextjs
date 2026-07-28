export interface ResetPasswordRequest {
  username: string;
  oldPassword: string;
  newPassword: string;
}

export interface LoginRequest {
  username: string;
  password: string;
  tenantId: string;
}

export interface LoginKeyRequest {
  loginKey: string;
}

export type LoginStatus = 'SUCCESS' | 'REQUIRES_PASSWORD_RESET';

export type PasswordResetReason = 'INITIAL' | 'EXPIRED';

export interface PwResetNavigationState {
  username?: string;
  oldPassword?: string;
  reason?: PasswordResetReason;
}

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

export type LoginResponse = LoginSuccessResponse | LoginRequiresPasswordResetResponse;

/** POST /auth/password/reset 成功時（loginStatus フィールドなし） */
export interface AuthSessionResponse {
  id: string;
  name: string;
  role: 'USER' | 'ADMIN';
  token: string;
  groups: GroupDTO[];
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

// GET /api/auth レスポンス型
export interface BackendAuthResponse {
  id: string;
  name: string;
  role: 'ADMIN' | 'USER';
  tenant_id: string;
  groups?: GroupDTO[];
}

export interface MockAccount {
  username: string;
  password: string;
  id: string;
  name: string;
  role: 'USER' | 'ADMIN';
  requiresPasswordReset?: boolean;
  passwordResetReason?: PasswordResetReason;
}
