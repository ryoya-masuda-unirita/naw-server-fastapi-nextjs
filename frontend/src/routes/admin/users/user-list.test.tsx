import { beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';
import { FIXTURE_TENANT_ADMIN, renderApp, setAuthUser } from '@/test/render-app';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { FIXTURE_ADMIN_USER_ROWS } from '@/mocks/handlers/admin-users';
import { useToastStore } from '@/components/shared/toast-store';
import { INITIAL_USER_LIST_FILTER } from '@/components/features/admin/users/user-list.constants';
import { useUserListStore } from '@/store/user-list-store';

const listPath = mockPath(API_PATHS.ADMIN.USERS.LIST);
const detailPath = mockPath(API_PATHS.ADMIN.USERS.DETAIL(':loginId'));

async function renderList() {
  const user = userEvent.setup();
  renderApp('/admin/users');
  await screen.findAllByTestId('admin-users-list-row');
  return user;
}

/** 追加ダイアログを開き、ダイアログが最初の入力欄へ当てるフォーカスが落ち着くまで待つ（途中で奪われて入力が欠けるのを防ぐ） */
async function openAddDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('admin-users-create-button'));
  const displayName = await screen.findByTestId('admin-users-display-name-input');
  await waitFor(() => expect(displayName).toHaveFocus());
  return displayName;
}

async function openRowMenu(user: ReturnType<typeof userEvent.setup>, rowIndex: number) {
  const rows = screen.getAllByTestId('admin-users-list-row');
  await user.click(within(rows[rowIndex]).getByTestId('admin-users-row-menu-button'));
}

beforeEach(() => {
  setAuthUser(FIXTURE_TENANT_ADMIN);
  useUserListStore.setState({ filter: { ...INITIAL_USER_LIST_FILTER }, selectedIds: new Set() });
  useToastStore.getState().clear();
  // jsdom には scrollIntoView がない
  Element.prototype.scrollIntoView = vi.fn();
});

