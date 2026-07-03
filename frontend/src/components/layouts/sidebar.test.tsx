import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { useUiStore } from '@/store/ui-store';
import { useAuthStore } from '@/store/auth-store';

const renderSidebar = () =>
  render(
    <BrowserRouter>
      <Sidebar />
    </BrowserRouter>
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

describe('Sidebar', () => {
  describe('初期表示', () => {
    test('ロゴが表示されること', () => {
      renderSidebar();
      expect(screen.getByAltText('SecuAiGent')).toBeInTheDocument();
    });
  });

  describe('折りたたみ操作', () => {
    test('折りたたみボタンをクリックすると sidebarCollapsed が反転すること', async () => {
      renderSidebar();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'toggle-sidebar' }));

      expect(useUiStore.getState().sidebarCollapsed).toBe(true);
    });
  });
});
