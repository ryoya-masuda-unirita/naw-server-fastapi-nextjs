import { create } from 'zustand';
import { apiClient, clearTenantId, persistTenantId } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import { ROUTES } from '@/lib/constants/routes';
import type {
  User,
  LoginCredentials,
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
  login: (credentials: LoginCredentials) => Promise<LoginStatus>;
  logout: () => Promise<void>;
  completePasswordReset: (response: AuthSessionResponse) => Promise<void>;
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
            } catch (e) {
              console.warn('AUTH_USER in sessionStorage is corrupted. Clearing.', e);
              sessionStorage.removeItem('AUTH_USER');
            }
          }

          try {
            const session = await apiClient.get<BackendAuthResponse>(
              API_PATHS.AUTH.SESSION
            );
            const user = mapToUser(session);
            setUser(user);
            // backend の GET /api/auth は tenant_id を返さないため、ログイン時に保存した入力値をそのまま使う
            sessionStorage.setItem('AUTH_USER', JSON.stringify(user));
          } catch {
            // パスワードリセット画面へのフルページ遷移後もリセット API に X-Tenant-ID が必要なため、
            // 未ログイン（セッション確認失敗）ではテナントIDを消さない
            setUser(null);
            sessionStorage.removeItem('AUTH_USER');
          }
        })();
      }
      return initPromise;
    },

    async login({ tenantId, username, password }: LoginCredentials): Promise<LoginStatus> {
      // ログインリクエスト自体にも X-Tenant-ID ヘッダが必要なため、API 呼び出し前に保存する
      persistTenantId(tenantId);
      let response: LoginResponse;
      try {
        response = await apiClient.post<LoginResponse>(API_PATHS.AUTH.LOGIN, {
          username,
          password,
        });
      } catch (e) {
        // 誤ったテナントIDを残さない。frontend-angular は 401 のときだけ消すが、
        // 次回のログイン送信で入力値が保存し直されるため、失敗理由を問わず消してよい
        clearTenantId();
        throw e;
      }

      if (response.loginStatus === 'REQUIRES_PASSWORD_RESET') {
        // パスワードリセット API も X-Tenant-ID が必須のため、テナントIDは消さずにユーザー情報だけ消す
        setUser(null);
        sessionStorage.removeItem('AUTH_USER');
        try {
          await apiClient.post(API_PATHS.AUTH.LOGOUT, null);
        } catch {
          console.error('Logout during password reset failed');
        }
        // パスワードを URL に含めず sessionStorage 経由で渡す（URL 露出防止）
        sessionStorage.setItem('PW_RESET_OLD_PASSWORD', password);
        window.location.href = `${ROUTES.AUTH.PW_RESET}?username=${encodeURIComponent(
          response.id
        )}&reason=${response.reason}`;
        return 'REQUIRES_PASSWORD_RESET';
      }

      const user = mapToUser(response);
      setUser(user);
      sessionStorage.setItem('AUTH_USER', JSON.stringify(user));
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
      clearTenantId();
      window.location.href = ROUTES.AUTH.LOGIN;
    },

    async completePasswordReset(response: AuthSessionResponse): Promise<void> {
      const user = mapToUser(response);
      setUser(user);
      sessionStorage.setItem('AUTH_USER', JSON.stringify(user));
      window.location.href = ROUTES.APP.DASHBOARD;
    },
  };
});