describe('ユーザー管理一覧', () => {
  describe('初期表示', () => {
    test('ユーザーの行が表示され、利用クレジットが桁区切りで出ること', async () => {
      await renderList();

      const rows = screen.getAllByTestId('admin-users-list-row');
      expect(rows).toHaveLength(2);
      expect(within(rows[0]).getByText('山田太郎')).toBeInTheDocument();
      expect(within(rows[0]).getByText('1,234')).toBeInTheDocument();
      expect(within(rows[0]).getByText('ADMIN.USER_MANAGEMENT.ROLE_ADMIN')).toBeInTheDocument();
      expect(within(rows[1]).getByText('ADMIN.USER_MANAGEMENT.ROLE_GENERAL')).toBeInTheDocument();
    });

    test('ログインキーの列は値ではなく設定済み・未設定のアイコンだけを出すこと', async () => {
      await renderList();

      const statuses = screen.getAllByTestId('admin-users-login-key-status');
      expect(statuses[0]).toHaveAttribute('data-state', 'set');
      expect(statuses[1]).toHaveAttribute('data-state', 'unset');
      expect(screen.queryByText('secret-key')).not.toBeInTheDocument();
    });

    test('既定は名前の昇順で、includeUsage 付きで取得すること', async () => {
      const requested: URL[] = [];
      server.use(
        http.get(listPath, ({ request }) => {
          requested.push(new URL(request.url));
          return HttpResponse.json({ content: [], totalElements: 0, totalPages: 1, page: 0, size: 10 });
        })
      );
      renderApp('/admin/users');

      await screen.findByText('ADMIN.USER_MANAGEMENT.NO_DATA');
      const params = requested[0].searchParams;
      expect(params.get('sort')).toBe('name,asc');
      expect(params.get('includeUsage')).toBe('true');
      expect(params.get('page')).toBe('0');
      expect(params.get('searchText')).toBe('');
      expect(params.get('role')).toBe('');
    });

    test('0 件のときは見つからない旨を出すこと', async () => {
      server.use(
        http.get(listPath, () =>
          HttpResponse.json({ content: [], totalElements: 0, totalPages: 1, page: 0, size: 10 })
        )
      );
      renderApp('/admin/users');

      expect(await screen.findByText('ADMIN.USER_MANAGEMENT.NO_DATA')).toBeInTheDocument();
    });
  });

  describe('検索', () => {
    test('検索語を入力すると searchText を付けて取り直すこと', async () => {
      const user = await renderList();
      const searchTexts: string[] = [];
      server.use(
        http.get(listPath, ({ request }) => {
          searchTexts.push(new URL(request.url).searchParams.get('searchText') ?? '');
          return HttpResponse.json({ content: [], totalElements: 0, totalPages: 1, page: 0, size: 10 });
        })
      );

      await user.type(screen.getByTestId('user-search'), 'ta');

      await waitFor(() => expect(searchTexts).toContain('ta'));
    });
  });

  describe('権限フィルター・並べ替え・ページング', () => {
    /** 一覧の問い合わせのクエリを記録する（21 件あるものとして応答する） */
    function recordListRequests() {
      const requested: URLSearchParams[] = [];
      server.use(
        http.get(listPath, ({ request }) => {
          requested.push(new URL(request.url).searchParams);
          return HttpResponse.json({
            content: FIXTURE_ADMIN_USER_ROWS,
            totalElements: 21,
            totalPages: 3,
            page: 0,
            size: 10,
          });
        })
      );
      return requested;
    }

    const lastRequest = (requested: URLSearchParams[]) => requested[requested.length - 1] ?? new URLSearchParams();

    test('権限を選ぶと role を付けて 1 ページ目から取り直すこと', async () => {
      const requested = recordListRequests();
      const user = await renderList();

      await user.click(screen.getByText('ADMIN.USER_MANAGEMENT.ALL_ROLES'));
      await user.click(await screen.findByRole('option', { name: 'ADMIN.USER_MANAGEMENT.ROLE_ADMIN' }));

      await waitFor(() => expect(lastRequest(requested).get('role')).toBe('ADMIN'));
      expect(lastRequest(requested).get('page')).toBe('0');
    });

    test('並べ替えの項目と順序を選ぶと sort に反映すること', async () => {
      const requested = recordListRequests();
      const user = await renderList();

      await user.click(screen.getByTestId('user-sort-trigger'));
      await user.click((await screen.findAllByTestId('user-sort-field-option'))[2]);
      await waitFor(() => expect(lastRequest(requested).get('sort')).toBe('role,asc'));

      await user.click(screen.getByTestId('user-sort-trigger'));
      await user.click((await screen.findAllByTestId('user-sort-order-option'))[1]);
      await waitFor(() => expect(lastRequest(requested).get('sort')).toBe('role,desc'));
    });

    test('次のページへ進むと page を 1 にして取り直し、件数を表示すること', async () => {
      const requested = recordListRequests();
      const user = await renderList();

      await user.click(screen.getAllByLabelText('Next page')[0]);

      await waitFor(() => expect(lastRequest(requested).get('page')).toBe('1'));
      await screen.findAllByTestId('admin-users-list-row');
      expect(screen.getByText('11-20 / 21')).toBeInTheDocument();
    });
  });

  describe('選択と削除', () => {
    test('行を選ぶと作成ボタンが選択解除・削除ボタンに替わること', async () => {
      const user = await renderList();
      expect(screen.getByTestId('admin-users-create-button')).toBeInTheDocument();

      await user.click(screen.getAllByTestId('admin-users-list-row')[0]);

      expect(screen.queryByTestId('admin-users-create-button')).not.toBeInTheDocument();
      expect(screen.getByText('ADMIN.ASSISTANT.CLEAR_SELECTION')).toBeInTheDocument();
    });

    test('選んだユーザーをまとめて削除できること', async () => {
      const deleted: string[] = [];
      server.use(
        http.delete(detailPath, ({ params }) => {
          deleted.push(String(params.loginId));
          return new HttpResponse(null, { status: 204 });
        })
      );
      const user = await renderList();

      await user.click(screen.getAllByTestId('admin-users-list-row')[0]);
      await user.click(screen.getAllByTestId('admin-users-list-row')[1]);
      await user.click(screen.getByText('COMMON.DELETE'));
      await user.click(await screen.findByTestId('dialog-confirm-button'));

      await waitFor(() => expect(deleted.sort()).toEqual(['hanako', 'taro']));
      await waitFor(() =>
        expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
          'ADMIN.USER_MANAGEMENT.DELETE_SUCCESS'
        )
      );
      expect(screen.queryByTestId('dialog-confirm-button')).not.toBeInTheDocument();
    });

    test('行のメニューから 1 件だけ削除できること', async () => {
      const deleted: string[] = [];
      server.use(
        http.delete(detailPath, ({ params }) => {
          deleted.push(String(params.loginId));
          return new HttpResponse(null, { status: 204 });
        })
      );
      const user = await renderList();

      await openRowMenu(user, 1);
      await user.click(await screen.findByTestId('admin-users-delete-button'));
      await user.click(await screen.findByTestId('dialog-confirm-button'));

      await waitFor(() => expect(deleted).toEqual(['hanako']));
    });

    test('削除に失敗したらエラーのトーストを出し、ダイアログは閉じないこと', async () => {
      server.use(http.delete(detailPath, () => new HttpResponse(null, { status: 500 })));
      const user = await renderList();

      await openRowMenu(user, 0);
      await user.click(await screen.findByTestId('admin-users-delete-button'));
      await user.click(await screen.findByTestId('dialog-confirm-button'));

      await waitFor(() =>
        expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
          'ADMIN.USER_MANAGEMENT.DELETE_FAILED'
        )
      );
      expect(screen.getByTestId('dialog-confirm-button')).toBeInTheDocument();
    });
  });

  describe('ユーザーの追加', () => {
    test('表示名・ユーザーIDが空のまま作成するとエラーを出し、API を呼ばないこと', async () => {
      let called = false;
      server.use(
        http.post(listPath, () => {
          called = true;
          return HttpResponse.json({});
        })
      );
      const user = await renderList();

      await user.click(screen.getByTestId('admin-users-create-button'));
      await user.click(await screen.findByTestId('dialog-confirm-button'));

      expect(await screen.findByTestId('admin-users-display-name-input-error')).toHaveTextContent('VALIDATION.REQUIRED');
      expect(screen.getByTestId('admin-users-login-id-input-error')).toHaveTextContent('VALIDATION.REQUIRED');
      expect(called).toBe(false);
    });

    test('101 文字の表示名は最大文字数のエラーになること', async () => {
      const user = await renderList();

      await user.type(await openAddDialog(user), 'a'.repeat(101));
      await user.click(screen.getByTestId('dialog-confirm-button'));

      expect(await screen.findByTestId('admin-users-display-name-input-error')).toHaveTextContent('VALIDATION.MAX_LENGTH');
    });

    test('作成すると初期パスワードが 1 回だけ表示され、閉じると消えること', async () => {
      let body: unknown;
      server.use(
        http.post(listPath, async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({
            ...FIXTURE_ADMIN_USER_ROWS[1],
            initialPassword: 'InitPass123',
            passwordExpiredAt: '2026-12-31T00:00:00',
          });
        })
      );
      const user = await renderList();

      await user.type(await openAddDialog(user), ' 新規 ');
      await user.type(screen.getByTestId('admin-users-login-id-input'), ' new-user ');
      await user.click(screen.getByTestId('dialog-confirm-button'));

      expect(await screen.findByTestId('admin-users-initial-password-value')).toHaveTextContent('InitPass123');
      expect(body).toEqual({ loginId: 'new-user', name: '新規', role: 'USER' });
      expect(screen.queryByTestId('admin-users-login-key-value')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('admin-users-password-reveal-close-button'));
      expect(screen.queryByText('InitPass123')).not.toBeInTheDocument();
    });

    test('ログインキーの発行をオンにすると issueLoginKey を送り、発行されたキーを表示すること', async () => {
      let body: unknown;
      server.use(
        http.post(listPath, async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({
            ...FIXTURE_ADMIN_USER_ROWS[1],
            loginKey: 'issued-key-xyz',
            initialPassword: 'InitPass123',
            passwordExpiredAt: '2026-12-31T00:00:00',
          });
        })
      );
      const user = await renderList();

      await user.type(await openAddDialog(user), '新規');
      await user.type(screen.getByTestId('admin-users-login-id-input'), 'new-user');
      await user.click(within(screen.getByTestId('admin-users-issue-login-key-switch')).getByRole('switch'));
      await user.click(screen.getByTestId('dialog-confirm-button'));

      expect(await screen.findByTestId('admin-users-login-key-value')).toHaveTextContent('issued-key-xyz');
      expect(body).toMatchObject({ issueLoginKey: true });
    });

    test('作成に失敗したらエラーのトーストを出し、ダイアログを閉じないこと', async () => {
      server.use(http.post(listPath, () => new HttpResponse(null, { status: 409 })));
      const user = await renderList();

      await user.type(await openAddDialog(user), '新規');
      await user.type(screen.getByTestId('admin-users-login-id-input'), 'taro');
      await user.click(screen.getByTestId('dialog-confirm-button'));

      await waitFor(() =>
        expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
          'ADMIN.USER_MANAGEMENT.CREATE_FAILED'
        )
      );
      expect(screen.getByTestId('admin-users-display-name-input')).toBeInTheDocument();
    });
  });

  describe('ユーザーの編集', () => {
    test('ログインキーが未設定のユーザーでは「削除」が選べないこと', async () => {
      const user = await renderList();

      await openRowMenu(user, 1);
      await user.click(await screen.findByTestId('admin-users-edit-button'));

      expect(await screen.findByTestId('admin-users-edit-login-key-status')).toHaveAttribute('data-state', 'unset');
      expect(screen.getByTestId('admin-users-login-key-action-revoke')).toBeDisabled();
    });

    test('再発行を選んでも保存するまで API は呼ばず、保存すると loginKeyAction を送って新しいキーを表示すること', async () => {
      let body: unknown;
      let calls = 0;
      server.use(
        http.patch(detailPath, async ({ request, params }) => {
          calls += 1;
          body = { loginId: params.loginId, ...((await request.json()) as object) };
          return HttpResponse.json({
            ...FIXTURE_ADMIN_USER_ROWS[0],
            loginKey: 'new-key',
            initialPassword: null,
            passwordExpiredAt: null,
          });
        })
      );
      const user = await renderList();

      await openRowMenu(user, 0);
      await user.click(await screen.findByTestId('admin-users-edit-button'));
      await user.click(await screen.findByTestId('admin-users-login-key-action-reissue'));

      expect(screen.getByTestId('admin-users-login-key-pending-note')).toHaveTextContent(
        'ADMIN.USER_MANAGEMENT.LOGIN_KEY_WILL_REISSUE'
      );
      expect(calls).toBe(0);

      await user.click(screen.getByTestId('dialog-confirm-button'));

      expect(await screen.findByTestId('admin-users-login-key-value')).toHaveTextContent('new-key');
      expect(body).toEqual({
        loginId: 'taro',
        name: '山田太郎',
        role: 'ADMIN',
        loginKeyAction: 'REISSUE',
      });
    });

    test('変更しないのままなら loginKeyAction を送らず、結果のダイアログも出さないこと', async () => {
      let body: Record<string, unknown> = {};
      server.use(
        http.patch(detailPath, async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>;
          // キーを再発行していない更新では、応答にキーの平文は入らない（移植元 server の仕様）
          return HttpResponse.json({
            ...FIXTURE_ADMIN_USER_ROWS[0],
            loginKey: null,
            initialPassword: null,
            passwordExpiredAt: null,
          });
        })
      );
      const user = await renderList();

      await openRowMenu(user, 0);
      await user.click(await screen.findByTestId('admin-users-edit-button'));
      await user.click(await screen.findByTestId('dialog-confirm-button'));

      await waitFor(() =>
        expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
          'ADMIN.USER_MANAGEMENT.UPDATE_SUCCESS'
        )
      );
      expect(body).not.toHaveProperty('loginKeyAction');
      expect(screen.queryByTestId('admin-users-password-reveal-close-button')).not.toBeInTheDocument();
    });

    test('パスワードをリセットして保存すると初期パスワードが表示されること', async () => {
      let body: Record<string, unknown> = {};
      server.use(
        http.patch(detailPath, async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            ...FIXTURE_ADMIN_USER_ROWS[0],
            initialPassword: 'Reset456',
            passwordExpiredAt: '2026-12-31T00:00:00',
          });
        })
      );
      const user = await renderList();

      await openRowMenu(user, 0);
      await user.click(await screen.findByTestId('admin-users-edit-button'));
      await user.click(within(await screen.findByTestId('admin-users-reset-password-switch')).getByRole('switch'));
      await user.click(screen.getByTestId('dialog-confirm-button'));

      expect(await screen.findByTestId('admin-users-initial-password-value')).toHaveTextContent('Reset456');
      expect(body).toMatchObject({ resetPassword: true });
    });

    test('保存が拒否されたら結果のダイアログを出さず、編集ダイアログも閉じないこと', async () => {
      server.use(http.patch(detailPath, () => new HttpResponse(null, { status: 403 })));
      const user = await renderList();

      await openRowMenu(user, 0);
      await user.click(await screen.findByTestId('admin-users-edit-button'));
      await user.click(await screen.findByTestId('dialog-confirm-button'));

      await waitFor(() =>
        expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
          'ADMIN.USER_MANAGEMENT.UPDATE_FAILED'
        )
      );
      expect(screen.getByTestId('admin-users-display-name-input')).toBeInTheDocument();
    });
  });
});
