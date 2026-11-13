import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { server } from '@/test/setup';
import { FIXTURE_TENANT_ADMIN, renderApp, setAuthUser } from '@/test/render-app';
import { useTrainingDataStore } from '@/store/training-data-store';

const FIXTURE_INDEXES = [
  {
    id: 'i1',
    tenantId: 'tenant',
    type: 'LOCAL',
    name: '社内規程',
    description: '就業規則など',
    tenantEndpoints: [{ id: 'e1', tenantId: 'tenant', type: 'LOCAL_SERVER', endpointName: 'srv', endpoint: 'http://x' }],
    groupIds: [],
    add: 'a',
    delete: 'd',
    get: 'g',
    createdAt: '2026-11-01T09:00:00',
    updatedAt: '2026-11-01T09:05:00',
  },
  {
    id: 'i2',
    tenantId: 'tenant',
    type: 'SAAS_GLOBAL',
    name: '製品マニュアル',
    description: null,
    tenantEndpoints: [],
    groupIds: [],
    add: null,
    delete: null,
    get: null,
    createdAt: '2026-10-01T09:00:00',
    updatedAt: '2026-10-01T12:00:00',
  },
];

const LIST_PATH = mockPath(API_PATHS.INDEXES.LIST);
const ENDPOINTS_PATH = mockPath(API_PATHS.ADMIN.TENANTS.ENDPOINTS_BY_TYPE(':type'));
const GROUPS_PATH = mockPath(API_PATHS.ADMIN.GROUPS.LIST);

const NEW_FOLDER_ID = 'new1';

interface RequestLog {
  listParams: URLSearchParams[];
  created: Record<string, unknown>[];
  endpointTypes: string[];
  groupParams: URLSearchParams[];
}

interface MockOptions {
  total?: number;
  createFails?: boolean;
  localEndpoints?: { id: string; endpointName: string }[];
  vdbEndpoints?: { id: string; endpointName: string }[];
  embeddingEndpoints?: { id: string; endpointName: string }[];
  groupIds?: string[];
}

function lastListParams(log: RequestLog): URLSearchParams | undefined {
  return log.listParams[log.listParams.length - 1];
}

function toEndpoint(type: string, row: { id: string; endpointName: string }) {
  return { ...row, tenantId: 'tenant', type, endpoint: 'http://x' };
}

/** 一覧・接続先候補・グループ・作成の API を差し替え、受けたリクエストを記録する */
function mockApis(options: MockOptions = {}): RequestLog {
  const log: RequestLog = { listParams: [], created: [], endpointTypes: [], groupParams: [] };
  const local = options.localEndpoints ?? [
    { id: 'le1', endpointName: 'ローカルA' },
    { id: 'le2', endpointName: 'ローカルB' },
  ];
  const vdb = options.vdbEndpoints ?? [{ id: 'v1', endpointName: 'VDB' }];
  const embedding = options.embeddingEndpoints ?? [{ id: 'm1', endpointName: 'Embedding' }];
  const groupIds = options.groupIds ?? ['g1', 'g2'];

  server.use(
    http.get(LIST_PATH, ({ request }) => {
      log.listParams.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        content: FIXTURE_INDEXES,
        totalElements: options.total ?? 7,
        number: 0,
        size: 5,
      });
    }),
    http.get(ENDPOINTS_PATH, ({ params }) => {
      const type = String(params.type);
      log.endpointTypes.push(type);
      const rows = { LOCAL_SERVER: local, VDB: vdb, AZURE_OPENAI_EMBEDDING: embedding }[type] ?? [];
      return HttpResponse.json(rows.map((row) => toEndpoint(type, row)));
    }),
    http.get(GROUPS_PATH, ({ request }) => {
      const url = new URL(request.url);
      log.groupParams.push(url.searchParams);
      // 2 件ずつ返し、ページ送りで全部取れることを確かめる
      const page = Number(url.searchParams.get('page'));
      const rows = groupIds.slice(page * 2, page * 2 + 2).map((id) => ({ id, name: id }));
      return HttpResponse.json({ data: rows, total: groupIds.length, page, size: 2 });
    }),
    http.post(LIST_PATH, async ({ request }) => {
      if (options.createFails) return HttpResponse.json({ message: 'ng' }, { status: 400 });
      const body = (await request.json()) as Record<string, unknown>;
      log.created.push(body);
      return HttpResponse.json({
        id: NEW_FOLDER_ID,
        tenantId: 'tenant',
        description: null,
        add: null,
        delete: null,
        get: null,
        tenantEndpoints: [],
        groupIds: [],
        createdAt: '2026-11-13T10:00:00',
        updatedAt: '2026-11-13T10:00:00',
        ...body,
      });
    }),
  );
  return log;
}

