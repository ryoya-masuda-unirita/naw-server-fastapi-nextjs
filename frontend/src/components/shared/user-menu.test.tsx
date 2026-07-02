import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { UserMenu } from './user-menu';
import { useAuthStore } from '@/store/auth-store';

const renderUserMenu = () =>
  render(
    <BrowserRouter>
      <UserMenu collapsed={false} />
    </BrowserRouter>
  );

beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'u1', name: 'テスト太郎', role: 'USER', groups: [] },
    isAuthenticated: true,
    isAdmin: false,
    userName: 'テスト太郎',
  });
});

describe('UserMenu', () => {
  describe('初期表示', () => {
    test('ユーザー名が表示されること', () => {
      renderUserMenu();
      expect(screen.getByText('テスト太郎')).toBeInTheDocument();
    });

    test('メニューは閉じていること', () => {
      renderUserMenu();
      expect(screen.queryByText('USER_MENU.LOGOUT')).not.toBeInTheDocument();
    });
  });

  describe('メニューの開閉', () => {
    test('ボタンをクリックするとメニューが開くこと', async () => {
      renderUserMenu();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'user-menu' }));

      expect(screen.getByText('USER_MENU.LOGOUT')).toBeInTheDocument();
    });
  });

  describe('パスワード設定', () => {
    test('クリックすると /auth/pw-reset へ遷移すること', async () => {
      renderUserMenu();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'user-menu' }));
      await user.click(screen.getByText('USER_MENU.PASSWORD_SETTINGS'));

      expect(window.location.pathname).toBe('/auth/pw-reset');
    });
  });

  describe('ログアウト', () => {
    test('確認ダイアログでキャンセルした場合 logout が呼ばれないこと', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const logoutSpy = vi.spyOn(useAuthStore.getState(), 'logout');
      renderUserMenu();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'user-menu' }));
      await user.click(screen.getByText('USER_MENU.LOGOUT'));

      expect(logoutSpy).not.toHaveBeenCalled();
    });

    test('確認ダイアログでOKした場合 logout が呼ばれること', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const logoutSpy = vi
        .spyOn(useAuthStore.getState(), 'logout')
        .mockResolvedValue(undefined);
      renderUserMenu();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'user-menu' }));
      await user.click(screen.getByText('USER_MENU.LOGOUT'));

      expect(logoutSpy).toHaveBeenCalled();
    });
  });
});
