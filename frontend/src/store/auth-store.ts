import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import { ROUTES } from '@/lib/constants/routes';
import type {
  User,
  LoginRequest,
  LoginResponse,
  LoginStatus,
  AuthSessionResponse,
  BackendAuthResponse,
} from '@/types/auth';

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  userName: string;
  ensureInitialized: () => Promise<void>;
  login: (credentials: LoginRequest) => Promise<LoginStatus>;
  logout: () => Promise<void>;
  completePasswordReset: (response: AuthSessionResponse) => void;
}

const mapToUser = (response: {
  id: string;
  name: string;
  role: 'USER' | 'ADMIN';
  groups?: { groupId: string; groupAdmin: boolean }[];
}): User => ({
  id: response.id,
  name: response.name,
  role: response.role,
  groups: response.groups ?? [],
});

const resolveTenantId = (): string => {
  return sessionStorage.getItem('TENANT_ID') || '';
};

export const useAuthStore = create<AuthStore>((set, get) => {
  let initPromise: Promise<void> | null = null;

  return {
    user: null,
    get isAuthenticated() {
      return get().user !== null;
    },
    get isAdmin() {
      return get().user?.role === 'ADMIN';
    },
    get userName() {
      return get().user?.name ?? 'Guest';
    },

    async ensureInitialized() {
      if (!initPromise) {
        initPromise = (async () => {
          const stored = sessionStorage.getItem('AUTH_USER');
          if (stored) {
            try {
              set({ user: JSON.parse(stored) });
            } catch {
              // ignore
            }
          }

          try {
            const session = await apiClient.get<BackendAuthResponse>(
              API_PATHS.AUTH.SESSION
            );
            const user = mapToUser(session);
            set({ user });
            sessionStorage.setItem('AUTH_USER', JSON.stringify(user));
            sessionStorage.setItem('TENANT_ID', session.tenant_id);
          } catch {
            set({ user: null });
            sessionStorage.removeItem('AUTH_USER');
          }
        })();
      }
      return initPromise;
    },

    async login(credentials: LoginRequest): Promise<LoginStatus> {
      const response = await apiClient.post<LoginResponse>(
        API_PATHS.AUTH.LOGIN,
        credentials
      );

      if (response.loginStatus === 'REQUIRES_PASSWORD_RESET') {
        set({ user: null });
        sessionStorage.removeItem('AUTH_USER');
        try {
          await apiClient.post(API_PATHS.AUTH.LOGOUT, null);
        } catch {
          console.error('Logout during password reset failed');
        }
        window.location.href = `${ROUTES.AUTH.PW_RESET}?username=${encodeURIComponent(
          response.id
        )}&reason=${response.reason}&oldPassword=${encodeURIComponent(credentials.password)}`;
        return 'REQUIRES_PASSWORD_RESET';
      }

      const user = mapToUser(response);
      set({ user });
      sessionStorage.setItem('AUTH_USER', JSON.stringify(user));
      sessionStorage.setItem('TENANT_ID', resolveTenantId());
      window.location.href = ROUTES.APP.DASHBOARD;
      return 'SUCCESS';
    },

    async logout(): Promise<void> {
      try {
        await apiClient.post(API_PATHS.AUTH.LOGOUT, null);
      } catch (e) {
        console.error('Logout service error', e);
      }
      set({ user: null });
      initPromise = null;
      sessionStorage.removeItem('AUTH_USER');
      sessionStorage.removeItem('TENANT_ID');
      window.location.href = ROUTES.AUTH.LOGIN;
    },

    completePasswordReset(response: AuthSessionResponse): void {
      const user = mapToUser(response);
      set({ user });
      sessionStorage.setItem('AUTH_USER', JSON.stringify(user));
      sessionStorage.setItem('TENANT_ID', resolveTenantId());
      window.location.href = ROUTES.APP.DASHBOARD;
    },
  };
});
