import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { server } from '@/test/setup';
import {
  FIXTURE_GROUP_ADMIN,
  FIXTURE_TENANT_ADMIN,
  renderApp,
  setAuthUser,
} from '@/test/render-app';
import { useGroupListStore } from '@/store/group-list-store';
import { useToastStore } from '@/components/shared/toast-store';

const FIXTURE_GROUPS = [
  {
    id: 'g1',
    tenantId: 'tenant',
    name: '営業チーム',
    users: ['u1', 'u2'],
    adminUserIds: ['u1'],
    adminUserNames: ['山田'],
    userNames: ['山田', '鈴木'],
    assistants: ['営業アシスタント'],
    assistantIds: ['a1'],
    promptTemplates: ['議事録'],
    promptTemplateIds: ['t1'],
    updatedAt: '2026-11-01T09:05:00',
  },
  {
    // 一覧に名前が無いので、グループ内の一覧で補われる
    id: 'g2',
    tenantId: 'tenant',
    name: '開発チーム',
    users: [],
    adminUserIds: [],
    adminUserNames: [],
    userNames: [],
    assistants: [],
    assistantIds: [],
    promptTemplates: [],
    promptTemplateIds: [],
    updatedAt: '2026-10-01T12:00:00',
  },
];

const LIST_PATH = mockPath(API_PATHS.ADMIN.GROUPS.LIST);

interface RequestLog {
  listParams: URLSearchParams[];
  created: unknown[];
}

/** 一覧・名前の対応表・グループ内の一覧・作成の API を差し替え、受けたリクエストを記録する */
function mockApis(options: { createFails?: boolean; total?: number } = {}): RequestLog {
  const log: RequestLog = { listParams: [], created: [] };
  server.use(
    http.get(LIST_PATH, ({ request }) => {
      log.listParams.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        data: FIXTURE_GROUPS,
        total: options.total ?? 7,
        page: 0,
        size: 5,
      });
    }),
    http.get(mockPath(API_PATHS.ADMIN.GROUPS.USERS(':groupId')), () =>
      HttpResponse.json({
        content: [
          { userId: 'x1', name: 'dev-admin', displayName: '開発太郎', groupAdmin: true },
          { userId: 'x2', name: 'dev-member', displayName: null, groupAdmin: false },
        ],
        totalElements: 2,
        number: 0,
        size: 100,
      }),
    ),
    http.post(LIST_PATH, async ({ request }) => {
      if (options.createFails) return HttpResponse.json({ message: 'ng' }, { status: 400 });
      const body = await request.json();
      log.created.push(body);
      return HttpResponse.json({ id: 'new1', tenantId: 'tenant', ...(body as object) });
    }),
  );
  return log;
}

async function renderPage(user = FIXTURE_TENANT_ADMIN) {
  setAuthUser(user);
  const result = renderApp('/admin/groups');
  await screen.findByText('営業チーム');
  return result;
}

beforeEach(() => {
  useGroupListStore.getState().reset();
  useToastStore.getState().clear();
});

afterEach(() => {
  setAuthUser(null);
});

