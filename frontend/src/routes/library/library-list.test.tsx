import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { server } from '@/test/setup';
import {
  FIXTURE_GENERAL_USER,
  FIXTURE_TENANT_ADMIN,
  renderApp,
  setAuthUser,
} from '@/test/render-app';
import { useToastStore } from '@/components/shared/toast-store';
import { useLibraryListStore } from '@/store/library-list-store';
import { useLibraryTagsStore } from '@/store/library-tags-store';

const FIXTURE_LIBRARIES = [
  {
    id: 'l1',
    title: '営業報告まとめ',
    userId: 'profile-uuid',
    createdAt: '2026-11-01T09:00:00',
    updatedAt: '2026-11-01T09:05:00',
    tags: [{ id: 'tag1', name: '営業' }],
    sharedGroups: [{ id: 'g1', name: '営業部' }],
  },
  {
    id: 'l2',
    title: '他の人のライブラリ',
    userId: 'other-uuid',
    createdAt: '2026-10-01T09:00:00',
    updatedAt: '2026-10-01T12:00:00',
    tags: [],
    sharedGroups: [],
  },
];

const FIXTURE_TAGS = [
  {
    id: 'tag1',
    tenantId: 't',
    name: '営業',
    description: '営業関連',
    createdAt: '2026-11-01T09:00:00',
    updatedAt: '2026-11-01T09:00:00',
  },
  {
    id: 'tag2',
    tenantId: 't',
    name: '開発',
    description: null,
    createdAt: '2026-10-01T09:00:00',
    updatedAt: '2026-10-01T09:00:00',
  },
];

const LIST_PATH = mockPath(API_PATHS.ADMIN.LIBRARY.LIST);

interface RequestLog {
  listParams: URLSearchParams[];
  updated: { id: string; body: unknown }[];
  deleted: string[];
  tagListParams: URLSearchParams[];
  tagCreated: unknown[];
  tagUpdated: { id: string; body: unknown }[];
  tagDeleted: unknown[];
}

