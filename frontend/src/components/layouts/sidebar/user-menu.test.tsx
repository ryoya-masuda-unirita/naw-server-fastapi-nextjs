import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN_LAYOUT_CONFIG } from '@/lib/constants/layout';
import { UserMenu } from './user-menu';

const renderUserMenu = (
  props: { canShowSwitchRole?: boolean; sidebarCollapsed?: boolean } = {}
) => {
  const onAction = vi.fn();
  render(
    <UserMenu
      actions={ADMIN_LAYOUT_CONFIG.userMenuActions}
      userName="テスト太郎"
      sidebarCollapsed={props.sidebarCollapsed ?? false}
      canShowSwitchRole={props.canShowSwitchRole ?? false}
      onAction={onAction}
    />
  );
  return { onAction };
};

describe('UserMenu', () => {
  describe('初期表示', () => {
    test('ユーザー名とアバターが表示されること', () => {
      renderUserMenu();

      expect(screen.getByText('テスト太郎')).toBeInTheDocument();
      expect(screen.getByAltText('User Avatar')).toHaveAttribute(
        'src',
        '/icons/default-avt-icon.svg'
      );
    });

    test('メニューは閉じていること', () => {
      renderUserMenu();

      expect(screen.queryByText('USER_MENU.LOGOUT')).not.toBeInTheDocument();
    });

    test('折りたたみ時はユーザー名を隠すこと', () => {
      renderUserMenu({ sidebarCollapsed: true });

      expect(screen.getByText('テスト太郎').parentElement).toHaveClass('invisible');
    });
  });

  describe('メニュー', () => {
    test('開くとパスワード設定・クレジット確認・ログアウトが出ること', async () => {
      renderUserMenu();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'user-menu' }));

      expect(screen.getByText('USER_MENU.PASSWORD_SETTINGS')).toBeInTheDocument();
      expect(screen.getByText('USER_MENU.CHECK_CREDIT')).toBeInTheDocument();
      expect(screen.getByText('USER_MENU.LOGOUT')).toBeInTheDocument();
    });

    test('管理コンソールに入れないユーザーには管理画面への切り替えを隠すこと', async () => {
      renderUserMenu({ canShowSwitchRole: false });
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'user-menu' }));

      expect(screen.getByTestId('user-menu-switch-role-button').parentElement).toHaveClass(
        'hidden'
      );
    });

    test('管理コンソールに入れるユーザーには管理画面への切り替えを出すこと', async () => {
      renderUserMenu({ canShowSwitchRole: true });
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'user-menu' }));

      expect(screen.getByTestId('user-menu-switch-role-button').parentElement).not.toHaveClass(
        'hidden'
      );
    });

    test('項目をクリックすると onAction が呼ばれ、メニューが閉じること', async () => {
      const { onAction } = renderUserMenu();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'user-menu' }));
      await user.click(screen.getByText('USER_MENU.CHECK_CREDIT'));

      expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'check-credit' }));
      expect(screen.queryByText('USER_MENU.LOGOUT')).not.toBeInTheDocument();
    });

    test('メニューの外をクリックすると閉じること', async () => {
      renderUserMenu();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'user-menu' }));
      await user.click(document.body);

      expect(screen.queryByText('USER_MENU.LOGOUT')).not.toBeInTheDocument();
    });
  });
});
