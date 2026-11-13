import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { server } from '@/test/setup';
import { FIXTURE_TENANT_ADMIN, renderApp, setAuthUser } from '@/test/render-app';
import { useAssistantListStore } from '@/store/assistant-list-store';
import { useToastStore } from '@/components/shared/toast-store';

const FIXTURE_ASSISTANTS = [
  {
    id: 'a1',
    tenantId: 'tenant',
    type: 'SAAS_CHAT',
    endpoints: [{ id: 'e1', model: 'gpt-x', type: 'OPENAI_CHAT', url: '' }],
    name: '営業アシスタント',
    indexId: null,
    groups: ['g1'],
    category: { id: 'c1', name: '営業', description: null },
    categories: [{ id: 'c1', name: '営業', description: null }],
    description: '営業を支援する',
    includeHistory: true,
    iconColor: null,
  },
  {
    id: 'a2',
    tenantId: 'tenant',
    type: 'SECURE',
    endpoints: [{ id: 'e2', model: 'svc-1', type: 'LOCAL_SERVER', url: '' }],
    name: 'ローカル',
    indexId: null,
    groups: [],
    category: null,
    categories: [],
    description: null,
    includeHistory: false,
    iconColor: null,
  },
];

const FIXTURE_CATEGORIES = [
  { id: 'c1', name: '営業', description: '営業向け', updatedAt: '2026-11-01T09:05:00+00:00' },
  { id: 'c2', name: '開発', description: null, updatedAt: '2026-11-02T09:05:00+00:00' },
  { id: 'c3', name: '総務', description: '総務向け', updatedAt: '2026-10-01T09:05:00+00:00' },
];

const LIST_PATH = mockPath(API_PATHS.ADMIN.ASSISTANTS.LIST);
const CATEGORY_PATH = mockPath(API_PATHS.ADMIN.ASSISTANT_CATEGORIES.LIST);

interface RequestLog {
  listParams: URLSearchParams[];
  created: unknown[];
  updated: { id: string; body: unknown }[];
  deleted: string[];
  categoryCreated: unknown[];
  categoryUpdated: { id: string; body: unknown }[];
  categoryDeleted: string[];
}