function mockApis(options: { total?: number; updateFails?: boolean; deleteFails?: boolean } = {}) {
  const log: RequestLog = {
    listParams: [],
    updated: [],
    deleted: [],
    tagListParams: [],
    tagCreated: [],
    tagUpdated: [],
    tagDeleted: [],
  };
  server.use(
    http.get(LIST_PATH, ({ request }) => {
      log.listParams.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        data: {
          content: FIXTURE_LIBRARIES,
          totalElements: options.total ?? 7,
          number: 0,
          size: 5,
        },
      });
    }),
    http.get(mockPath(API_PATHS.LIBRARIES.TAGS), () => HttpResponse.json({ tags: FIXTURE_TAGS })),
    http.get(mockPath(API_PATHS.GROUPS.LIST), () =>
      HttpResponse.json([{ id: 'g1', tenantId: 't', name: '営業部', users: [] }]),
    ),
    http.put(mockPath(API_PATHS.ADMIN.LIBRARY.UPDATE(':id')), async ({ request, params }) => {
      if (options.updateFails) return HttpResponse.json({ message: 'ng' }, { status: 400 });
      log.updated.push({ id: String(params.id), body: await request.json() });
      return HttpResponse.json({ data: { id: params.id } });
    }),
    http.get(mockPath(API_PATHS.LIBRARY.DETAIL(':id')), ({ params }) =>
      HttpResponse.json({ id: params.id, title: 't', assistant: null }),
    ),
    http.delete(mockPath(API_PATHS.ADMIN.LIBRARY.DELETE(':id')), ({ params }) => {
      if (options.deleteFails) return HttpResponse.json({ message: 'ng' }, { status: 404 });
      log.deleted.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(mockPath(API_PATHS.ADMIN_LIBRARY_TAGS.LIST), ({ request }) => {
      log.tagListParams.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        content: FIXTURE_TAGS,
        totalElements: 2,
        number: 0,
        size: 25,
      });
    }),
    http.post(mockPath(API_PATHS.ADMIN_LIBRARY_TAGS.CREATE), async ({ request }) => {
      const body = await request.json();
      log.tagCreated.push(body);
      return HttpResponse.json({ ...FIXTURE_TAGS[0], id: 'tag3', ...(body as object) });
    }),
    http.patch(mockPath(API_PATHS.ADMIN_LIBRARY_TAGS.UPDATE(':id')), async ({ request, params }) => {
      const body = await request.json();
      log.tagUpdated.push({ id: String(params.id), body });
      return HttpResponse.json({ ...FIXTURE_TAGS[0], id: params.id, ...(body as object) });
    }),
    http.delete(mockPath(API_PATHS.ADMIN_LIBRARY_TAGS.DELETE), async ({ request }) => {
      log.tagDeleted.push(await request.json());
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return log;
}

async function renderPage(path = '/library') {
  setAuthUser(FIXTURE_TENANT_ADMIN);
  const result = renderApp(path);
  await screen.findAllByText('営業報告まとめ');
  return result;
}

beforeEach(() => {
  useLibraryListStore.getState().reset();
  useLibraryTagsStore.getState().reset();
  useToastStore.getState().clear();
});

afterEach(() => {
  setAuthUser(null);
});

describe('AdminLibraryPage（コンテンツ一覧）', () => {
  describe('一覧の表示', () => {
    test('タイトル・タグ・更新日時が表示されること', async () => {
      mockApis();
      await renderPage();

      expect(screen.getAllByText('他の人のライブラリ').length).toBeGreaterThan(0);
      expect(screen.getAllByText('営業').length).toBeGreaterThan(0);
      expect(screen.getAllByText('2026/11/01 09:05').length).toBeGreaterThan(0);
      expect(screen.getAllByText('1-5件 / 7件').length).toBeGreaterThan(0);
    });

    test('初期表示では更新日時の降順で 1 ページ目（5 件）を取得すること', async () => {
      const log = mockApis();
      await renderPage();

      const params = log.listParams[0];
      expect(params.get('page')).toBe('0');
      expect(params.get('size')).toBe('5');
      expect(params.get('sortBy')).toBe('updatedAt');
      expect(params.get('sortDir')).toBe('desc');
      expect(params.has('createdBy')).toBe(false);
    });

    test('自分が作成したライブラリだけ編集・削除のメニューが出ること', async () => {
      mockApis();
      await renderPage();

      await userEvent.click(screen.getAllByTestId('library-menu-l2')[0]);
      expect(await screen.findByText('ADMIN.LIBRARY.MENU.COPY_LINK')).toBeInTheDocument();
      expect(screen.queryByText('ADMIN.LIBRARY.MENU.EDIT_SETTINGS')).not.toBeInTheDocument();
      expect(screen.queryByText('ADMIN.LIBRARY.MENU.DELETE')).not.toBeInTheDocument();
    });
  });

  describe('タブ', () => {
    test('テナント管理者はタグ管理タブに切り替えられること', async () => {
      mockApis();
      const { router } = await renderPage();

      await userEvent.click(screen.getByText('ADMIN.LIBRARY.TAB_TAGS'));

      expect(await screen.findAllByText('開発')).not.toHaveLength(0);
      expect(router.state.location.search).toBe('?tab=tags');
    });

    test('一般ユーザーにはタブが出ず、URL で tags を指定しても contents に戻ること', async () => {
      mockApis();
      setAuthUser(FIXTURE_GENERAL_USER);
      const { router } = renderApp('/library?tab=tags');

      await screen.findAllByText('営業報告まとめ');
      expect(screen.queryByText('ADMIN.LIBRARY.TAB_TAGS')).not.toBeInTheDocument();
      await waitFor(() => expect(router.state.location.search).toBe('?tab=contents'));
    });
  });

  describe('検索・絞り込み', () => {
    test('検索ワードを入力すると title を付けて取得し直すこと', async () => {
      const log = mockApis();
      await renderPage();

      await userEvent.type(screen.getByTestId('library-search-input'), 'a');

      await waitFor(() => expect(log.listParams.some((p) => p.get('title') === 'a')).toBe(true));
    });

    test('「自分のみ」を選ぶとログインユーザーの ID を createdBy に付けること', async () => {
      const log = mockApis();
      useLibraryListStore.getState().changeUserMode('mine');
      await renderPage();

      expect(log.listParams[0].get('createdBy')).toBe('admin1');
      expect(log.listParams[0].has('excludeCreatedBy')).toBe(false);
    });

    test('「他ユーザーのみ」を選ぶとログインユーザーの ID を excludeCreatedBy に付けること', async () => {
      const log = mockApis();
      useLibraryListStore.getState().changeUserMode('others');
      await renderPage();

      expect(log.listParams[0].get('excludeCreatedBy')).toBe('admin1');
    });

    test('タグで絞り込むと tagIds を付けること', async () => {
      const log = mockApis();
      useLibraryListStore.getState().changeTagId('tag1');
      await renderPage();

      expect(log.listParams[0].getAll('tagIds')).toEqual(['tag1']);
    });
  });

  describe('ページ送り', () => {
    test('総件数が減って現在のページが範囲外になったら最終ページへ戻ること', async () => {
      mockApis({ total: 5 });
      useLibraryListStore.getState().changePage(3);
      setAuthUser(FIXTURE_TENANT_ADMIN);
      renderApp('/library');

      await waitFor(() => expect(useLibraryListStore.getState().page).toBe(1));
    });
  });

  describe('編集', () => {
    test('既存の値が入った状態で開き、保存すると更新されること', async () => {
      const log = mockApis();
      await renderPage();

      await userEvent.click(screen.getAllByTestId('library-menu-l1')[0]);
      await userEvent.click(await screen.findByText('ADMIN.LIBRARY.MENU.EDIT_SETTINGS'));

      const dialog = await screen.findByRole('dialog');
      const nameInput = within(dialog).getByDisplayValue('営業報告まとめ');
      await userEvent.type(nameInput, '改');
      await userEvent.click(within(dialog).getByText('ADMIN.LIBRARY.EDIT_SETTINGS.SAVE'));

      await waitFor(() => expect(log.updated).toHaveLength(1));
      expect(log.updated[0]).toEqual({
        id: 'l1',
        body: { name: '営業報告まとめ改', tags: ['tag1'], groups: ['g1'] },
      });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    test('保存に失敗したらエラーのトーストを出し、ダイアログを閉じないこと', async () => {
      mockApis({ updateFails: true });
      await renderPage();

      await userEvent.click(screen.getAllByTestId('library-menu-l1')[0]);
      await userEvent.click(await screen.findByText('ADMIN.LIBRARY.MENU.EDIT_SETTINGS'));
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(within(dialog).getByText('ADMIN.LIBRARY.EDIT_SETTINGS.SAVE'));

      await waitFor(() =>
        expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
          'ADMIN.LIBRARY.UPDATE_FAILED',
        ),
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('削除', () => {
    test('確認ダイアログで削除すると、そのライブラリだけ削除されること', async () => {
      const log = mockApis();
      await renderPage();

      await userEvent.click(screen.getAllByTestId('library-menu-l1')[0]);
      await userEvent.click(await screen.findByText('ADMIN.LIBRARY.MENU.DELETE'));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('ADMIN.LIBRARY.DELETE.MESSAGE')).toBeInTheDocument();
      await userEvent.click(within(dialog).getByTestId('dialog-confirm-button'));

      await waitFor(() => expect(log.deleted).toEqual(['l1']));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    test('削除に失敗したらエラーのトーストを出し、ダイアログを閉じないこと', async () => {
      mockApis({ deleteFails: true });
      await renderPage();

      await userEvent.click(screen.getAllByTestId('library-menu-l1')[0]);
      await userEvent.click(await screen.findByText('ADMIN.LIBRARY.MENU.DELETE'));
      await userEvent.click(await screen.findByTestId('dialog-confirm-button'));

      await waitFor(() =>
        expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
          'ADMIN.LIBRARY.DELETE_FAILED',
        ),
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});

describe('AdminLibraryPage（タグ管理）', () => {
  async function renderTagsTab() {
    setAuthUser(FIXTURE_TENANT_ADMIN);
    const result = renderApp('/library?tab=tags');
    await screen.findAllByText('開発');
    return result;
  }

  test('タグの名前・説明（なければ -）・更新日時が表示されること', async () => {
    mockApis();
    await renderTagsTab();

    expect(screen.getByText('営業関連')).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
    expect(screen.getByText('2026/11/01 09:00')).toBeInTheDocument();
  });

  test('初期表示では更新日時の降順で 1 ページ目（25 件）を取得すること', async () => {
    const log = mockApis();
    await renderTagsTab();

    const params = log.tagListParams[0];
    expect(params.get('page')).toBe('0');
    expect(params.get('size')).toBe('25');
    expect(params.get('sort')).toBe('updatedAt,desc');
  });

  test('総件数が減って現在のページが範囲外になったら最終ページへ戻ること', async () => {
    mockApis();
    useLibraryTagsStore.getState().changePage(3);
    setAuthUser(FIXTURE_TENANT_ADMIN);
    renderApp('/library?tab=tags');

    await waitFor(() => expect(useLibraryTagsStore.getState().page).toBe(1));
  });

  test('名前を入力するまで作成ボタンが押せず、作成するとタグが登録されること', async () => {
    const log = mockApis();
    await renderTagsTab();

    await userEvent.click(screen.getAllByText('ADMIN.LIBRARY.TAGS.ADD')[0]);
    const dialog = await screen.findByRole('dialog');
    const create = within(dialog).getByText('COMMON.CREATE').closest('button');
    expect(create).toBeDisabled();

    await userEvent.type(
      within(dialog).getByPlaceholderText('ADMIN.LIBRARY.TAGS.EDIT_SETTINGS.TAG_NAME_PLACEHOLDER'),
      '新タグ',
    );
    await waitFor(() => expect(create).toBeEnabled());
    await userEvent.click(create as HTMLElement);

    await waitFor(() => expect(log.tagCreated).toEqual([{ name: '新タグ' }]));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('空白だけの名前では作成できないこと', async () => {
    mockApis();
    await renderTagsTab();

    await userEvent.click(screen.getAllByText('ADMIN.LIBRARY.TAGS.ADD')[0]);
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(
      within(dialog).getByPlaceholderText('ADMIN.LIBRARY.TAGS.EDIT_SETTINGS.TAG_NAME_PLACEHOLDER'),
      '   ',
    );

    expect(within(dialog).getByText('COMMON.CREATE').closest('button')).toBeDisabled();
  });

  test('編集すると既存の値が入った状態で開き、保存すると更新されること', async () => {
    const log = mockApis();
    await renderTagsTab();

    await userEvent.click(screen.getByTestId('tag-menu-tag1'));
    await userEvent.click(await screen.findByText('ADMIN.LIBRARY.TAGS.MENU.EDIT_SETTINGS'));
    const dialog = await screen.findByRole('dialog');
    const nameInput = within(dialog).getByDisplayValue('営業');
    await userEvent.type(nameInput, '部');
    await userEvent.click(within(dialog).getByText('COMMON.SAVE'));

    await waitFor(() => expect(log.tagUpdated).toHaveLength(1));
    expect(log.tagUpdated[0]).toEqual({
      id: 'tag1',
      body: { name: '営業部', description: '営業関連' },
    });
  });

  test('選択したタグをまとめて削除できること', async () => {
    const log = mockApis();
    await renderTagsTab();

    // 先頭の 2 つは PC・モバイルの全選択。その後ろが各行
    const boxes = screen.getAllByRole('checkbox');
    await userEvent.click(boxes[2]);
    await userEvent.click(boxes[3]);
    await userEvent.click((await screen.findAllByText('COMMON.DELETE'))[0]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('ADMIN.LIBRARY.TAGS.DELETE.MESSAGE')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByTestId('dialog-confirm-button'));

    await waitFor(() => expect(log.tagDeleted).toEqual([{ ids: ['tag1', 'tag2'] }]));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