async function renderPage() {
  setAuthUser(FIXTURE_TENANT_ADMIN);
  const result = renderApp('/admin/training-data');
  await screen.findByText('社内規程');
  return result;
}

async function openDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByTestId('admin-training-data-create-button'));
  await screen.findByRole('dialog');
  // グループの取得が終わるまで読み込み表示が出る
  await waitFor(() =>
    expect(screen.queryByTestId('admin-training-data-create-loading')).not.toBeInTheDocument(),
  );
  return user;
}

async function selectServer(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByText(label));
  await waitFor(() =>
    expect(screen.queryByTestId('admin-training-data-create-loading')).not.toBeInTheDocument(),
  );
}

// jsdom は scrollIntoView を持たない。エラー位置へのスクロールを検証するため差し替える
const scrollIntoViewMock = vi.fn();

beforeEach(() => {
  useTrainingDataStore.getState().reset();
  scrollIntoViewMock.mockClear();
  Element.prototype.scrollIntoView = scrollIntoViewMock;
});

afterEach(() => {
  setAuthUser(null);
});

describe('TrainingDataPage', () => {
  describe('一覧の表示', () => {
    test('フォルダ名・接続サーバー・説明がカードに表示されること', async () => {
      mockApis();
      await renderPage();

      const cards = screen.getAllByTestId('admin-training-data-card');
      expect(cards).toHaveLength(2);
      expect(within(cards[0]).getByText('ローカル')).toBeInTheDocument();
      expect(within(cards[0]).getByText('就業規則など')).toBeInTheDocument();
      expect(within(cards[1]).getByText('クラウド')).toBeInTheDocument();
      expect(screen.getByText('1-5件 / 7件')).toBeInTheDocument();
    });

    test('初期の取得条件が page 0・size 5・更新日時の降順であること', async () => {
      const log = mockApis();
      await renderPage();

      const params = log.listParams[0];
      expect(params.get('page')).toBe('0');
      expect(params.get('size')).toBe('5');
      expect(params.get('sort')).toBe('updatedAt,desc');
      expect(params.get('searchText')).toBe('');
    });

    test('0 件のとき件数表示が出ないこと', async () => {
      server.use(
        http.get(LIST_PATH, () =>
          HttpResponse.json({ content: [FIXTURE_INDEXES[0]], totalElements: 0, number: 0, size: 5 }),
        ),
      );
      await renderPage();

      expect(screen.queryByText(/件 \//)).not.toBeInTheDocument();
    });

    test('閲覧・編集を押すと詳細画面へ遷移すること', async () => {
      mockApis();
      const { router } = await renderPage();

      const user = userEvent.setup();
      await user.click(screen.getAllByTestId('admin-training-data-view-edit-button')[1]);

      expect(router.state.location.pathname).toBe('/admin/training-data/i2');
    });
  });

  describe('検索・ページ送り', () => {
    test('検索語が searchText として送られ、1 ページ目に戻ること', async () => {
      const log = mockApis();
      await renderPage();

      const user = userEvent.setup();
      await user.click(screen.getAllByLabelText('Next page')[0]);
      await waitFor(() => expect(lastListParams(log)?.get('page')).toBe('1'));

      await user.type(screen.getByTestId('admin-training-data-search-input'), '規程');

      await waitFor(() => expect(lastListParams(log)?.get('searchText')).toBe('規程'));
      expect(lastListParams(log)?.get('page')).toBe('0');
    });

    test('次のページを押すと page が 1 になること', async () => {
      const log = mockApis();
      await renderPage();

      const user = userEvent.setup();
      await user.click(screen.getAllByLabelText('Next page')[0]);

      await waitFor(() => expect(lastListParams(log)?.get('page')).toBe('1'));
      expect(await screen.findByText('6-7件 / 7件')).toBeInTheDocument();
    });
  });

  describe('フォルダの新規作成', () => {
    test('最初はローカル向けの案内とサービス ID の入力欄が出て、作成ボタンは押せないこと', async () => {
      mockApis();
      await renderPage();
      await openDialog();

      expect(screen.getByText('LEARNING_DATA.LOCAL_INFO_TITLE')).toBeInTheDocument();
      expect(screen.getByTestId('admin-training-data-fetch-id-input')).toBeDisabled();
      expect(screen.getByTestId('admin-training-data-create-submit')).toBeDisabled();
    });

    test('ローカルを選ぶと接続先が先頭で選ばれ、作成すると本文が送られて一覧の先頭に足されること', async () => {
      const log = mockApis();
      await renderPage();
      const user = await openDialog();

      await user.type(screen.getByTestId('admin-training-data-name-input'), '新フォルダ');
      await selectServer(user, 'LEARNING_DATA.SERVER_LOCAL');
      await user.type(screen.getByTestId('admin-training-data-fetch-id-input'), 'G1');
      await user.type(screen.getByTestId('admin-training-data-delete-id-input'), 'D1');
      await user.type(screen.getByTestId('admin-training-data-learn-id-input'), 'A1');
      await user.click(screen.getByTestId('admin-training-data-create-submit'));

      await waitFor(() => expect(log.created).toHaveLength(1));
      expect(log.created[0]).toEqual({
        name: '新フォルダ',
        type: 'LOCAL',
        get: 'G1',
        delete: 'D1',
        add: 'A1',
        endpointIds: ['le1'],
        groupIds: ['g1', 'g2'],
      });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      const cards = screen.getAllByTestId('admin-training-data-card');
      expect(cards).toHaveLength(3);
      expect(within(cards[0]).getByText('新フォルダ')).toBeInTheDocument();
      expect(screen.getByText('1-5件 / 8件')).toBeInTheDocument();
    });

    test('クラウドを選ぶとサービス ID の入力欄が消え、ベクトル DB と埋め込みモデルの 2 つを送ること', async () => {
      const log = mockApis();
      await renderPage();
      const user = await openDialog();

      await user.type(screen.getByTestId('admin-training-data-name-input'), 'クラウド用');
      await selectServer(user, 'LEARNING_DATA.SERVER_CLOUD');

      expect(screen.queryByTestId('admin-training-data-fetch-id-input')).not.toBeInTheDocument();
      expect(screen.queryByText('LEARNING_DATA.LOCAL_INFO_TITLE')).not.toBeInTheDocument();
      expect(log.endpointTypes).toEqual(expect.arrayContaining(['VDB', 'AZURE_OPENAI_EMBEDDING']));

      await user.click(screen.getByTestId('admin-training-data-create-submit'));

      await waitFor(() => expect(log.created).toHaveLength(1));
      expect(log.created[0]).toEqual({
        name: 'クラウド用',
        type: 'SAAS_GLOBAL',
        endpointIds: ['v1', 'm1'],
        groupIds: ['g1', 'g2'],
      });
    });

    test('グループが複数ページあっても全部取って紐づけること', async () => {
      const log = mockApis({ groupIds: ['g1', 'g2', 'g3', 'g4', 'g5'] });
      await renderPage();
      const user = await openDialog();

      await user.type(screen.getByTestId('admin-training-data-name-input'), 'x');
      await selectServer(user, 'LEARNING_DATA.SERVER_CLOUD');
      await user.click(screen.getByTestId('admin-training-data-create-submit'));

      await waitFor(() => expect(log.created).toHaveLength(1));
      expect(log.created[0].groupIds).toEqual(['g1', 'g2', 'g3', 'g4', 'g5']);
      expect(log.groupParams.map((params) => params.get('page'))).toEqual(['0', '1', '2']);
    });

    test('ローカルでサービス ID が空のまま作成すると、必須エラーが出て送信されないこと', async () => {
      const log = mockApis();
      await renderPage();
      const user = await openDialog();

      await user.type(screen.getByTestId('admin-training-data-name-input'), 'x');
      await selectServer(user, 'LEARNING_DATA.SERVER_LOCAL');
      await user.click(screen.getByTestId('admin-training-data-create-submit'));

      expect(await screen.findAllByText('VALIDATION.REQUIRED')).toHaveLength(3);
      await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled());
      expect((scrollIntoViewMock.mock.contexts[0] as HTMLElement).id).toBe('create-folder-fetch-id');
      expect(log.created).toHaveLength(0);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    test('名前が 255 文字を超えると、文字数エラーが出て送信されないこと', async () => {
      const log = mockApis();
      await renderPage();
      const user = await openDialog();

      await user.click(screen.getByTestId('admin-training-data-name-input'));
      await user.paste('a'.repeat(256));
      await selectServer(user, 'LEARNING_DATA.SERVER_CLOUD');
      await user.click(screen.getByTestId('admin-training-data-create-submit'));

      expect(await screen.findByText('VALIDATION.MAX_LENGTH')).toBeInTheDocument();
      await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled());
      expect((scrollIntoViewMock.mock.contexts[0] as HTMLElement).id).toBe('create-folder-name');
      expect(log.created).toHaveLength(0);
    });

    test('利用できるエンドポイントがないとき、案内を出して作成できないこと', async () => {
      mockApis({ localEndpoints: [] });
      await renderPage();
      const user = await openDialog();

      await user.type(screen.getByTestId('admin-training-data-name-input'), 'x');
      await selectServer(user, 'LEARNING_DATA.SERVER_LOCAL');

      expect(screen.getByText('LEARNING_DATA.NO_ENDPOINTS')).toBeInTheDocument();
      expect(screen.getByTestId('admin-training-data-create-submit')).toBeDisabled();
    });

    test('クラウドでベクトル DB がないとき、案内を出して作成できないこと', async () => {
      mockApis({ vdbEndpoints: [] });
      await renderPage();
      const user = await openDialog();

      await user.type(screen.getByTestId('admin-training-data-name-input'), 'x');
      await selectServer(user, 'LEARNING_DATA.SERVER_CLOUD');

      expect(screen.getByText('LEARNING_DATA.NO_ENDPOINTS')).toBeInTheDocument();
      expect(screen.getByTestId('admin-training-data-create-submit')).toBeDisabled();
    });

    test('作成に失敗したらダイアログを開いたままにして、入力を残すこと', async () => {
      mockApis({ createFails: true });
      await renderPage();
      const user = await openDialog();

      await user.type(screen.getByTestId('admin-training-data-name-input'), '失敗する');
      await selectServer(user, 'LEARNING_DATA.SERVER_CLOUD');
      await user.click(screen.getByTestId('admin-training-data-create-submit'));

      await waitFor(() =>
        expect(screen.getByTestId('admin-training-data-create-submit')).toBeEnabled(),
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('admin-training-data-name-input')).toHaveValue('失敗する');
      expect(screen.getAllByTestId('admin-training-data-card')).toHaveLength(2);
    });

    test('送信中は Esc でダイアログを閉じられないこと', async () => {
      mockApis();
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      server.use(
        http.post(LIST_PATH, async () => {
          await gate;
          return HttpResponse.json({ ...FIXTURE_INDEXES[1], id: NEW_FOLDER_ID, name: '遅い' });
        }),
      );
      await renderPage();
      const user = await openDialog();

      await user.type(screen.getByTestId('admin-training-data-name-input'), '遅い');
      await selectServer(user, 'LEARNING_DATA.SERVER_CLOUD');
      await user.click(screen.getByTestId('admin-training-data-create-submit'));
      await user.keyboard('{Escape}');

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      release();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    test('キャンセルを押すとダイアログが閉じること', async () => {
      mockApis();
      await renderPage();
      const user = await openDialog();

      await user.click(screen.getByTestId('admin-training-data-create-cancel'));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