/** 一覧・選択肢・変更系の API を差し替え、受けたリクエストを記録する */
function mockApis(options: { createFails?: boolean; deleteStatus?: number } = {}): RequestLog {
  const log: RequestLog = {
    listParams: [],
    created: [],
    updated: [],
    deleted: [],
    categoryCreated: [],
    categoryUpdated: [],
    categoryDeleted: [],
  };
  server.use(
    http.get(LIST_PATH, ({ request }) => {
      log.listParams.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        content: FIXTURE_ASSISTANTS,
        totalElements: 25,
        number: 0,
        size: 10,
      });
    }),
    http.get(CATEGORY_PATH, () => HttpResponse.json(FIXTURE_CATEGORIES)),
    http.get(mockPath(API_PATHS.ADMIN.ASSISTANTS.ENDPOINTS_BY_TYPE(':type')), ({ params }) => {
      if (params.type === 'SECURE') {
        return HttpResponse.json([
          { id: 'e2', endpoint: 'http://local', endpointName: 'ローカルサーバー', type: 'LOCAL_SERVER' },
        ]);
      }
      if (params.type === 'SAAS_CHAT') {
        return HttpResponse.json([
          { id: 'e1', endpoint: 'http://openai', endpointName: 'OpenAI本番', type: 'OPENAI_CHAT' },
        ]);
      }
      return HttpResponse.json([]);
    }),
    http.get(mockPath(API_PATHS.ADMIN.ASSISTANTS.AI_MODELS), () =>
      HttpResponse.json([
        { id: 1, endpointType: 'OPENAI_CHAT', name: 'gpt-x', maxTokens: 1, active: true, tokenWeight: 1 },
        { id: 2, endpointType: 'OPENAI_CHAT', name: 'gpt-old', maxTokens: 1, active: false, tokenWeight: 1 },
      ]),
    ),
    http.get(mockPath(API_PATHS.ADMIN.ALL_GROUPS.LIST), () =>
      HttpResponse.json({ data: [{ id: 'g1', name: '営業部' }], total: 1, page: 0, size: 20 }),
    ),
    http.post(LIST_PATH, async ({ request }) => {
      if (options.createFails) return HttpResponse.json({ message: 'ng' }, { status: 400 });
      const body = await request.json();
      log.created.push(body);
      return HttpResponse.json({ id: 'new1', ...(body as object) });
    }),
    http.patch(mockPath(API_PATHS.ADMIN.ASSISTANTS.DETAIL(':id')), async ({ request, params }) => {
      const body = await request.json();
      log.updated.push({ id: String(params.id), body });
      return HttpResponse.json({ id: params.id, ...(body as object) });
    }),
    http.delete(mockPath(API_PATHS.ADMIN.ASSISTANTS.DETAIL(':id')), ({ params }) => {
      if (options.deleteStatus) {
        return HttpResponse.json({ detail: 'ng' }, { status: options.deleteStatus });
      }
      log.deleted.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(CATEGORY_PATH, async ({ request }) => {
      const body = await request.json();
      log.categoryCreated.push(body);
      return HttpResponse.json({ id: 'newc', updatedAt: '2026-11-03T00:00:00+00:00', ...(body as object) });
    }),
    http.patch(
      mockPath(API_PATHS.ADMIN.ASSISTANT_CATEGORIES.DETAIL(':id')),
      async ({ request, params }) => {
        const body = await request.json();
        log.categoryUpdated.push({ id: String(params.id), body });
        return HttpResponse.json({ id: params.id, updatedAt: '2026-11-03T00:00:00+00:00', ...(body as object) });
      },
    ),
    http.delete(mockPath(API_PATHS.ADMIN.ASSISTANT_CATEGORIES.DETAIL(':id')), ({ params }) => {
      log.categoryDeleted.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return log;
}

async function renderAssistants() {
  setAuthUser(FIXTURE_TENANT_ADMIN);
  const result = renderApp('/admin/assistants');
  await screen.findByText('営業アシスタント');
  return result;
}

async function renderCategories() {
  setAuthUser(FIXTURE_TENANT_ADMIN);
  const result = renderApp('/admin/assistants?tab=assistant-category');
  await screen.findByText('総務向け');
  return result;
}

function toastMessages(): string[] {
  return useToastStore.getState().toasts.map((toast) => toast.message);
}

beforeEach(() => {
  // jsdom にはない。入力エラー時のスクロールで呼ばれる
  Element.prototype.scrollIntoView = vi.fn();
  useAssistantListStore.getState().reset();
  useToastStore.getState().clear();
});

afterEach(() => {
  setAuthUser(null);
});

describe('AdminAssistantListPage', () => {
  describe('アシスタント一覧', () => {
    test('名前・説明・接続サーバー・モデル・カテゴリ・チーム・履歴送信が表示されること', async () => {
      mockApis();
      await renderAssistants();

      expect(screen.getByText('営業を支援する')).toBeInTheDocument();
      expect(screen.getByText('クラウド(一般)')).toBeInTheDocument();
      // backend は label を返さないため、接続先 API の選択肢の名前を出す
      expect(await screen.findByText('OpenAI本番')).toBeInTheDocument();
      expect(screen.getByText('営業部')).toBeInTheDocument();
      expect(screen.getByText('ON')).toBeInTheDocument();
      expect(screen.getByText('OFF')).toBeInTheDocument();
      expect(screen.getByText('1-10件 / 25件')).toBeInTheDocument();
    });

    test('0 件のとき、見つからない旨を表示すること', async () => {
      setAuthUser(FIXTURE_TENANT_ADMIN);
      renderApp('/admin/assistants');
      expect(await screen.findByText('ADMIN.ASSISTANT.ASSISTANT_NO_DATA')).toBeInTheDocument();
    });

    test('初期表示では更新日時の降順で 1 ページ目を取得すること', async () => {
      const log = mockApis();
      await renderAssistants();

      const params = log.listParams[0];
      expect(params.get('page')).toBe('0');
      expect(params.get('size')).toBe('10');
      expect(params.get('sort')).toBe('updatedAt,desc');
      expect(params.get('search')).toBeNull();
    });

    test('検索ワードを入力すると search を付けて取得し直すこと', async () => {
      const log = mockApis();
      await renderAssistants();

      await userEvent.type(screen.getByPlaceholderText('ADMIN.LIBRARY.SEARCH_PLACEHOLDER'), 'a');

      await waitFor(() => expect(log.listParams.some((p) => p.get('search') === 'a')).toBe(true));
    });

    test('総件数が減って現在のページが範囲外になったら最終ページへ戻ること', async () => {
      server.use(
        http.get(LIST_PATH, () =>
          HttpResponse.json({ content: FIXTURE_ASSISTANTS, totalElements: 5, number: 0, size: 10 }),
        ),
      );
      useAssistantListStore.getState().updateFilter({ pageIndex: 3 });
      setAuthUser(FIXTURE_TENANT_ADMIN);
      renderApp('/admin/assistants');

      await waitFor(() => expect(useAssistantListStore.getState().filter.pageIndex).toBe(0));
    });
  });

  describe('タブ', () => {
    test('テナント管理者にはアシスタント一覧とカテゴリ管理のタブを表示すること', async () => {
      mockApis();
      await renderAssistants();
      expect(screen.getByText('ADMIN.ASSISTANT.TAB_CATEGORY_MANAGEMENT')).toBeInTheDocument();
    });

    test('カテゴリ管理のタブに切り替えるとカテゴリ一覧を表示すること', async () => {
      mockApis();
      await renderAssistants();

      await userEvent.click(screen.getByText('ADMIN.ASSISTANT.TAB_CATEGORY_MANAGEMENT'));

      expect(await screen.findByText('総務向け')).toBeInTheDocument();
    });
  });

  describe('アシスタントの作成', () => {
    test('何も入力せずに作成すると必須エラーを出し、API を呼ばないこと', async () => {
      const log = mockApis();
      await renderAssistants();

      await userEvent.click(screen.getByText('ADMIN.ASSISTANT.CREATE_ASSISTANT'));
      await userEvent.click(await screen.findByTestId('dialog-confirm-button'));

      expect((await screen.findAllByText('VALIDATION.REQUIRED')).length).toBeGreaterThanOrEqual(3);
      expect(log.created).toHaveLength(0);
    });

    test('名前が 32 文字を超えるとエラーを表示すること', async () => {
      mockApis();
      await renderAssistants();

      await userEvent.click(screen.getByText('ADMIN.ASSISTANT.CREATE_ASSISTANT'));
      const nameInput = await screen.findByPlaceholderText('ADMIN.ASSISTANT.DISPLAY_NAME_PLACEHOLDER');
      await userEvent.click(nameInput);
      await userEvent.paste('あ'.repeat(33));
      await userEvent.tab();

      expect(await screen.findByText('VALIDATION.MAX_LENGTH')).toBeInTheDocument();
    });

    test('接続サーバー・接続先・モデルを選んで作成できること', async () => {
      const log = mockApis();
      await renderAssistants();

      await userEvent.click(screen.getByText('ADMIN.ASSISTANT.CREATE_ASSISTANT'));
      const dialog = await screen.findByRole('dialog');
      await userEvent.type(
        within(dialog).getByPlaceholderText('ADMIN.ASSISTANT.DISPLAY_NAME_PLACEHOLDER'),
        '新規',
      );
      await userEvent.click(within(dialog).getByLabelText('クラウド(一般)'));
      await userEvent.click(within(dialog).getByText('ADMIN.ASSISTANT.PLACEHOLDER_CONNECT_API'));
      await userEvent.click(await screen.findByText('OpenAI本番', { selector: '[role="option"], [role="option"] *' }));
      await userEvent.click(within(dialog).getByText('ADMIN.ASSISTANT.SELECT_MODEL'));
      await userEvent.click(await screen.findByText('gpt-x', { selector: '[role="option"], [role="option"] *' }));
      await userEvent.click(within(dialog).getByTestId('dialog-confirm-button'));

      await waitFor(() => expect(log.created).toHaveLength(1));
      expect(log.created[0]).toEqual({
        type: 'SAAS_CHAT',
        name: '新規',
        description: '',
        includeHistory: false,
        iconColor: '',
        groups: [],
        categoryIds: [],
        indexId: '',
        endpoints: [{ id: 'e1', model: 'gpt-x', url: '' }],
      });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(toastMessages()).toContain('ADMIN.ASSISTANT.CREATE_ASSISTANT_SUCCESS');
    });

    test('学習先指定のクラウドでは学習先フォルダが必須であること', async () => {
      const log = mockApis();
      await renderAssistants();

      await userEvent.click(screen.getByText('ADMIN.ASSISTANT.CREATE_ASSISTANT'));
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(within(dialog).getByLabelText('クラウド(学習先指定)'));

      // 接続サーバーを触った時点で、フォルダの必須エラーが出る（移植元と同じ）
      expect(await within(dialog).findAllByText('VALIDATION.REQUIRED')).not.toHaveLength(0);
      await userEvent.click(within(dialog).getByTestId('dialog-confirm-button'));
      expect(log.created).toHaveLength(0);
    });

    test('作成に失敗したらエラーのトーストを出し、ダイアログを閉じないこと', async () => {
      mockApis({ createFails: true });
      await renderAssistants();

      await userEvent.click(screen.getByText('ADMIN.ASSISTANT.CREATE_ASSISTANT'));
      const dialog = await screen.findByRole('dialog');
      await userEvent.type(
        within(dialog).getByPlaceholderText('ADMIN.ASSISTANT.DISPLAY_NAME_PLACEHOLDER'),
        'x',
      );
      await userEvent.click(within(dialog).getByLabelText('セキュア'));
      await userEvent.click(within(dialog).getByText('ADMIN.ASSISTANT.PLACEHOLDER_CONNECT_API'));
      await userEvent.click(await screen.findByText('ローカルサーバー', { selector: '[role="option"], [role="option"] *' }));
      await userEvent.type(
        within(dialog).getByPlaceholderText('ADMIN.ASSISTANT.GENERATIVE_AI_MODEL_LOCAL_PLACEHOLDER'),
        'svc',
      );
      await userEvent.click(within(dialog).getByTestId('dialog-confirm-button'));

      await waitFor(() => expect(toastMessages()).toContain('ADMIN.ASSISTANT.CREATE_ASSISTANT_FAILED'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('アシスタントの編集', () => {
    test('既存の値が入った状態で開き、保存すると更新されること', async () => {
      const log = mockApis();
      await renderAssistants();
      // 接続先の選択肢が揃ってから開く（編集の初期値に使う）
      await screen.findByText('OpenAI本番');

      await userEvent.click(screen.getByTestId('assistant-menu-a1'));
      await userEvent.click(await screen.findByText('ADMIN.ASSISTANT.EDIT_ASSISTANT', { selector: 'span' }));

      const dialog = await screen.findByRole('dialog');
      const nameInput = within(dialog).getByPlaceholderText('ADMIN.ASSISTANT.DISPLAY_NAME_PLACEHOLDER');
      expect(nameInput).toHaveValue('営業アシスタント');
      expect(within(dialog).getByPlaceholderText('ADMIN.ASSISTANT.ASSISTANT_ID_PLACEHOLDER')).toHaveValue('a1');
      await userEvent.type(nameInput, '改');
      await userEvent.click(within(dialog).getByTestId('dialog-confirm-button'));

      await waitFor(() => expect(log.updated).toHaveLength(1));
      expect(log.updated[0]).toEqual({
        id: 'a1',
        body: {
          type: 'SAAS_CHAT',
          name: '営業アシスタント改',
          description: '営業を支援する',
          includeHistory: true,
          iconColor: '',
          groups: ['g1'],
          categoryIds: ['c1'],
          indexId: '',
          endpoints: [{ id: 'e1', model: 'gpt-x', url: '' }],
        },
      });
      expect(toastMessages()).toContain('ADMIN.ASSISTANT.UPDATE_ASSISTANT_SUCCESS');
    });
  });

  describe('アシスタントの削除', () => {
    test('選択したアシスタントをまとめて削除できること', async () => {
      const log = mockApis();
      await renderAssistants();

      const checkboxes = screen.getAllByRole('checkbox');
      // 先頭は PC の全選択。その後ろが各行
      await userEvent.click(checkboxes[1]);
      await userEvent.click(checkboxes[2]);
      await userEvent.click(await screen.findByRole('button', { name: /COMMON.DELETE/ }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('ADMIN.ASSISTANT.DELETE_ASSISTANT_MESSAGE')).toBeInTheDocument();
      await userEvent.click(within(dialog).getByTestId('dialog-confirm-button'));

      await waitFor(() => expect(log.deleted.sort()).toEqual(['a1', 'a2']));
      expect(toastMessages()).toContain('ADMIN.ASSISTANT.DELETE_ASSISTANT_SUCCESS');
    });

    test('デフォルトアシスタントで使用中（409）なら、その旨のトーストを出すこと', async () => {
      mockApis({ deleteStatus: 409 });
      await renderAssistants();

      await userEvent.click(screen.getByTestId('assistant-menu-a2'));
      await userEvent.click(await screen.findByText('COMMON.DELETE', { selector: 'span' }));
      await userEvent.click(await screen.findByTestId('dialog-confirm-button'));

      await waitFor(() =>
        expect(toastMessages()).toContain('ADMIN.ASSISTANT.DELETE_ASSISTANT_DEFAULT_CONFLICT'),
      );
    });

    test('409 以外の失敗では、削除失敗のトーストを出すこと', async () => {
      mockApis({ deleteStatus: 500 });
      await renderAssistants();

      await userEvent.click(screen.getByTestId('assistant-menu-a2'));
      await userEvent.click(await screen.findByText('COMMON.DELETE', { selector: 'span' }));
      await userEvent.click(await screen.findByTestId('dialog-confirm-button'));

      await waitFor(() => expect(toastMessages()).toContain('ADMIN.ASSISTANT.DELETE_FAILED'));
    });
  });

  describe('カテゴリ管理', () => {
    test('更新日時の降順で、日時・名前・説明が表示されること', async () => {
      mockApis();
      await renderCategories();

      const titles = screen
        .getAllByText(/^(営業|開発|総務)$/)
        .map((element) => element.textContent);
      expect(titles).toEqual(['開発', '営業', '総務']);
      expect(screen.getByText('営業向け')).toBeInTheDocument();
      expect(screen.getByText('1-3件 / 3件')).toBeInTheDocument();
    });

    test('カテゴリ名順に並べ替えられること', async () => {
      mockApis();
      await renderCategories();
      useAssistantListStore.getState().updateCategoryFilter({ sortField: 'name', sortOrder: 'asc' });

      await waitFor(() => {
        const titles = screen.getAllByText(/^(営業|開発|総務)$/).map((element) => element.textContent);
        expect(titles).toEqual(['営業', '総務', '開発']);
      });
    });

    test('名前が空だと必須エラーを出し、作成しないこと', async () => {
      const log = mockApis();
      await renderCategories();

      await userEvent.click(screen.getByText('ADMIN.ASSISTANT.CREATE_CATEGORY'));
      await userEvent.click(await screen.findByTestId('dialog-confirm-button'));

      expect(await screen.findByText('VALIDATION.REQUIRED')).toBeInTheDocument();
      expect(log.categoryCreated).toHaveLength(0);
    });

    test('名前が 16 文字を超えるとエラーを表示すること', async () => {
      mockApis();
      await renderCategories();

      await userEvent.click(screen.getByText('ADMIN.ASSISTANT.CREATE_CATEGORY'));
      const nameInput = await screen.findByPlaceholderText('ADMIN.ASSISTANT.CATEGORY_NAME_PLACEHOLDER');
      await userEvent.click(nameInput);
      await userEvent.paste('あ'.repeat(17));
      await userEvent.tab();

      expect(await screen.findByText('VALIDATION.MAX_LENGTH')).toBeInTheDocument();
    });

    test('名前と説明を前後の空白を除いて作成できること', async () => {
      const log = mockApis();
      await renderCategories();

      await userEvent.click(screen.getByText('ADMIN.ASSISTANT.CREATE_CATEGORY'));
      await userEvent.type(
        await screen.findByPlaceholderText('ADMIN.ASSISTANT.CATEGORY_NAME_PLACEHOLDER'),
        ' 新カテゴリ ',
      );
      await userEvent.click(screen.getByTestId('dialog-confirm-button'));

      await waitFor(() => expect(log.categoryCreated).toHaveLength(1));
      expect(log.categoryCreated[0]).toEqual({ name: '新カテゴリ', description: '' });
      expect(toastMessages()).toContain('ADMIN.ASSISTANT.CREATE_CATEGORY_SUCCESS');
    });

    test('編集して保存できること', async () => {
      const log = mockApis();
      await renderCategories();

      await userEvent.click(screen.getByTestId('category-menu-c1'));
      await userEvent.click(await screen.findByText('ADMIN.ASSISTANT.EDIT_CATEGORY', { selector: 'span' }));
      const nameInput = await screen.findByPlaceholderText('ADMIN.ASSISTANT.CATEGORY_NAME_PLACEHOLDER');
      expect(nameInput).toHaveValue('営業');
      await userEvent.type(nameInput, '部');
      await userEvent.click(screen.getByTestId('dialog-confirm-button'));

      await waitFor(() => expect(log.categoryUpdated).toHaveLength(1));
      expect(log.categoryUpdated[0]).toEqual({
        id: 'c1',
        body: { name: '営業部', description: '営業向け' },
      });
    });

    test('行のメニューから削除できること', async () => {
      const log = mockApis();
      await renderCategories();

      await userEvent.click(screen.getByTestId('category-menu-c3'));
      await userEvent.click(await screen.findByText('COMMON.DELETE', { selector: 'span' }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('ADMIN.ASSISTANT.DELETE_CATEGORY_MESSAGE')).toBeInTheDocument();
      await userEvent.click(within(dialog).getByTestId('dialog-confirm-button'));

      await waitFor(() => expect(log.categoryDeleted).toEqual(['c3']));
      expect(toastMessages()).toContain('ADMIN.ASSISTANT.DELETE_CATEGORY_SUCCESS');
    });
  });
});
