import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '@/routes';
import { deriveAuthState, useAuthStore } from '@/store/auth-store';
import type { User } from '@/types/auth';

/** 認証ストアをこのユーザーでログインした状態にする（null で未ログイン）。権限の派生値も合わせて設定する */
export function setAuthUser(user: User | null) {
  useAuthStore.setState({ user, ...deriveAuthState(user) });
}

export const FIXTURE_TENANT_ADMIN: User = {
  id: 'admin1',
  name: '管理者',
  role: 'ADMIN',
  groups: [],
};

export const FIXTURE_GROUP_ADMIN: User = {
  id: 'gadmin1',
  name: 'グループ管理者',
  role: 'USER',
  groups: [
    { groupId: 'g1', groupAdmin: true },
    { groupId: 'g2', groupAdmin: false },
  ],
};

export const FIXTURE_GENERAL_USER: User = {
  id: 'user1',
  name: '一般ユーザー',
  role: 'USER',
  groups: [{ groupId: 'g1', groupAdmin: false }],
};

/** アプリの実際のルート定義（ガード・レイアウト込み）で path を描画する */
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return { ...result, router, queryClient };
}
