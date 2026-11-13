import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useToastStore } from '@/components/shared/toast-store';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import {
  FIXTURE_GROUP_ADMIN,
  FIXTURE_TENANT_ADMIN,
  renderApp,
  setAuthUser,
} from '@/test/render-app';
import { server } from '@/test/setup';
import { useGroupAssistantsStore } from '@/store/group-assistants-store';
import { useGroupTemplatesStore } from '@/store/group-templates-store';
import { useGroupUsersStore } from '@/store/group-users-store';
import type { User } from '@/types/auth';

const GROUP_ID = 'g1';

const DETAIL_PATH = mockPath(API_PATHS.ADMIN.GROUPS.DETAIL(':groupId'));
const USERS_PATH = mockPath(API_PATHS.ADMIN.GROUPS.USERS(':groupId'));
const USER_DETAIL_PATH = mockPath(API_PATHS.ADMIN.GROUPS.USER_DETAIL(':groupId', ':userId'));
const ASSISTANTS_PATH = mockPath(API_PATHS.ADMIN.GROUPS.ASSISTANTS(':groupId'));
const ASSISTANT_DETAIL_PATH = mockPath(
  API_PATHS.ADMIN.GROUPS.ASSISTANT_DETAIL(':groupId', ':assistantId'),
);
const TEMPLATES_PATH = mockPath(API_PATHS.ADMIN.GROUPS.TEMPLATES(':groupId'));
const TEMPLATE_DETAIL_PATH = mockPath(
  API_PATHS.ADMIN.GROUPS.TEMPLATE_DETAIL(':groupId', ':templateId'),
);
const TENANT_USERS_PATH = mockPath(API_PATHS.ADMIN.USERS.LIST);
const TENANT_ASSISTANTS_PATH = mockPath(API_PATHS.ADMIN.ASSISTANTS.LIST);
const TENANT_TEMPLATES_PATH = mockPath(API_PATHS.ADMIN.PROMPT_TEMPLATES.LIST);

const FIXTURE_MEMBERS = [
  {
    userId: 'u1',
    name: 'yamada',
    displayName: '山田太郎',
    role: 'USER',
    groupAdmin: true,
    totalCredits: 12345,
    updatedAt: '2026-11-01T09:05:00',
  },
  {
    userId: 'u2',
    name: 'suzuki',
    displayName: '鈴木花子',
    role: 'USER',
    groupAdmin: false,
    updatedAt: '2026-11-02T10:00:00',
  },
  {
    // ログインユーザー（FIXTURE_TENANT_ADMIN）自身
    userId: 'admin1',
    name: '管理者',
    displayName: '管理者',
    role: 'ADMIN',
    groupAdmin: true,
    totalCredits: 0,
    updatedAt: '2026-11-03T10:00:00',
  },
];

const FIXTURE_ASSISTANTS = [
  {
    id: 'a1',
    name: '営業アシスタント',
    description: '営業向け',
    type: 'SECURE',
    includeHistory: true,
    iconColor: '#000000',
    categories: [{ id: 'c1', name: '営業', description: '' }],
    endpoints: [{ id: 'e1', label: 'GPT-4', model: 'gpt-4' }],
    addedAt: '2026-01-15T09:30:00',
  },
  {
    id: 'a2',
    name: '開発アシスタント',
    description: '',
    type: 'SAAS_CHAT',
    includeHistory: false,
    iconColor: '#000000',
    endpoints: [],
    addedAt: '2026-01-16T09:30:00',
  },
];

const FIXTURE_TEMPLATES = [
  {
    id: 't1',
    name: '議事録',
    description: '会議の議事録',
    systemPrompt: '議事録を作成してください',
    updatedAt: '2026-02-01T10:00:00',
    addedAt: '2026-02-02T10:00:00',
  },
];

interface RequestLog {
  /** 一覧（所属ユーザー・アシスタント・テンプレート）の問い合わせ */
  listParams: URLSearchParams[];
  /** 追加ダイアログの候補（テナント全体の一覧）の問い合わせ */
  optionParams: URLSearchParams[];
  patched: unknown[];
  posted: unknown[];
  deleted: string[];
}

