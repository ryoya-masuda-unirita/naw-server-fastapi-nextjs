import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, MemoryRouter, useLocation } from 'react-router-dom';
import { ADMIN_LAYOUT_CONFIG } from '@/lib/constants/layout';
import { useAuthStore } from '@/store/auth-store';
import { useUiStore } from '@/store/ui-store';
import {
  FIXTURE_GENERAL_USER,
  FIXTURE_GROUP_ADMIN,
  FIXTURE_TENANT_ADMIN,
  setAuthUser,
} from '@/test/render-app';
import { Sidebar } from './sidebar';

function CurrentPath() {
  const { pathname } = useLocation();
  return <div data-testid="current-path">{pathname}</div>;
}

const renderSidebar = (initialEntries: string[] = ['/dashboard'], initialIndex?: number) => {
  const queryClient = new QueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
        <Sidebar config={ADMIN_LAYOUT_CONFIG} />
        <CurrentPath />
        <Link to="/library">go-library</Link>
        <Link to="/dashboard">go-dashboard</Link>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...result, queryClient };
};

const currentPath = () => screen.getByTestId('current-path').textContent;

beforeEach(() => {
  vi.restoreAllMocks();
  useUiStore.setState({ sidebarCollapsed: false, sidebarMobileOpen: false });
  setAuthUser(FIXTURE_GENERAL_USER);
});

