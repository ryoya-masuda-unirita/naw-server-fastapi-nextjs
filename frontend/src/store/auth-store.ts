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
  /** いずれかのグループの管理者か（移植元 AuthStore.isGroupAdmin） */
  isGroupAdmin: boolean;
  /** テナント管理者ではなく、グループ管理者だけか（移植元 AuthStore.isGroupAdminOnly） */
  isGroupAdminOnly: boolean;
  /** 管理コンソール（/admin 配下）に入れるか（移植元 AuthStore.canAccessAdminConsole） */
  canAccessAdminConsole: boolean;
  /** 管理者になっているグループの ID（移植元 AuthStore.adminGroupIds） */
  adminGroupIds: string[];
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

/** user から権限の派生値を計算する。テストで状態を組み立てるときにも使う */
export const deriveAuthState = (user: User | null): Omit<AuthState, 'user'> => {
  const isAdmin = user?.role === 'ADMIN';
  const adminGroupIds = (user?.groups ?? [])
    .filter((group) => group.groupAdmin)
    .map((group) => group.groupId);
  const isGroupAdmin = adminGroupIds.length > 0;
  return {
    isAuthenticated: user !== null,
    isAdmin,
    isGroupAdmin,
    isGroupAdminOnly: !isAdmin && isGroupAdmin,
    canAccessAdminConsole: isAdmin || isGroupAdmin,
    adminGroupIds,
    userName: user?.name ?? 'Guest',
  };
};

export const useAuthStore = create<AuthStore>((set) => {
  let initPromise: Promise<void> | null = null;

  const setUser = (user: User | null) => set({ user, ...deriveAuthState(user) });

  return {
    user: null,
    ...deriveAuthState(null),

    async ensureInitialized() {
      if (!initPromise) {
        initPromise = (async () => {
          let previousGroups: User['groups'] = [];
          const stored = sessionStorage.getItem('AUTH_USER');
          if (stored) {
            try {
              const storedUser = JSON.parse(stored) as User;
              setUser(storedUser);
              previousGroups = storedUser.groups ?? [];
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
            // GET /api/auth はグループを返さないため、ログイン時に保存したグループを引き継ぐ。
            // 引き継がないと再読み込みでグループ管理者の権限（管理コンソール・グループ詳細）が消える（移植元 initializeSession と同じ）
            if (user.groups.length === 0 && previousGroups.length > 0) {
              user.groups = previousGroups;
            }
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
