import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from './index';
import { useAuthStore } from '@/store/auth-store';

beforeEach(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false, isAdmin: false, userName: 'Guest' });
});

const renderAt = (path: string) => {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
};

describe('routes', () => {
  describe('未認証で /dashboard にアクセスした場合', () => {
    test('ログイン画面にリダイレクトされること', () => {
      renderAt('/dashboard');
      expect(screen.getByRole('button', { name: /AUTH\.LOGIN\.SUBMIT/i })).toBeInTheDocument();
    });
  });

  describe('認証済みで /dashboard にアクセスした場合', () => {
    test('AppLayout 配下に DashboardPage が表示されること', () => {
      useAuthStore.setState({
        user: { id: 'u1', name: 'テスト太郎', role: 'USER', groups: [] },
        isAuthenticated: true,
        isAdmin: false,
        userName: 'テスト太郎',
      });

      renderAt('/dashboard');
      expect(screen.getByRole('heading', { name: 'SIDEBAR.DASHBOARD' })).toBeInTheDocument();
    });
  });
});
