import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MOCK_USERS } from '@/lib/constants/mock-data';
import { useLegacyUserStore } from '@/store/legacy-user-store';
import { FIXTURE_TENANT_ADMIN, renderApp, setAuthUser } from '@/test/render-app';

const ROW_COUNT_WITH_HEADER = MOCK_USERS.length + 1;

describe('UsersPage（旧ユーザー管理）', () => {
  beforeEach(() => {
    setAuthUser(FIXTURE_TENANT_ADMIN);
    useLegacyUserStore.setState({ users: [...MOCK_USERS] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setAuthUser(null);
  });

  describe('一覧', () => {
    test('モックのユーザーと件数が表示されること', async () => {
      renderApp('/users');

      expect(await screen.findByText('sogaku.admin')).toBeInTheDocument();
      expect(screen.getAllByRole('row')).toHaveLength(ROW_COUNT_WITH_HEADER);
      expect(screen.getByText('1 - 7 / 7 USERS.ITEMS')).toBeInTheDocument();
    });

    test('一般ユーザーは開けず、管理者だけが開けること', async () => {
      setAuthUser({ id: 'user1', name: '一般', role: 'USER', groups: [] });
      renderApp('/users');

      expect(screen.queryByText('USERS.TITLE')).not.toBeInTheDocument();
    });
  });

  describe('追加', () => {
    test('ユーザーを追加すると一覧に増えること', async () => {
      const user = userEvent.setup();
      renderApp('/users');

      await user.click(await screen.findByText('USERS.ADD_USER'));
      const modal = screen.getByText('ADMIN_CONSOLE.ADD_USER_TITLE').closest('div.bg-white') as HTMLElement;
      await user.type(within(modal).getAllByRole('textbox')[0], '新規 太郎');
      await user.type(within(modal).getAllByRole('textbox')[1], 'new.taro');
      await user.selectOptions(within(modal).getByRole('combobox'), 'user');
      await user.type(modal.querySelector('input[name="password"]') as HTMLInputElement, 'password123');
      await user.click(within(modal).getByText('ADMIN_CONSOLE.SAVE'));

      expect(await screen.findByText('new.taro')).toBeInTheDocument();
      expect(screen.getAllByRole('row')).toHaveLength(ROW_COUNT_WITH_HEADER + 1);
    });

    test('パスワードが短いと保存されずモーダルが開いたままになること', async () => {
      const user = userEvent.setup();
      renderApp('/users');

      await user.click(await screen.findByText('USERS.ADD_USER'));
      const modal = screen.getByText('ADMIN_CONSOLE.ADD_USER_TITLE').closest('div.bg-white') as HTMLElement;
      await user.type(within(modal).getAllByRole('textbox')[0], '新規');
      await user.type(within(modal).getAllByRole('textbox')[1], 'short.pw');
      await user.selectOptions(within(modal).getByRole('combobox'), 'admin');
      await user.type(modal.querySelector('input[name="password"]') as HTMLInputElement, 'short');
      await user.click(within(modal).getByText('ADMIN_CONSOLE.SAVE'));

      expect(screen.getByText('ADMIN_CONSOLE.ADD_USER_TITLE')).toBeInTheDocument();
      expect(screen.queryByText('short.pw')).not.toBeInTheDocument();
    });

    test('キャンセルするとモーダルが閉じること', async () => {
      const user = userEvent.setup();
      renderApp('/users');

      await user.click(await screen.findByText('USERS.ADD_USER'));
      await user.click(screen.getByText('ADMIN_CONSOLE.CANCEL'));

      expect(screen.queryByText('ADMIN_CONSOLE.ADD_USER_TITLE')).not.toBeInTheDocument();
    });
  });

  describe('編集・削除', () => {
    test('編集モーダルではユーザーIDを変更できず、表示名を更新できること', async () => {
      const user = userEvent.setup();
      renderApp('/users');

      await screen.findByText('sogaku.admin');
      await user.click(screen.getAllByTitle('編集')[0]);
      const modal = screen.getByText('ADMIN_CONSOLE.EDIT_USER_TITLE').closest('div.bg-white') as HTMLElement;
      const [displayName, userId] = within(modal).getAllByRole('textbox');
      expect(userId).toBeDisabled();
      await user.clear(displayName);
      await user.type(displayName, '更新後');
      await user.click(within(modal).getByText('ADMIN_CONSOLE.SAVE'));

      expect(await screen.findByText('更新後')).toBeInTheDocument();
    });

    test('確認でOKすると削除され、キャンセルすると残ること', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
      renderApp('/users');

      await screen.findByText('sogaku.admin');
      await user.click(screen.getAllByTitle('編集')[0]);
      await user.click(screen.getByText('COMMON.DELETE'));
      expect(confirmSpy).toHaveBeenCalledWith('USERS.DELETE_USER_CONFIRM');
      expect(screen.getByText('sogaku.admin')).toBeInTheDocument();

      await user.click(screen.getByText('COMMON.DELETE'));

      expect(screen.queryByText('sogaku.admin')).not.toBeInTheDocument();
      expect(screen.queryByText('ADMIN_CONSOLE.EDIT_USER_TITLE')).not.toBeInTheDocument();
    });
  });
});