describe('Sidebar', () => {
  describe('通常モード', () => {
    test('ロゴ・新しいチャット・チャット検索・データ活用・外部サービスが出ること', () => {
      renderSidebar();

      expect(screen.getByAltText('SecuAiGent')).toBeInTheDocument();
      expect(screen.getByText('SIDEBAR.NEW_CHAT')).toBeInTheDocument();
      expect(screen.getByTestId('chat-search-button')).toBeInTheDocument();
      expect(screen.getByText('SIDEBAR.DATA_UTILIZATION')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'SIDEBAR.LIBRARY' })).toHaveAttribute(
        'href',
        '/library'
      );
      expect(screen.getByText('SIDEBAR.EXTERNAL_SERVICES')).toBeInTheDocument();
      expect(screen.getByText('SIDEBAR.RANABASE')).toBeInTheDocument();
    });

    test('用語集・データソースは出ないこと', () => {
      renderSidebar();

      expect(screen.queryByText('SIDEBAR.GLOSSARY')).not.toBeInTheDocument();
      expect(screen.queryByText('SIDEBAR.DATA_SOURCE')).not.toBeInTheDocument();
    });

    test('セクションの開閉ボタンで項目の領域の高さが切り替わること', async () => {
      renderSidebar();
      const user = userEvent.setup();
      const itemArea = () => screen.getByRole('link', { name: 'SIDEBAR.LIBRARY' }).parentElement;

      expect(itemArea()).toHaveStyle({ height: '36px' });

      await user.click(
        screen.getByRole('button', { name: 'toggle-section-SIDEBAR.DATA_UTILIZATION' })
      );
      expect(itemArea()).toHaveStyle({ height: '0px' });

      await user.click(screen.getByText('SIDEBAR.DATA_UTILIZATION'));
      expect(itemArea()).toHaveStyle({ height: '36px' });
    });

    test('Ranabase をクリックすると外部サイトを新しいタブで開くこと', async () => {
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
      renderSidebar();
      const user = userEvent.setup();

      await user.click(screen.getByText('SIDEBAR.RANABASE'));

      expect(openSpy).toHaveBeenCalledWith('https://ranabase.com', '_blank');
    });

    test('新しいチャットをクリックすると新しいチャットのダイアログが開くこと', async () => {
      renderSidebar();
      const user = userEvent.setup();

      await user.click(screen.getByText('SIDEBAR.NEW_CHAT'));

      expect(screen.getByRole('dialog', { name: 'NewChatDialogComponent' })).toBeInTheDocument();
    });

    test('チャット検索をクリックするとチャット検索のダイアログが開くこと', async () => {
      renderSidebar();
      const user = userEvent.setup();

      await user.click(screen.getByTestId('chat-search-button'));

      expect(screen.getByRole('dialog', { name: 'ChatSearchModalComponent' })).toBeInTheDocument();
    });
  });

  describe('管理モード', () => {
    test('テナント管理者には全管理メニューが出ること', () => {
      setAuthUser(FIXTURE_TENANT_ADMIN);
      renderSidebar(['/admin/tenant']);

      for (const label of [
        'ADMIN_CONSOLE.WORKSPACE_SETTINGS',
        'ADMIN_CONSOLE.USER_MANAGEMENT',
        'ADMIN_CONSOLE.TEAM_MANAGEMENT',
        'SIDEBAR.ASSISTANTS',
        'SIDEBAR.CHAT_HISTORY',
        'SIDEBAR.TRAINING_DATA',
        'SIDEBAR.FEEDBACK',
        'SIDEBAR.TEMPLATES',
      ]) {
        expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
      }
      expect(screen.queryByText('SIDEBAR.NEW_CHAT')).not.toBeInTheDocument();
    });

    test('グループ管理者だけのユーザーにはチーム管理だけが出ること', () => {
      setAuthUser(FIXTURE_GROUP_ADMIN);
      renderSidebar(['/admin/groups']);

      expect(screen.getByRole('link', { name: 'ADMIN_CONSOLE.TEAM_MANAGEMENT' })).toHaveAttribute(
        'href',
        '/admin/groups'
      );
      expect(
        screen.queryByRole('link', { name: 'ADMIN_CONSOLE.WORKSPACE_SETTINGS' })
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'SIDEBAR.ASSISTANTS' })).not.toBeInTheDocument();
    });

    test('グループ管理者だけのユーザーがグループ以外の管理画面にいるとグループ一覧へ移ること', () => {
      setAuthUser(FIXTURE_GROUP_ADMIN);
      renderSidebar(['/admin/management']);

      expect(currentPath()).toBe('/admin/groups');
    });
  });

  describe('戻るモード', () => {
    test('戻るボタンだけが出て、ユーザーメニューが隠れること', () => {
      renderSidebar(['/library/lib1']);

      expect(screen.getByText('ADMIN.LIBRARY.BACK')).toBeInTheDocument();
      expect(screen.queryByAltText('SecuAiGent')).not.toBeInTheDocument();
      expect(screen.queryByText('SIDEBAR.NEW_CHAT')).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'user-menu' }).parentElement?.parentElement
      ).toHaveClass('hidden');
    });

    test('戻るボタンを押すと履歴を 1 つ戻ること', async () => {
      renderSidebar(['/library', '/library/lib1'], 1);
      const user = userEvent.setup();

      await user.click(screen.getByText('ADMIN.LIBRARY.BACK'));

      expect(currentPath()).toBe('/library');
    });
  });

  describe('折りたたみ・モバイル', () => {
    test('折りたたみボタンをクリックすると sidebarCollapsed が反転すること', async () => {
      renderSidebar();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'toggle-sidebar' }));

      expect(useUiStore.getState().sidebarCollapsed).toBe(true);
    });

    test('モバイルで開いているときに折りたたみボタンを押すとモバイルのサイドバーが閉じること', async () => {
      useUiStore.setState({ sidebarMobileOpen: true });
      renderSidebar();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'toggle-sidebar' }));

      expect(useUiStore.getState().sidebarMobileOpen).toBe(false);
      expect(useUiStore.getState().sidebarCollapsed).toBe(false);
    });

    test('画面を移るとモバイルのサイドバーが閉じること', async () => {
      useUiStore.setState({ sidebarMobileOpen: true });
      renderSidebar();
      const user = userEvent.setup();

      expect(useUiStore.getState().sidebarMobileOpen).toBe(true);
      await user.click(screen.getByText('go-library'));

      expect(useUiStore.getState().sidebarMobileOpen).toBe(false);
    });
  });

  describe('キャッシュの更新', () => {
    test('ダッシュボードへ移るとアシスタント・テンプレートのキャッシュを無効化すること', async () => {
      const { queryClient } = renderSidebar(['/library']);
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const user = userEvent.setup();

      await user.click(screen.getByText('go-dashboard'));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['assistants'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['prompt-templates'] });
    });

    test('ダッシュボード・新規チャット以外へ移っても無効化しないこと', async () => {
      const { queryClient } = renderSidebar(['/dashboard']);
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const user = userEvent.setup();

      await user.click(screen.getByText('go-library'));

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  describe('ユーザーメニューとの連携', () => {
    test('管理画面への切り替え: テナント管理者はワークスペース設定へ移ること', async () => {
      setAuthUser(FIXTURE_TENANT_ADMIN);
      renderSidebar();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'user-menu' }));
      await user.click(screen.getByTestId('user-menu-switch-role-button'));

      expect(currentPath()).toBe('/admin/tenant');
    });

    test('管理画面への切り替え: グループ管理者はグループ一覧へ移ること', async () => {
      setAuthUser(FIXTURE_GROUP_ADMIN);
      renderSidebar();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'user-menu' }));
      expect(screen.getByText('USER_MENU.SWITCH_TO_TEAM_MANAGEMENT')).toBeInTheDocument();
      await user.click(screen.getByTestId('user-menu-switch-role-button'));

      expect(currentPath()).toBe('/admin/groups');
    });

    test('管理モードではチャットへの切り替えになり、新規チャットへ移ること', async () => {
      setAuthUser(FIXTURE_TENANT_ADMIN);
      renderSidebar(['/admin/tenant']);
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'user-menu' }));
      const switchButton = screen.getByTestId('user-menu-switch-role-button');
      expect(within(switchButton).getByText('USER_MENU.SWITCH_TO_CHAT')).toBeInTheDocument();
      await user.click(switchButton);

      expect(currentPath()).toBe('/chat/new');
    });

    test('テナント管理者の通常モードでは管理画面への切り替えと表示されること', async () => {
      setAuthUser(FIXTURE_TENANT_ADMIN);
      renderSidebar();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'user-menu' }));

      expect(screen.getByText('USER_MENU.SWITCH_TO_ADMIN')).toBeInTheDocument();
    });

    test('パスワード設定をクリックするとパスワードリセット画面へユーザーIDを付けて移ること', async () => {
      renderSidebar();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'user-menu' }));
      await user.click(screen.getByText('USER_MENU.PASSWORD_SETTINGS'));

      expect(currentPath()).toBe('/auth/password/reset');
    });

    test('クレジット確認をクリックするとクレジット確認のダイアログが開くこと', async () => {
      renderSidebar();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'user-menu' }));
      await user.click(screen.getByText('USER_MENU.CHECK_CREDIT'));

      expect(screen.getByRole('dialog', { name: 'UsageDialogComponent' })).toBeInTheDocument();
    });

    test('ログアウトを確認でキャンセルするとログアウトしないこと', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const logoutSpy = vi.spyOn(useAuthStore.getState(), 'logout');
      renderSidebar();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'user-menu' }));
      await user.click(screen.getByText('USER_MENU.LOGOUT'));

      expect(logoutSpy).not.toHaveBeenCalled();
    });

    test('ログアウトを確認で OK するとログアウトすること', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const logoutSpy = vi.spyOn(useAuthStore.getState(), 'logout').mockResolvedValue(undefined);
      renderSidebar();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'user-menu' }));
      await user.click(screen.getByText('USER_MENU.LOGOUT'));

      expect(logoutSpy).toHaveBeenCalled();
    });
  });
});
