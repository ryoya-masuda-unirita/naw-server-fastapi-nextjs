import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useUiStore } from '@/store/ui-store';
import { FIXTURE_TENANT_ADMIN, renderApp, setAuthUser } from '@/test/render-app';

describe('旧ユーザー管理・レポート・設定の画面', () => {
  beforeEach(() => {
    setAuthUser(FIXTURE_TENANT_ADMIN);
  });

  afterEach(() => {
    setAuthUser(null);
    useUiStore.setState({ sidebarCollapsed: false });
  });

  describe('ユーザー追加・編集フォーム', () => {
    test('/users/new は新規追加の見出しとパスワード欄を表示すること', async () => {
      renderApp('/users/new');

      expect(await screen.findByRole('heading', { name: 'Add New User' })).toBeInTheDocument();
      expect(screen.getByLabelText('Password *')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create User' })).toBeInTheDocument();
    });

    test('/users/:id/edit は編集の見出しで固定のモック値が入り、パスワード欄がないこと', async () => {
      renderApp('/users/42/edit');

      expect(await screen.findByRole('heading', { name: 'Edit User' })).toBeInTheDocument();
      expect(screen.getByLabelText('First Name *')).toHaveValue('John');
      expect(screen.getByLabelText('Email Address *')).toHaveValue('john@example.com');
      expect(screen.queryByLabelText('Password *')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Update User' })).toBeInTheDocument();
    });

    test('保存を押すと Saving... を表示し、少し待つとユーザー一覧へ戻ること', async () => {
      const user = userEvent.setup();
      const { router } = renderApp('/users/new');

      await user.click(await screen.findByRole('button', { name: 'Create User' }));
      expect(screen.getByRole('button', { name: /Saving/ })).toBeDisabled();

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1700));
      });
      expect(router.state.location.pathname).toBe('/admin/users');
    });
  });

  describe('ユーザー詳細', () => {
    test('固定のモックのユーザー情報と、IDを含む編集リンクが表示されること', async () => {
      renderApp('/users/7');

      expect(await screen.findByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Edit User' })).toHaveAttribute('href', '/admin/users/7/edit');
    });
  });

  describe('レポート', () => {
    test('スタブの 3 つのカードが表示されること', async () => {
      renderApp('/reports');

      expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument();
      expect(screen.getByText('Sales Report')).toBeInTheDocument();
      expect(screen.getByText('User Report')).toBeInTheDocument();
      expect(screen.getByText('Growth Report')).toBeInTheDocument();
    });
  });

  describe('設定', () => {
    test('Compact Sidebar のトグルでサイドバーの折りたたみが切り替わること', async () => {
      const user = userEvent.setup();
      renderApp('/settings');

      const toggle = (await screen.findByText('Compact Sidebar'))
        .closest('.setting-item')!
        .querySelector('input') as HTMLInputElement;
      expect(toggle).not.toBeChecked();

      await user.click(toggle);

      expect(useUiStore.getState().sidebarCollapsed).toBe(true);
      expect(toggle).toBeChecked();
    });

    test('Email Notifications は最初からオン、Push Notifications はオフであること', async () => {
      renderApp('/settings');

      const checkboxOf = (title: string) =>
        screen.getByText(title).closest('.setting-item')!.querySelector('input') as HTMLInputElement;
      expect(await screen.findByText('Email Notifications')).toBeInTheDocument();
      expect(checkboxOf('Email Notifications')).toBeChecked();
      expect(checkboxOf('Push Notifications')).not.toBeChecked();
    });
  });
});
