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

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  userName: string;
}

interface AuthStore extends AuthState {
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

const deriveFromUser = (user: User | null): Pick<AuthState, 'isAuthenticated' | 'isAdmin' | 'userName'> => ({
  isAuthenticated: user !== null,
  isAdmin: user?.role === 'ADMIN',
  userName: user?.name ?? 'Guest',
});

export const useAuthStore = create<AuthStore>((set) => {
  let initPromise: Promise<void> | null = null;

  const setUser = (user: User | null) => set({ user, ...deriveFromUser(user) });

  return {
    user: null,
    isAuthenticated: false,
    isAdmin: false,
    userName: 'Guest',

    async ensureInitialized() {
      if (!initPromise) {
        initPromise = (async () => {
          const stored = sessionStorage.getItem('AUTH_USER');
          if (stored) {
            try {
              setUser(JSON.parse(stored) as User);
            } catch {
              // ignore
            }
          }

          try {
            const session = await apiClient.get<BackendAuthResponse>(
              API_PATHS.AUTH.SESSION
            );
            const user = mapToUser(session);
            setUser(user);
            sessionStorage.setItem('AUTH_USER', JSON.stringify(user));
            sessionStorage.setItem('TENANT_ID', session.tenant_id);
          } catch {
            setUser(null);
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
        setUser(null);
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
      setUser(user);
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
      setUser(null);
      initPromise = null;
      sessionStorage.removeItem('AUTH_USER');
      sessionStorage.removeItem('TENANT_ID');
      window.location.href = ROUTES.AUTH.LOGIN;
    },

    completePasswordReset(response: AuthSessionResponse): void {
      const user = mapToUser(response);
      setUser(user);
      sessionStorage.setItem('AUTH_USER', JSON.stringify(user));
      sessionStorage.setItem('TENANT_ID', resolveTenantId());
      window.location.href = ROUTES.APP.DASHBOARD;
    },
  };
});
