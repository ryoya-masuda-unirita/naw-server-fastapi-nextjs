import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useUiStore } from '@/store/ui-store';
import { FIXTURE_GENERAL_USER, setAuthUser } from '@/test/render-app';
import { AdminLayout } from './admin-layout';

const renderAdminLayout = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/" element={<AdminLayout />}>
            <Route path="dashboard" element={<div>DASHBOARD_CONTENT</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

beforeEach(() => {
  useUiStore.setState({ sidebarCollapsed: false, sidebarMobileOpen: false });
  setAuthUser(FIXTURE_GENERAL_USER);
});

describe('AdminLayout', () => {
  describe('初期表示', () => {
    test('サイドバーと子ルートの内容が表示されること', () => {
      renderAdminLayout();

      expect(screen.getByAltText('SecuAiGent')).toBeInTheDocument();
      expect(screen.getByText('DASHBOARD_CONTENT')).toBeInTheDocument();
    });

    test('メイン領域の左余白がサイドバーの開閉に合わせて変わること', () => {
      useUiStore.setState({ sidebarCollapsed: true });
      renderAdminLayout();

      expect(screen.getByRole('main').parentElement).toHaveClass('md:ml-13');
    });
  });

  describe('モバイルサイドバー', () => {
    test('開くボタンをクリックすると sidebarMobileOpen が true になること', async () => {
      renderAdminLayout();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'open-mobile-sidebar' }));

      expect(useUiStore.getState().sidebarMobileOpen).toBe(true);
    });

    test('オーバーレイをクリックすると sidebarMobileOpen が false になること', async () => {
      useUiStore.setState({ sidebarMobileOpen: true });
      renderAdminLayout();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'close-mobile-sidebar' }));

      expect(useUiStore.getState().sidebarMobileOpen).toBe(false);
    });

    test('閉じているときはオーバーレイを隠すこと', () => {
      renderAdminLayout();

      expect(screen.getByRole('button', { name: 'close-mobile-sidebar' })).toHaveClass('invisible');
    });
  });
});