describe('GroupListPage', () => {
  describe('一覧の表示', () => {
    test('グループ名・管理者・所属・更新日時がカードに表示されること', async () => {
      mockApis();
      await renderPage();

      expect(screen.getAllByTestId('admin-groups-list-card')).toHaveLength(2);
      expect(screen.getByText('山田、鈴木')).toBeInTheDocument();
      expect(screen.getByText('営業アシスタント')).toBeInTheDocument();
      expect(screen.getByText('2026/11/01 09:05')).toBeInTheDocument();
      // 件数表示（テストでは i18n 未初期化のため t() はキーを返す）
      expect(screen.getByText('GROUPS.PAGE_COUNT')).toBeInTheDocument();
    });

    test('グループが 0 件のとき、データがない旨を表示すること', async () => {
      setAuthUser(FIXTURE_TENANT_ADMIN);
      renderApp('/admin/groups');
      expect(await screen.findByText('GROUPS.NO_DATA')).toBeInTheDocument();
    });

    test('初期表示では更新日時の降順で 1 ページ 5 件を取得すること', async () => {
      const log = mockApis();
      await renderPage();

      const params = log.listParams[0];
      expect(params.get('page')).toBe('0');
      expect(params.get('size')).toBe('5');
      expect(params.get('sort')).toBe('updatedAt,desc');
    });

    test('一覧に名前がないグループは、グループ内の一覧で補うこと', async () => {
      mockApis();
      await renderPage();

      expect(await screen.findByText('開発太郎')).toBeInTheDocument();
      expect(screen.getByText('開発太郎、dev-member')).toBeInTheDocument();
    });

    test('名前のない項目は「—」を表示すること', async () => {
      mockApis();
      await renderPage();

      await waitFor(() => expect(screen.getAllByText('—').length).toBeGreaterThan(0));
    });
  });

  describe('検索', () => {
    test('検索ワードを入力すると q を付けて取得し直すこと', async () => {
      const log = mockApis();
      await renderPage();

      await userEvent.type(screen.getByPlaceholderText('GROUPS.SEARCH_PLACEHOLDER'), 'a');

      await waitFor(() => expect(log.listParams.some((p) => p.get('q') === 'a')).toBe(true));
    });
  });

  describe('ページ送り', () => {
    test('下のページ送りで次のページを取得すること', async () => {
      const log = mockApis();
      await renderPage();

      await userEvent.click(screen.getByRole('button', { name: '2' }));

      await waitFor(() => expect(log.listParams.some((p) => p.get('page') === '1')).toBe(true));
    });
  });

  describe('作成', () => {
    test('チーム名を入力して作成できること', async () => {
      const log = mockApis();
      await renderPage();

      await userEvent.click(screen.getByTestId('admin-groups-create-button'));
      await userEvent.type(await screen.findByTestId('admin-groups-name-input'), ' 新チーム ');
      await userEvent.click(screen.getByTestId('dialog-confirm-button'));

      await waitFor(() => expect(log.created).toHaveLength(1));
      expect(log.created[0]).toEqual({ name: '新チーム' });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
        'GROUPS.CREATE_SUCCESS',
      );
    });

    test('チーム名が空のまま作成するとエラーを表示して送信しないこと', async () => {
      const log = mockApis();
      await renderPage();

      await userEvent.click(screen.getByTestId('admin-groups-create-button'));
      await userEvent.click(await screen.findByTestId('dialog-confirm-button'));

      expect(await screen.findByTestId('admin-groups-name-input-error')).toBeInTheDocument();
      expect(log.created).toHaveLength(0);
    });

    test('チーム名が 100 文字を超えるとエラーを表示して送信しないこと', async () => {
      const log = mockApis();
      await renderPage();

      await userEvent.click(screen.getByTestId('admin-groups-create-button'));
      await userEvent.type(await screen.findByTestId('admin-groups-name-input'), 'あ'.repeat(101));
      await userEvent.click(screen.getByTestId('dialog-confirm-button'));

      expect(await screen.findByTestId('admin-groups-name-input-error')).toBeInTheDocument();
      expect(log.created).toHaveLength(0);
    });

    test('作成に失敗したらエラートーストを出してダイアログを残すこと', async () => {
      mockApis({ createFails: true });
      await renderPage();

      await userEvent.click(screen.getByTestId('admin-groups-create-button'));
      await userEvent.type(await screen.findByTestId('admin-groups-name-input'), '新チーム');
      await userEvent.click(screen.getByTestId('dialog-confirm-button'));

      await waitFor(() =>
        expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
          'GROUPS.CREATE_FAILED',
        ),
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('権限', () => {
    test('グループ管理者には新規作成ボタンを表示しないこと', async () => {
      mockApis();
      await renderPage(FIXTURE_GROUP_ADMIN);

      expect(screen.queryByTestId('admin-groups-create-button')).not.toBeInTheDocument();
    });
  });

  describe('詳細への遷移', () => {
    test('閲覧・編集ボタンでグループ詳細のユーザータブへ移動すること', async () => {
      mockApis();
      const { router } = await renderPage();

      await userEvent.click(screen.getAllByTestId('admin-groups-view-edit-button')[0]);

      expect(router.state.location.pathname).toBe('/admin/groups/g1/users');
    });
  });
});
