import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from './app-layout';
import { useUiStore } from '@/store/ui-store';
import { useAuthStore } from '@/store/auth-store';

const renderAppLayout = () =>
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route path="dashboard" element={<div>DASHBOARD_CONTENT</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  useUiStore.setState({ sidebarCollapsed: false, sidebarMobileOpen: false });
  useAuthStore.setState({
    user: { id: 'u1', name: 'テスト太郎', role: 'USER', groups: [] },
    isAuthenticated: true,
    isAdmin: false,
    userName: 'テスト太郎',
  });
});

describe('AppLayout', () => {
  describe('初期表示', () => {
    test('子ルートの内容が Outlet 経由で表示されること', () => {
      renderAppLayout();
      expect(screen.getByText('DASHBOARD_CONTENT')).toBeInTheDocument();
    });

    test('モバイル用の開閉ボタンが表示されること', () => {
      renderAppLayout();
      expect(screen.getByRole('button', { name: 'open-mobile-sidebar' })).toBeInTheDocument();
    });
  });

  describe('モバイルサイドバーの開閉', () => {
    test('開閉ボタンをクリックすると sidebarMobileOpen が true になること', async () => {
      renderAppLayout();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'open-mobile-sidebar' }));

      expect(useUiStore.getState().sidebarMobileOpen).toBe(true);
    });

    test('オーバーレイをクリックすると sidebarMobileOpen が false になること', async () => {
      useUiStore.setState({ sidebarMobileOpen: true });
      renderAppLayout();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'close-mobile-sidebar' }));

      expect(useUiStore.getState().sidebarMobileOpen).toBe(false);
    });
  });
});
