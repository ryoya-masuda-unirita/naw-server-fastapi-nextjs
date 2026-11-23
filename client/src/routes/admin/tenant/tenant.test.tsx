import { beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';
import { FIXTURE_TENANT_ADMIN, renderApp, setAuthUser } from '@/test/render-app';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { FIXTURE_TOKEN_USAGES, FIXTURE_WORKSPACE_USAGE } from '@/mocks/handlers/admin-tenant';
import { useToastStore } from '@/components/shared/toast-store';
import { useTenantUsageStore } from '@/store/tenant-store';

const listPath = mockPath(API_PATHS.ADMIN_TOKEN_USAGES.LIST);
const summaryPath = mockPath(API_PATHS.ADMIN_TOKEN_USAGES.SUMMARY);
const endpointsPath = mockPath(API_PATHS.ADMIN.TENANTS.ENDPOINTS(':tenantId'));
const endpointPath = mockPath(API_PATHS.ADMIN.TENANTS.ENDPOINT(':tenantId', ':endpointId'));
const tenantUpdatePath = mockPath(API_PATHS.ADMIN.TENANTS.UPDATE(':tenantId'));

const toastMessages = () => useToastStore.getState().toasts.map((toast) => toast.message);

async function renderUsage() {
  const user = userEvent.setup();
  renderApp('/admin/tenant');
  await screen.findAllByTestId('tenant-usage-row');
  return user;
}

async function renderApi() {
  const user = userEvent.setup();
  renderApp('/admin/tenant?tab=api');
  await screen.findAllByTestId('tenant-api-row');
  return user;
}

/** 利用履歴の問い合わせのクエリを記録する（12 件あるものとして応答する） */
function recordListRequests() {
  const requested: URLSearchParams[] = [];
  server.use(
    http.get(listPath, ({ request }) => {
      requested.push(new URL(request.url).searchParams);
      return HttpResponse.json({ ...FIXTURE_TOKEN_USAGES, totalCount: 12 });
    }),
  );
  return requested;
}

const lastRequest = (requested: URLSearchParams[]) => requested[requested.length - 1] ?? new URLSearchParams();

beforeEach(() => {
  setAuthUser(FIXTURE_TENANT_ADMIN);
  useTenantUsageStore.getState().reset();
  useToastStore.getState().clear();
  // jsdom には scrollIntoView がない
  Element.prototype.scrollIntoView = vi.fn();
});

describe('テナント管理', () => {
  describe('ヘッダーとタブ', () => {
    test('テナント名がタイトルに出て、既定は利用状況タブで tab クエリが補われること', async () => {
      const { router } = renderApp('/admin/tenant');
      await screen.findAllByTestId('tenant-usage-row');

      expect(screen.getByRole('heading', { name: 'テストテナント' })).toBeInTheDocument();
      expect(screen.getByText('TENANT.PLAN_INFO')).toBeInTheDocument();
      await waitFor(() => expect(router.state.location.search).toBe('?tab=usage'));
    });

    test('tab=api で API設定タブを開き、不正な値は利用状況タブに戻ること', async () => {
      const { router } = renderApp('/admin/tenant?tab=unknown');

      expect(await screen.findByText('TENANT.PLAN_INFO')).toBeInTheDocument();
      await waitFor(() => expect(router.state.location.search).toBe('?tab=usage'));
    });

    test('タブを切り替えると API設定タブが表示されること', async () => {
      const user = await renderUsage();

      await user.click(screen.getByText('TENANT.TAB_API'));

      expect(await screen.findByText('TENANT.CONFIGURED_API')).toBeInTheDocument();
    });
  });

  describe('利用状況タブ', () => {
    test('請求期間内の利用量・上限・プラン名・利用履歴の行が表示されること', async () => {
      await renderUsage();

      expect(screen.getByText('ライトプラン')).toBeInTheDocument();
      expect(screen.getByText('16 / 10,000 TENANT.CREDIT_UNIT')).toBeInTheDocument();
      const rows = screen.getAllByTestId('tenant-usage-row');
      expect(within(rows[0]).getByText('1,234')).toBeInTheDocument();
      expect(within(rows[0]).getByText('山田太郎')).toBeInTheDocument();
    });

    test('ドーナツは利用量÷上限の割合だけ円周を埋めること', async () => {
      await renderUsage();

      const circumference = 2 * Math.PI * 88;
      const offset = Number(screen.getByTestId('tenant-donut-progress').getAttribute('stroke-dashoffset'));
      expect(offset).toBeCloseTo(circumference * (1 - 16 / 10000), 5);
    });

    test('請求サイクルの起算日を from にして集計・一覧を取得すること', async () => {
      const summaryRequests: URLSearchParams[] = [];
      server.use(
        http.get(summaryPath, ({ request }) => {
          summaryRequests.push(new URL(request.url).searchParams);
          return HttpResponse.json({ totalCredits: 16 });
        }),
      );
      const requested = recordListRequests();
      await renderUsage();

      expect(summaryRequests[0].get('from')).toBe(FIXTURE_WORKSPACE_USAGE.periodFrom);
      const params = requested[0];
      expect(params.get('from')).toBe(FIXTURE_WORKSPACE_USAGE.periodFrom);
      expect(params.get('page')).toBe('0');
      expect(params.get('size')).toBe('5');
      expect(params.get('orderBy')).toBe('createdAt');
      expect(params.get('reverse')).toBe('true');
      expect(params.get('userId')).toBeNull();
    });

    test('利用者を選ぶと userId を付けて 1 ページ目から取り直すこと', async () => {
      const requested = recordListRequests();
      const user = await renderUsage();

      await user.click(screen.getByText('COMMON.PLACEHOLDERS.ALL_USERS'));
      await user.click(await screen.findByRole('option', { name: '山田太郎' }));

      await waitFor(() => expect(lastRequest(requested).get('userId')).toBe('u1'));
      expect(lastRequest(requested).get('page')).toBe('0');
    });

    test('並べ替えを選ぶと orderBy・reverse に反映すること', async () => {
      const requested = recordListRequests();
      const user = await renderUsage();

      await user.click(screen.getByTestId('tenant-usage-sort-trigger'));
      await user.click((await screen.findAllByTestId('tenant-usage-sort-field-option'))[1]);
      await waitFor(() => expect(lastRequest(requested).get('orderBy')).toBe('totalTokens'));
      expect(lastRequest(requested).get('reverse')).toBe('true');

      await user.click(screen.getByTestId('tenant-usage-sort-trigger'));
      await user.click((await screen.findAllByTestId('tenant-usage-sort-order-option'))[0]);
      await waitFor(() => expect(lastRequest(requested).get('reverse')).toBe('false'));
    });

    test('次のページへ進むと page を 1 にして取り直し、件数を表示すること', async () => {
      const requested = recordListRequests();
      const user = await renderUsage();
      expect(screen.getByTestId('tenant-usage-count')).toHaveTextContent('1-5件 / 12件');

      await user.click(screen.getByLabelText('COMMON.NEXT_PAGE'));

      await waitFor(() => expect(lastRequest(requested).get('page')).toBe('1'));
      await screen.findAllByTestId('tenant-usage-row');
      expect(screen.getByTestId('tenant-usage-count')).toHaveTextContent('6-10件 / 12件');
    });

    test('0 件のときはデータなしを表示すること', async () => {
      server.use(http.get(listPath, () => HttpResponse.json({ contents: [], totalCount: 0, hasNext: false })));
      renderApp('/admin/tenant');

      expect(await screen.findByText('TENANT.NO_DATA')).toBeInTheDocument();
      expect(screen.getByTestId('tenant-usage-count')).toHaveTextContent('0-0件 / 0件');
    });

    test('移植元でコメントアウトされている利用制限のパネルは表示しないこと', async () => {
      await renderUsage();

      expect(screen.queryByText('TENANT.WS_LIMIT')).not.toBeInTheDocument();
      expect(screen.queryByText('TENANT.USER_LIMIT')).not.toBeInTheDocument();
    });
  });

  describe('ワークスペース名の変更', () => {
    async function openRenameDialog(user: ReturnType<typeof userEvent.setup>) {
      const heading = screen.getByRole('heading', { name: 'テストテナント' });
      await user.click(within(heading.parentElement as HTMLElement).getByRole('button'));
      return screen.findByTestId('tenant-rename-input');
    }

    test('現在の名前が入った状態で開き、空では保存できないこと', async () => {
      const user = await renderUsage();
      const input = await openRenameDialog(user);
      expect(input).toHaveValue('テストテナント');

      await user.clear(input);
      expect(screen.getByTestId('dialog-confirm-button')).toBeDisabled();
      await user.type(input, '   ');
      expect(screen.getByTestId('dialog-confirm-button')).toBeDisabled();
    });

    test('名前を trim して送信し、成功トーストを出してダイアログを閉じること', async () => {
      const bodies: unknown[] = [];
      server.use(
        http.patch(tenantUpdatePath, async ({ request }) => {
          bodies.push(await request.json());
          return HttpResponse.json({});
        }),
      );
      const user = await renderUsage();
      const input = await openRenameDialog(user);

      await user.clear(input);
      await user.type(input, ' 新しい名前 ');
      await user.click(screen.getByTestId('dialog-confirm-button'));

      await waitFor(() => expect(bodies).toEqual([{ tenantName: '新しい名前' }]));
      await waitFor(() => expect(toastMessages()).toContain('TENANT.UPDATE_TENANT_SUCCESS'));
      expect(screen.queryByTestId('tenant-rename-input')).not.toBeInTheDocument();
    });

    test('失敗したらトーストを出してダイアログを残すこと', async () => {
      server.use(http.patch(tenantUpdatePath, () => HttpResponse.json({ message: 'ng' }, { status: 500 })));
      const user = await renderUsage();
      await openRenameDialog(user);

      await user.click(screen.getByTestId('dialog-confirm-button'));

      await waitFor(() => expect(toastMessages()).toContain('TENANT.UPDATE_TENANT_FAILED'));
      expect(screen.getByTestId('tenant-rename-input')).toBeInTheDocument();
    });
  });

  describe('API設定タブ', () => {
    test('API の行を表示し、LOCAL_SERVER 以外は無効の歯車にすること', async () => {
      await renderApi();

      const rows = screen.getAllByTestId('tenant-api-row');
      expect(rows).toHaveLength(2);
      expect(within(rows[0]).getByText('社内Waha')).toBeInTheDocument();
      expect(within(rows[0]).getByText('*****')).toBeInTheDocument();
      expect(within(rows[0]).getByTestId('tenant-api-row-menu-button')).toBeInTheDocument();
      expect(within(rows[1]).queryByTestId('tenant-api-row-menu-button')).not.toBeInTheDocument();
      expect(within(rows[1]).getByRole('button', { name: 'TENANT.EDIT_API_SETTING' })).toBeDisabled();
    });

    test('0 件のときはデータなしを表示すること', async () => {
      server.use(http.get(endpointsPath, () => HttpResponse.json([])));
      renderApp('/admin/tenant?tab=api');

      expect(await screen.findByText('TENANT.NO_DATA')).toBeInTheDocument();
    });

    test('APIキーを生成するまで作成できず、生成後は 32 文字の英数字をコピーできること', async () => {
      const user = await renderApi();
      // userEvent.setup() が clipboard を差し替えるため、setup の後に監視する
      const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
      await user.click(screen.getByTestId('tenant-add-api-button'));

      await user.type(await screen.findByTestId('tenant-api-name-input'), 'My Waha');
      await user.type(screen.getByTestId('tenant-api-url-input'), 'https://my.example.com');
      expect(screen.getByTestId('dialog-confirm-button')).toBeDisabled();

      await user.click(screen.getByTestId('tenant-api-generate-button'));
      expect((screen.getByTestId('tenant-api-key-input') as HTMLInputElement).value).toMatch(/^[A-Za-z0-9]{32}$/);
      expect(screen.getByTestId('dialog-confirm-button')).toBeEnabled();

      await user.click(screen.getByTestId('tenant-api-copy-button'));
      expect(writeText).toHaveBeenCalledWith((screen.getByTestId('tenant-api-key-input') as HTMLInputElement).value);
    });

    test('入力した内容で作成し、成功トーストを出してダイアログを閉じること', async () => {
      const bodies: Record<string, string>[] = [];
      server.use(
        http.post(endpointsPath, async ({ request }) => {
          bodies.push((await request.json()) as Record<string, string>);
          return HttpResponse.json({ id: 'ep3' });
        }),
      );
      const user = await renderApi();
      await user.click(screen.getByTestId('tenant-add-api-button'));
      await user.type(await screen.findByTestId('tenant-api-name-input'), 'My Waha');
      await user.type(screen.getByTestId('tenant-api-url-input'), 'https://my.example.com');
      await user.click(screen.getByTestId('tenant-api-generate-button'));

      await user.click(screen.getByTestId('dialog-confirm-button'));

      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).toMatchObject({
        endpointName: 'My Waha',
        type: 'LOCAL_SERVER',
        endpoint: 'https://my.example.com',
      });
      expect(bodies[0].apiKey).toMatch(/^[A-Za-z0-9]{32}$/);
      await waitFor(() => expect(toastMessages()).toContain('TENANT.CREATE_ENDPOINT_SUCCESS'));
      expect(screen.queryByTestId('tenant-api-name-input')).not.toBeInTheDocument();
    });

    test('作成に失敗したらトーストを出してダイアログを残すこと', async () => {
      server.use(http.post(endpointsPath, () => HttpResponse.json({ message: 'ng' }, { status: 500 })));
      const user = await renderApi();
      await user.click(screen.getByTestId('tenant-add-api-button'));
      await user.type(await screen.findByTestId('tenant-api-name-input'), 'My Waha');
      await user.type(screen.getByTestId('tenant-api-url-input'), 'https://my.example.com');
      await user.click(screen.getByTestId('tenant-api-generate-button'));

      await user.click(screen.getByTestId('dialog-confirm-button'));

      await waitFor(() => expect(toastMessages()).toContain('TENANT.CREATE_ENDPOINT_FAILED'));
      expect(screen.getByTestId('tenant-api-name-input')).toBeInTheDocument();
    });

    test('編集ダイアログは既存の値で開き、APIキーを作り直すと更新できること', async () => {
      const bodies: Record<string, string>[] = [];
      server.use(
        http.patch(endpointPath, async ({ request, params }) => {
          bodies.push({ ...((await request.json()) as Record<string, string>), endpointId: String(params.endpointId) });
          return HttpResponse.json({ id: 'ep1' });
        }),
      );
      const user = await renderApi();
      await user.click(within(screen.getAllByTestId('tenant-api-row')[0]).getByTestId('tenant-api-row-menu-button'));
      await user.click(await screen.findByTestId('tenant-api-edit-button'));

      expect(await screen.findByTestId('tenant-api-name-input')).toHaveValue('社内Waha');
      expect(screen.getByTestId('tenant-api-url-input')).toHaveValue('https://waha.example.com');
      // backend は API キーを返さないため、作り直すまで保存できない
      expect(screen.getByTestId('dialog-confirm-button')).toBeDisabled();

      await user.click(screen.getByTestId('tenant-api-generate-button'));
      await user.click(screen.getByTestId('dialog-confirm-button'));

      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).toMatchObject({ endpointId: 'ep1', endpointName: '社内Waha', type: 'LOCAL_SERVER' });
      await waitFor(() => expect(toastMessages()).toContain('TENANT.UPDATE_ENDPOINT_SUCCESS'));
    });

    test('メニューから削除を確認して実行し、成功トーストを出すこと', async () => {
      const deleted: string[] = [];
      server.use(
        http.delete(endpointPath, ({ params }) => {
          deleted.push(String(params.endpointId));
          return new HttpResponse(null, { status: 204 });
        }),
      );
      const user = await renderApi();
      await user.click(within(screen.getAllByTestId('tenant-api-row')[0]).getByTestId('tenant-api-row-menu-button'));
      await user.click(await screen.findByTestId('tenant-api-delete-button'));
      expect(await screen.findByText('TENANT.DELETE_API_MESSAGE')).toBeInTheDocument();

      await user.click(screen.getByTestId('dialog-confirm-button'));

      await waitFor(() => expect(deleted).toEqual(['ep1']));
      await waitFor(() => expect(toastMessages()).toContain('TENANT.DELETE_ENDPOINT_SUCCESS'));
      expect(screen.queryByText('TENANT.DELETE_API_MESSAGE')).not.toBeInTheDocument();
    });

    test('削除に失敗したらトーストを出して確認ダイアログを残すこと', async () => {
      server.use(http.delete(endpointPath, () => HttpResponse.json({ message: 'ng' }, { status: 500 })));
      const user = await renderApi();
      await user.click(within(screen.getAllByTestId('tenant-api-row')[0]).getByTestId('tenant-api-row-menu-button'));
      await user.click(await screen.findByTestId('tenant-api-delete-button'));

      await user.click(await screen.findByTestId('dialog-confirm-button'));

      await waitFor(() => expect(toastMessages()).toContain('TENANT.DELETE_ENDPOINT_FAILED'));
      expect(screen.getByText('TENANT.DELETE_API_MESSAGE')).toBeInTheDocument();
    });
  });
});