/** グループ詳細とその一覧・変更の API を差し替え、受けたリクエストを記録する */
function mockApis(options: { updateFails?: boolean } = {}): RequestLog {
  const log: RequestLog = { listParams: [], optionParams: [], patched: [], posted: [], deleted: [] };
  const page = (content: unknown[]) => ({
    content,
    totalElements: content.length,
    number: 0,
    size: 25,
  });
  server.use(
    http.get(DETAIL_PATH, ({ params }) =>
      HttpResponse.json({ id: params.groupId, tenantId: 'tenant', name: '営業チーム' }),
    ),
    http.patch(DETAIL_PATH, async ({ request, params }) => {
      if (options.updateFails) return HttpResponse.json({ message: 'ng' }, { status: 400 });
      const body = (await request.json()) as { name: string };
      log.patched.push(body);
      return HttpResponse.json({ id: params.groupId, tenantId: 'tenant', name: body.name });
    }),
    http.delete(DETAIL_PATH, ({ params }) => {
      log.deleted.push(`group:${String(params.groupId)}`);
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(USERS_PATH, ({ request }) => {
      log.listParams.push(new URL(request.url).searchParams);
      return HttpResponse.json(page(FIXTURE_MEMBERS));
    }),
    http.post(USERS_PATH, async ({ request }) => {
      log.posted.push(await request.json());
      return new HttpResponse(null, { status: 204 });
    }),
    http.patch(USER_DETAIL_PATH, async ({ request, params }) => {
      log.patched.push({ userId: params.userId, ...((await request.json()) as object) });
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(USER_DETAIL_PATH, ({ params }) => {
      log.deleted.push(`user:${String(params.userId)}`);
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(ASSISTANTS_PATH, ({ request }) => {
      log.listParams.push(new URL(request.url).searchParams);
      return HttpResponse.json(page(FIXTURE_ASSISTANTS));
    }),
    http.post(ASSISTANTS_PATH, async ({ request }) => {
      log.posted.push(await request.json());
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(ASSISTANT_DETAIL_PATH, ({ params }) => {
      log.deleted.push(`assistant:${String(params.assistantId)}`);
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(TEMPLATES_PATH, ({ request }) => {
      log.listParams.push(new URL(request.url).searchParams);
      return HttpResponse.json(page(FIXTURE_TEMPLATES));
    }),
    http.post(TEMPLATES_PATH, async ({ request }) => {
      log.posted.push(await request.json());
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(TEMPLATE_DETAIL_PATH, ({ params }) => {
      log.deleted.push(`template:${String(params.templateId)}`);
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(TENANT_USERS_PATH, ({ request }) => {
      log.optionParams.push(new URL(request.url).searchParams);
      return HttpResponse.json(
        page([{ id: 'u9', loginId: 'new-user', name: '新人', role: 'USER' }]),
      );
    }),
    http.get(TENANT_ASSISTANTS_PATH, ({ request }) => {
      log.optionParams.push(new URL(request.url).searchParams);
      return HttpResponse.json(
        page([{ id: 'a9', name: '新アシスタント', description: '説明', type: 'SECURE' }]),
      );
    }),
    http.get(TENANT_TEMPLATES_PATH, ({ request }) => {
      log.optionParams.push(new URL(request.url).searchParams);
      return HttpResponse.json(
        page([{ id: 't9', name: '新テンプレート', description: '説明', systemPrompt: '' }]),
      );
    }),
  );
  return log;
}

async function renderTab(tab: 'users' | 'assistants' | 'templates', user: User = FIXTURE_TENANT_ADMIN) {
  setAuthUser(user);
  const result = renderApp(`/admin/groups/${GROUP_ID}/${tab}`);
  await screen.findByRole('heading', { name: '営業チーム' });
  return result;
}

const toastMessages = () => useToastStore.getState().toasts.map((toast) => toast.message);

beforeEach(() => {
  useGroupUsersStore.getState().reset();
  useGroupAssistantsStore.getState().reset();
  useGroupTemplatesStore.getState().reset();
  useToastStore.getState().clear();
});

afterEach(() => {
  setAuthUser(null);
});

describe('GroupDetailPage', () => {
  describe('ヘッダーとタブ', () => {
    test('グループ名を見出しに表示し、3 つのタブを移植元の並びで出すこと', async () => {
      mockApis();
      await renderTab('users');

      const links = screen.getAllByRole('link');
      const tabLabels = links
        .map((link) => link.textContent)
        .filter((text) => text?.startsWith('GROUPS.TAB_'));
      expect(tabLabels).toEqual(['GROUPS.TAB_USERS', 'GROUPS.TAB_ASSISTANTS', 'GROUPS.TAB_TEMPLATES']);
    });

    test('タブを押すと URL が切り替わり、そのタブの一覧を表示すること', async () => {
      mockApis();
      const { router } = await renderTab('users');

      await userEvent.click(screen.getByRole('link', { name: 'GROUPS.TAB_ASSISTANTS' }));

      expect(router.state.location.pathname).toBe('/admin/groups/g1/assistants');
      expect(await screen.findByText('営業アシスタント')).toBeInTheDocument();
    });

    test('リロード相当で /templates を直接開くと所属テンプレートのタブが選ばれること', async () => {
      mockApis();
      await renderTab('templates');

      expect(await screen.findByText('議事録')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'GROUPS.TAB_TEMPLATES' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });
  });

  describe('チームの編集', () => {
    test('メニューから名前を変更して保存できること', async () => {
      const log = mockApis();
      await renderTab('users');

      await userEvent.click(screen.getByTestId('admin-groups-detail-menu-button'));
      await userEvent.click(screen.getByTestId('admin-groups-edit-name-button'));
      const input = await screen.findByTestId('admin-groups-name-input');
      expect(input).toHaveValue('営業チーム');
      await userEvent.clear(input);
      await userEvent.type(input, ' 新営業チーム ');
      await userEvent.click(screen.getByTestId('dialog-confirm-button'));

      await waitFor(() => expect(log.patched).toEqual([{ name: '新営業チーム' }]));
      expect(await screen.findByRole('heading', { name: '新営業チーム' })).toBeInTheDocument();
      expect(toastMessages()).toContain('GROUPS.UPDATE_SUCCESS');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    test('名前が空のまま保存するとエラーを表示して送信しないこと', async () => {
      const log = mockApis();
      await renderTab('users');

      await userEvent.click(screen.getByTestId('admin-groups-detail-menu-button'));
      await userEvent.click(screen.getByTestId('admin-groups-edit-name-button'));
      await userEvent.clear(await screen.findByTestId('admin-groups-name-input'));
      await userEvent.click(screen.getByTestId('dialog-confirm-button'));

      expect(await screen.findByTestId('admin-groups-name-input-error')).toBeInTheDocument();
      expect(log.patched).toHaveLength(0);
    });

    test('名前が 100 文字を超えるとエラーを表示して送信しないこと', async () => {
      const log = mockApis();
      await renderTab('users');

      await userEvent.click(screen.getByTestId('admin-groups-detail-menu-button'));
      await userEvent.click(screen.getByTestId('admin-groups-edit-name-button'));
      const input = await screen.findByTestId('admin-groups-name-input');
      await userEvent.clear(input);
      await userEvent.type(input, 'あ'.repeat(101));
      await userEvent.click(screen.getByTestId('dialog-confirm-button'));

      expect(await screen.findByTestId('admin-groups-name-input-error')).toBeInTheDocument();
      expect(log.patched).toHaveLength(0);
    });

    test('更新に失敗したらエラートーストを出してダイアログを残すこと', async () => {
      mockApis({ updateFails: true });
      await renderTab('users');

      await userEvent.click(screen.getByTestId('admin-groups-detail-menu-button'));
      await userEvent.click(screen.getByTestId('admin-groups-edit-name-button'));
      await userEvent.type(await screen.findByTestId('admin-groups-name-input'), 'x');
      await userEvent.click(screen.getByTestId('dialog-confirm-button'));

      await waitFor(() => expect(toastMessages()).toContain('GROUPS.UPDATE_FAILED'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('チームの削除', () => {
    test('確認して削除するとグループ一覧へ戻ること', async () => {
      const log = mockApis();
      const { router } = await renderTab('users');

      await userEvent.click(screen.getByTestId('admin-groups-detail-menu-button'));
      await userEvent.click(screen.getByTestId('admin-groups-delete-button'));
      await userEvent.click(await screen.findByTestId('dialog-confirm-button'));

      await waitFor(() => expect(log.deleted).toContain('group:g1'));
      await waitFor(() => expect(router.state.location.pathname).toBe('/admin/groups'));
      expect(toastMessages()).toContain('GROUPS.DELETE_SUCCESS');
    });

    test('グループ管理者には削除メニューを表示しないこと', async () => {
      mockApis();
      await renderTab('users', FIXTURE_GROUP_ADMIN);

      await userEvent.click(screen.getByTestId('admin-groups-detail-menu-button'));

      expect(screen.getByTestId('admin-groups-edit-name-button')).toBeInTheDocument();
      expect(screen.queryByTestId('admin-groups-delete-button')).not.toBeInTheDocument();
    });
  });
});

describe('GroupDetailUsersPage', () => {
  test('表示名・権限・クレジットを表示し、クレジットが無ければ「—」を出すこと', async () => {
    mockApis();
    await renderTab('users');

    const rows = await screen.findAllByTestId('admin-groups-user-row');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('山田太郎')).toBeInTheDocument();
    expect(within(rows[0]).getByText('GROUPS.ROLE_ADMIN')).toBeInTheDocument();
    expect(within(rows[0]).getByText('12,345')).toBeInTheDocument();
    expect(within(rows[1]).getByText('GROUPS.ROLE_MEMBER')).toBeInTheDocument();
    expect(within(rows[1]).getByText('—')).toBeInTheDocument();
  });

  test('初期表示では追加日時の降順で 1 ページ 25 件を取得すること', async () => {
    const log = mockApis();
    await renderTab('users');
    await screen.findAllByTestId('admin-groups-user-row');

    const params = log.listParams[0];
    expect(params.get('page')).toBe('0');
    expect(params.get('size')).toBe('25');
    expect(params.get('sort')).toBe('updatedAt,desc');
    expect(params.get('includeUsage')).toBe('true');
  });

  test('検索ワードを入力すると searchText を付けて取得し直すこと', async () => {
    const log = mockApis();
    await renderTab('users');
    await screen.findAllByTestId('admin-groups-user-row');

    await userEvent.type(screen.getByPlaceholderText('GROUPS.SEARCH_PLACEHOLDER'), 'a');

    await waitFor(() => expect(log.listParams.some((p) => p.get('searchText') === 'a')).toBe(true));
  });

  test('ログインユーザー自身の行のメニューは押せないこと', async () => {
    mockApis();
    await renderTab('users');

    const rows = await screen.findAllByTestId('admin-groups-user-row');

    expect(within(rows[2]).getByTestId('admin-groups-user-row-menu-button')).toBeDisabled();
    expect(within(rows[1]).getByTestId('admin-groups-user-row-menu-button')).toBeEnabled();
  });

  test('権限を管理者へ変更できること', async () => {
    const log = mockApis();
    await renderTab('users');
    const rows = await screen.findAllByTestId('admin-groups-user-row');

    await userEvent.click(within(rows[1]).getByTestId('admin-groups-user-row-menu-button'));
    await userEvent.click(screen.getByTestId('admin-groups-edit-role-button'));
    await userEvent.click(await screen.findByLabelText('GROUPS.ROLE_ADMIN'));
    await userEvent.click(screen.getByTestId('dialog-confirm-button'));

    await waitFor(() => expect(log.patched).toEqual([{ userId: 'u2', groupAdmin: true }]));
    expect(toastMessages()).toContain('GROUPS.EDIT_ROLE_SUCCESS');
  });

  test('行のメニューからユーザーをチームから削除できること', async () => {
    const log = mockApis();
    await renderTab('users');
    const rows = await screen.findAllByTestId('admin-groups-user-row');

    await userEvent.click(within(rows[1]).getByTestId('admin-groups-user-row-menu-button'));
    await userEvent.click(screen.getByTestId('admin-groups-remove-user-button'));
    await userEvent.click(await screen.findByTestId('dialog-confirm-button'));

    await waitFor(() => expect(log.deleted).toEqual(['user:u2']));
    expect(toastMessages()).toContain('GROUPS.REMOVE_USER_SUCCESS');
  });

  test('選択したユーザーをまとめて削除できるが、自分自身は除かれること', async () => {
    const log = mockApis();
    await renderTab('users');
    await screen.findAllByTestId('admin-groups-user-row');

    // ヘッダーの全選択（PC 用の見出し行）
    const [selectAll] = screen.getAllByRole('checkbox');
    await userEvent.click(selectAll);
    await userEvent.click(screen.getByRole('button', { name: 'GROUPS.REMOVE_SELECTED' }));
    await userEvent.click(await screen.findByTestId('dialog-confirm-button'));

    await waitFor(() => expect(log.deleted.sort()).toEqual(['user:u1', 'user:u2']));
  });

  test('ユーザーを追加すると、まだ所属していないユーザーを候補にして送信すること', async () => {
    const log = mockApis();
    await renderTab('users');
    await screen.findAllByTestId('admin-groups-user-row');

    await userEvent.click(screen.getByTestId('admin-groups-add-user-button'));
    const dialog = await screen.findByRole('dialog');
    expect(log.optionParams[0].get('excludeGroupId')).toBe(GROUP_ID);
    // 候補を選ぶまでは追加できない
    expect(within(dialog).getByTestId('dialog-confirm-button')).toBeDisabled();

    await userEvent.click(within(dialog).getByText('GROUPS.MEMBERS_PLACEHOLDER'));
    await userEvent.click(await screen.findByRole('option', { name: '新人' }));
    await userEvent.click(screen.getByRole('button', { name: 'COMMON.CONFIRM_SELECTION' }));
    await userEvent.click(within(dialog).getByTestId('dialog-confirm-button'));

    await waitFor(() => expect(log.posted).toEqual([{ userIds: ['u9'] }]));
    expect(toastMessages()).toContain('GROUPS.ADD_USER_SUCCESS');
  });
});

describe('GroupDetailAssistantsPage', () => {
  test('サーバー・AIモデル・カテゴリ・履歴・追加日時を表示すること', async () => {
    mockApis();
    await renderTab('assistants');

    const rows = await screen.findAllByTestId('admin-groups-assistant-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('ローカル')).toBeInTheDocument();
    expect(within(rows[0]).getByText('GPT-4')).toBeInTheDocument();
    expect(within(rows[0]).getByText('営業')).toBeInTheDocument();
    expect(within(rows[0]).getByText('ON')).toBeInTheDocument();
    expect(within(rows[0]).getByText('2026/01/15 09:30')).toBeInTheDocument();
    expect(within(rows[1]).getByText('クラウド(一般)')).toBeInTheDocument();
    expect(within(rows[1]).getByText('OFF')).toBeInTheDocument();
    // エンドポイントが無ければ「—」
    expect(within(rows[1]).getByText('—')).toBeInTheDocument();
  });

  test('初期表示では追加日時の降順で取得すること', async () => {
    const log = mockApis();
    await renderTab('assistants');
    await screen.findAllByTestId('admin-groups-assistant-row');

    expect(log.listParams[0].get('sort')).toBe('addedAt,desc');
    expect(log.listParams[0].get('size')).toBe('25');
  });

  test('行の削除ボタンからアシスタントをチームから削除できること', async () => {
    const log = mockApis();
    await renderTab('assistants');
    const rows = await screen.findAllByTestId('admin-groups-assistant-row');

    await userEvent.click(within(rows[1]).getByTestId('admin-groups-remove-assistant-button'));
    await userEvent.click(await screen.findByTestId('dialog-confirm-button'));

    await waitFor(() => expect(log.deleted).toEqual(['assistant:a2']));
    expect(toastMessages()).toContain('GROUPS.DELETE_ASSISTANT_SUCCESS');
  });

  test('アシスタントを追加すると、まだ所属していないものを候補にして送信すること', async () => {
    const log = mockApis();
    await renderTab('assistants');
    await screen.findAllByTestId('admin-groups-assistant-row');

    await userEvent.click(screen.getByTestId('admin-groups-add-assistant-button'));
    const dialog = await screen.findByRole('dialog');
    expect(log.optionParams[0].get('excludeGroupId')).toBe(GROUP_ID);
    expect(within(dialog).getByTestId('dialog-confirm-button')).toBeDisabled();

    await userEvent.click(within(dialog).getByText('GROUPS.ASSISTANTS_PLACEHOLDER'));
    await userEvent.click(await screen.findByText('新アシスタント'));
    await userEvent.click(within(dialog).getByTestId('dialog-confirm-button'));

    await waitFor(() => expect(log.posted).toEqual([{ assistantIds: ['a9'] }]));
    expect(toastMessages()).toContain('GROUPS.ADD_ASSISTANT_SUCCESS');
  });
});

describe('GroupDetailTemplatesPage', () => {
  test('テンプレート名・システムプロンプト・更新日時を表示すること', async () => {
    mockApis();
    await renderTab('templates');

    const rows = await screen.findAllByTestId('admin-groups-template-row');
    expect(within(rows[0]).getByText('議事録')).toBeInTheDocument();
    expect(within(rows[0]).getByText('議事録を作成してください')).toBeInTheDocument();
    expect(within(rows[0]).getByText('2026/02/01 10:00')).toBeInTheDocument();
  });

  test('検索ワードを入力すると search を付けて取得し直すこと', async () => {
    const log = mockApis();
    await renderTab('templates');
    await screen.findAllByTestId('admin-groups-template-row');

    await userEvent.type(screen.getByPlaceholderText('COMMON.SEARCH_PLACEHOLDER'), 'a');

    await waitFor(() => expect(log.listParams.some((p) => p.get('search') === 'a')).toBe(true));
  });

  test('選択したテンプレートをまとめてチームから削除できること', async () => {
    const log = mockApis();
    await renderTab('templates');
    await screen.findAllByTestId('admin-groups-template-row');

    const [selectAll] = screen.getAllByRole('checkbox');
    await userEvent.click(selectAll);
    await userEvent.click(screen.getByRole('button', { name: 'TEAM.TEMPLATE.REMOVE_FROM_TEAM' }));
    await userEvent.click(await screen.findByTestId('dialog-confirm-button'));

    await waitFor(() => expect(log.deleted).toEqual(['template:t1']));
    expect(toastMessages()).toContain('GROUPS.DELETE_TEMPLATE_SUCCESS');
  });

  test('テンプレートを追加すると、まだ所属していないものを候補にして送信すること', async () => {
    const log = mockApis();
    await renderTab('templates');
    await screen.findAllByTestId('admin-groups-template-row');

    await userEvent.click(screen.getByTestId('admin-groups-add-template-button'));
    const dialog = await screen.findByRole('dialog');
    expect(log.optionParams[0].get('excludeGroupId')).toBe(GROUP_ID);

    await userEvent.click(within(dialog).getByText('GROUPS.TEMPLATES_PLACEHOLDER'));
    await userEvent.click(await screen.findByText('新テンプレート'));
    await userEvent.click(within(dialog).getByTestId('dialog-confirm-button'));

    await waitFor(() => expect(log.posted).toEqual([{ templateIds: ['t9'] }]));
    expect(toastMessages()).toContain('GROUPS.ADD_TEMPLATE_SUCCESS');
  });
});
