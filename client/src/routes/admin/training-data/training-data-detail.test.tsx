import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { MOCK_LOCAL_SERVER_URL } from '@/mocks/handlers/training-data';
import { mockPath } from '@/mocks/utils';
import { server } from '@/test/setup';
import { FIXTURE_TENANT_ADMIN, renderApp, setAuthUser } from '@/test/render-app';
import { LEARNING_FOLDERS_QUERY_KEY } from '@/hooks/use-training-data';
import { useToastStore } from '@/components/shared/toast-store';
import { useTrainingDataStore } from '@/store/training-data-store';

const INDEX_ID = 'i1';

type IndexFixture = Record<string, unknown> & { id: string };

const FIXTURE_CLOUD_INDEX: IndexFixture = {
  id: INDEX_ID,
  tenantId: 'tenant',
  type: 'SAAS_GLOBAL',
  name: '製品マニュアル',
  description: '説明文',
  tenantEndpoints: [
    { id: 'v1', tenantId: 'tenant', type: 'VDB', endpointName: 'VDB', endpoint: 'http://x' },
    {
      id: 'm1',
      tenantId: 'tenant',
      type: 'AZURE_OPENAI_EMBEDDING',
      endpointName: 'Embedding',
      endpoint: 'http://x',
    },
  ],
  groupIds: ['g1'],
  add: null,
  delete: null,
  get: null,
  createdAt: '2026-10-01T09:00:00',
  updatedAt: '2026-10-01T12:00:00',
};

const FIXTURE_LOCAL_INDEX: IndexFixture = {
  ...FIXTURE_CLOUD_INDEX,
  type: 'LOCAL',
  name: '社内規程',
  tenantEndpoints: [
    { id: 'le2', tenantId: 'tenant', type: 'LOCAL_SERVER', endpointName: 'ローカルB', endpoint: 'http://x' },
  ],
  add: 'learn-1',
  delete: 'delete-1',
  get: 'fetch-1',
};

/** backend の FileResponse の形。表示名が無いファイルはファイル名を表示名にする */
const FIXTURE_FILES = [
  {
    id: 'f1',
    tenantId: 'tenant',
    fileName: 'manual.pdf',
    displayName: '製品マニュアル',
    reference: 'manual-link',
    status: 'ENABLE',
    userId: 'u1',
    indexId: INDEX_ID,
    storageUrl: null,
    feedbackId: null,
    roomId: null,
    createdAt: '2026-11-01T09:00:00',
    updatedAt: '2026-11-01T09:05:00',
    updatedBy: '山田太郎',
  },
  {
    id: 'f2',
    tenantId: 'tenant',
    fileName: 'rules.txt',
    displayName: null,
    reference: null,
    status: 'DISABLE',
    userId: 'u2',
    indexId: INDEX_ID,
    storageUrl: null,
    feedbackId: null,
    roomId: null,
    createdAt: '2026-11-02T09:00:00',
    updatedAt: '2026-11-02T09:05:00',
    updatedBy: '鈴木花子',
  },
];

const DETAIL_PATH = mockPath(API_PATHS.INDEXES.DETAIL(':id'));
const FILES_PATH = mockPath(API_PATHS.INDEXES.FILES(':id'));
const FILE_PATH = mockPath(API_PATHS.INDEXES.FILE(':id', ':fileId'));
const SYNC_PATH = mockPath(API_PATHS.INDEXES.SYNC(':id'));
const LOCAL_FILES_PATH = `${MOCK_LOCAL_SERVER_URL}/${API_PATHS.LOCAL_SERVER.FILES(':id')}`;
const LOCAL_FILE_PATH = `${MOCK_LOCAL_SERVER_URL}/${API_PATHS.LOCAL_SERVER.FILE(':id', ':fileId')}`;
const LOCAL_SYNC_PATH = `${MOCK_LOCAL_SERVER_URL}/${API_PATHS.LOCAL_SERVER.SYNC(':id')}`;
const ENDPOINTS_PATH = mockPath(API_PATHS.ADMIN.TENANTS.ENDPOINTS_BY_TYPE(':type'));
const GROUPS_PATH = mockPath(API_PATHS.ADMIN.GROUPS.LIST);

interface RequestLog {
  fileListParams: URLSearchParams[];
  patchedFolders: Record<string, unknown>[];
  patchedFiles: { fileId: string; params: URLSearchParams; hasFile: boolean }[];
  uploaded: { params: URLSearchParams }[];
  deletedFiles: string[];
  deletedFolders: string[];
  synced: string[];
  /** ローカル用サーバー（接続先）へ届いたファイルの操作 */
  localRequests: { method: string; path: string; authKey: string | null }[];
  /** クラウドの API へ届いたファイルの操作 */
  cloudFileRequests: string[];
}

interface MockOptions {
  index?: IndexFixture;
  /** backend は更新者名を持たないファイルでは `updatedBy` を返さない（null） */
  files?: (Omit<(typeof FIXTURE_FILES)[number], 'updatedBy'> & { updatedBy: string | null })[];
  detailFails?: boolean;
}

function recordLocal(log: RequestLog, request: Request) {
  log.localRequests.push({
    method: request.method,
    path: new URL(request.url).pathname,
    authKey: request.headers.get('X-Server-Auth-Key'),
  });
}

/** 詳細・ファイル・接続先・グループ・各更新系の API を差し替え、受けたリクエストを記録する */
function mockApis(options: MockOptions = {}): RequestLog {
  const log: RequestLog = {
    fileListParams: [],
    patchedFolders: [],
    patchedFiles: [],
    uploaded: [],
    deletedFiles: [],
    deletedFolders: [],
    synced: [],
    localRequests: [],
    cloudFileRequests: [],
  };
  const index = options.index ?? FIXTURE_CLOUD_INDEX;
  const files = options.files ?? FIXTURE_FILES;

  server.use(
    // ローカルのフォルダのファイル操作は、クラウドではなく接続先（ローカル用サーバー）へ送られる。
    // クラウド側のパスは先頭がワイルドカードでローカル用サーバーの URL にも一致するため、先に登録する
    http.get(LOCAL_FILES_PATH, ({ request }) => {
      recordLocal(log, request);
      log.fileListParams.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        content: files,
        totalElements: files.length,
        number: 0,
        size: 10,
      });
    }),
    http.delete(LOCAL_FILE_PATH, ({ request }) => {
      recordLocal(log, request);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(LOCAL_SYNC_PATH, ({ params }) => {
      log.synced.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(DETAIL_PATH, () =>
      options.detailFails ? HttpResponse.json({ message: 'ng' }, { status: 404 }) : HttpResponse.json(index),
    ),
    http.patch(DETAIL_PATH, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      log.patchedFolders.push(body);
      return HttpResponse.json({ ...index, ...body });
    }),
    http.delete(DETAIL_PATH, ({ params }) => {
      log.deletedFolders.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(SYNC_PATH, ({ params }) => {
      log.synced.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(FILES_PATH, ({ request }) => {
      log.cloudFileRequests.push('GET files');
      log.fileListParams.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        content: files,
        totalElements: files.length,
        number: 0,
        size: 10,
      });
    }),
    http.post(FILES_PATH, async ({ request }) => {
      log.cloudFileRequests.push('POST files');
      // jsdom の File は undici の formData() で読めないため、本文は読まずにクエリだけ記録する
      log.uploaded.push({ params: new URL(request.url).searchParams });
      return HttpResponse.json(files[0]);
    }),
    http.patch(FILE_PATH, async ({ request, params }) => {
      const hasFile = (request.headers.get('content-type') ?? '').includes('multipart');
      log.patchedFiles.push({
        fileId: String(params.fileId),
        params: new URL(request.url).searchParams,
        hasFile,
      });
      return HttpResponse.json(files[0]);
    }),
    http.delete(FILE_PATH, ({ params }) => {
      log.cloudFileRequests.push('DELETE file');
      log.deletedFiles.push(String(params.fileId));
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(ENDPOINTS_PATH, ({ params }) => {
      const type = String(params.type);
      const rows: Record<string, { id: string; endpointName: string }[]> = {
        LOCAL_SERVER: [
          { id: 'le1', endpointName: 'ローカルA' },
          { id: 'le2', endpointName: 'ローカルB' },
        ],
        VDB: [{ id: 'v1', endpointName: 'VDB' }],
        AZURE_OPENAI_EMBEDDING: [{ id: 'm1', endpointName: 'Embedding' }],
      };
      return HttpResponse.json(
        (rows[type] ?? []).map((row) => ({ ...row, tenantId: 'tenant', type, endpoint: 'http://x' })),
      );
    }),
    http.get(GROUPS_PATH, () =>
      HttpResponse.json({ data: [{ id: 'g1', name: 'g1' }, { id: 'g2', name: 'g2' }], total: 2, page: 0, size: 100 }),
    ),
  );
  return log;
}

async function renderPage() {
  setAuthUser(FIXTURE_TENANT_ADMIN);
  const result = renderApp(`/admin/training-data/${INDEX_ID}`);
  // 画面の読み込み（遅延 import）は、全件を並列で流すと 1 秒の既定では足りないことがある
  await screen.findByText('製品マニュアル', { selector: 'p' }, { timeout: 10000 });
  return result;
}

async function openFileMenu(user: ReturnType<typeof userEvent.setup>, rowIndex: number) {
  const row = screen.getAllByTestId('training-data-file-row')[rowIndex];
  await user.click(within(row).getByTestId('training-data-file-menu-button'));
}

beforeEach(() => {
  useTrainingDataStore.getState().resetFilesFilter();
});

afterEach(() => {
  setAuthUser(null);
});

describe('TrainingDataDetailPage', () => {
  describe('表示', () => {
    test('フォルダ名が見出しに、ファイルが一覧に表示されること', async () => {
      mockApis();
      await renderPage();

      expect(screen.getByTestId('training-data-detail-title')).toHaveTextContent('製品マニュアル');
      const rows = screen.getAllByTestId('training-data-file-row');
      expect(rows).toHaveLength(2);
      // 表示名の無いファイルはファイル名を表示名にし、更新者は API が返す名前にする
      expect(within(rows[0]).getByText('manual-link')).toBeInTheDocument();
      expect(within(rows[0]).getByText('山田太郎')).toBeInTheDocument();
      // 学習設定（ON / OFF）の列は出さない（NAW-1405）
      expect(screen.queryByText('LEARNING_DATA.STATUS_ON')).not.toBeInTheDocument();
      expect(screen.queryByText('LEARNING_DATA.STATUS_OFF')).not.toBeInTheDocument();
      expect(within(rows[1]).getByText('rules.txt')).toBeInTheDocument();
      expect(screen.getByText('1-2件 / 2件')).toBeInTheDocument();
    });

    test('初期の取得条件が page 0・size 10・更新日時の降順であること', async () => {
      const log = mockApis();
      await renderPage();

      const params = log.fileListParams[0];
      expect(params.get('page')).toBe('0');
      expect(params.get('size')).toBe('10');
      expect(params.get('sort')).toBe('updatedAt,desc');
      expect(params.has('displayName')).toBe(false);
    });

    test('クラウド接続ではダウンロードができ、一括同期と案内は出ないこと', async () => {
      mockApis();
      await renderPage();

      expect(screen.getAllByTestId('training-data-file-download-button')).toHaveLength(2);
      expect(screen.queryByTestId('training-data-sync-button')).not.toBeInTheDocument();
      expect(screen.queryByText('LEARNING_DATA.LOCAL_INFO_TITLE')).not.toBeInTheDocument();
    });

    test('ローカル接続では案内と一括同期が出て、ダウンロードは出ないこと', async () => {
      mockApis({ index: FIXTURE_LOCAL_INDEX });
      await renderPage();

      expect(screen.getByText('LEARNING_DATA.LOCAL_INFO_TITLE')).toBeInTheDocument();
      expect(screen.getByTestId('training-data-sync-button')).toBeInTheDocument();
      expect(screen.queryByTestId('training-data-file-download-button')).not.toBeInTheDocument();
    });

    test('詳細を取得できないとき、データがありませんと表示されること', async () => {
      mockApis({ detailFails: true });
      setAuthUser(FIXTURE_TENANT_ADMIN);
      renderApp(`/admin/training-data/${INDEX_ID}`);

      expect(await screen.findByText('COMMON.NO_DATA')).toBeInTheDocument();
      expect(screen.getByTestId('training-data-detail-title')).toHaveTextContent('LEARNING_DATA.DETAIL_TITLE');
    });
  });

  describe('検索と絞り込み', () => {
    test('検索語が表示名とファイル名の条件で送られること', async () => {
      const log = mockApis();
      await renderPage();
      const user = userEvent.setup({ applyAccept: false });

      await user.type(screen.getByTestId('training-data-file-search-input'), 'abc');

      await waitFor(() => {
        const params = log.fileListParams[log.fileListParams.length - 1];
        expect(params.get('displayName')).toBe('abc');
        expect(params.get('fileName')).toBe('abc');
      });
    });

    test('学習設定の絞り込みがなく、一覧の取得で status を送らないこと', async () => {
      const log = mockApis();
      await renderPage();

      expect(screen.queryByText('LEARNING_DATA.ALL_SETTINGS')).not.toBeInTheDocument();
      expect(log.fileListParams.every((params) => !params.has('status'))).toBe(true);
    });
  });

  describe('学習設定', () => {
    test('行のメニューに学習設定の ON・OFF の切り替えが出ないこと', async () => {
      mockApis();
      await renderPage();
      const user = userEvent.setup({ applyAccept: false });

      await openFileMenu(user, 0);

      expect(await screen.findByTestId('training-data-file-edit-settings')).toBeInTheDocument();
      expect(screen.queryByTestId('training-data-file-toggle-learning')).not.toBeInTheDocument();
    });
  });

  describe('削除', () => {
    test('行のメニューから削除を確認して実行できること', async () => {
      const log = mockApis();
      await renderPage();
      const user = userEvent.setup({ applyAccept: false });

      await openFileMenu(user, 1);
      await user.click(await screen.findByTestId('training-data-file-menu-delete'));
      expect(await screen.findByText('LEARNING_DATA.DELETE_CONFIRM_MESSAGE')).toBeInTheDocument();
      await user.click(screen.getByTestId('training-data-delete-confirm'));

      await waitFor(() => expect(log.deletedFiles).toEqual(['f2']));
    });

    test('削除の確認でキャンセルすると削除されないこと', async () => {
      const log = mockApis();
      await renderPage();
      const user = userEvent.setup({ applyAccept: false });

      await openFileMenu(user, 1);
      await user.click(await screen.findByTestId('training-data-file-menu-delete'));
      await user.click(await screen.findByTestId('training-data-delete-cancel'));

      expect(log.deletedFiles).toEqual([]);
      expect(screen.queryByText('LEARNING_DATA.DELETE_CONFIRM_MESSAGE')).not.toBeInTheDocument();
    });

    test('選択した複数のファイルをまとめて削除でき、選択が解除されること', async () => {
      const log = mockApis();
      await renderPage();
      const user = userEvent.setup({ applyAccept: false });

      await user.click(screen.getByText('rules.txt'));
      await user.click(screen.getByText('manual-link'));
      await user.click(screen.getByTestId('training-data-delete-selected-button'));
      await user.click(await screen.findByTestId('training-data-delete-confirm'));

      await waitFor(() => expect(log.deletedFiles.sort()).toEqual(['f1', 'f2']));
      expect(screen.getByTestId('training-data-add-button')).toBeInTheDocument();
    });
  });

  describe('名前の変更', () => {
    test('選択したファイルの表示名とリンク名を一覧上で変更できること', async () => {
      const log = mockApis();
      await renderPage();
      const user = userEvent.setup({ applyAccept: false });

      await user.click(screen.getByText('manual-link'));
      await user.click(screen.getByTestId('training-data-edit-name-button'));
      const displayName = screen.getByLabelText('学習データの表示名');
      await user.clear(displayName);
      await user.type(displayName, '新しい名前');
      await user.click(screen.getByTestId('training-data-save-rename-button'));

      await waitFor(() => expect(log.patchedFiles).toHaveLength(1));
      expect(log.patchedFiles[0].params.get('displayName')).toBe('新しい名前');
      // リンク名は変えていないので送らない
      expect(log.patchedFiles[0].params.has('reference')).toBe(false);
      expect(screen.getByText('新しい名前')).toBeInTheDocument();
    });
  });

  describe('学習データの追加', () => {
    async function openAddDialog(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByTestId('training-data-add-button'));
      await screen.findByRole('dialog');
    }

    test('ファイルを選ぶと拡張子を除いた名前が表示名・リンク名に入り、まとめて追加できること', async () => {
      const log = mockApis();
      await renderPage();
      const user = userEvent.setup({ applyAccept: false });

      await openAddDialog(user);
      const input = document.getElementById('file-upload') as HTMLInputElement;
      await user.upload(input, new File(['a'], 'guide.pdf', { type: 'application/pdf' }));

      expect(await screen.findByTestId('training-data-add-display-name')).toHaveValue('guide');
      expect(screen.getByTestId('training-data-add-reference')).toHaveValue('guide');

      await user.type(screen.getByTestId('training-data-add-link-prefix'), 'https://x/');
      await user.click(screen.getByTestId('training-data-add-apply-prefix'));
      expect(screen.getByTestId('training-data-add-reference')).toHaveValue('https://x/guide');
      // 押し直しても同じ接頭辞が重ならない
      await user.click(screen.getByTestId('training-data-add-apply-prefix'));
      expect(screen.getByTestId('training-data-add-reference')).toHaveValue('https://x/guide');

      await user.click(screen.getByTestId('training-data-add-submit'));

      await waitFor(() => expect(log.uploaded).toHaveLength(1));
      expect(log.uploaded[0].params.get('displayName')).toBe('guide');
      expect(log.uploaded[0].params.get('reference')).toBe('https://x/guide');
      expect(log.uploaded[0].params.get('splitLength')).toBe('1000');
      // backend はファイルを付けるとき name を必須にしている
      expect(log.uploaded[0].params.get('name')).toBe('guide.pdf');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    test('先頭に一括追加は、編集したリンクに付き、入力し直した文字を使うこと', async () => {
      mockApis();
      await renderPage();
      const user = userEvent.setup({ applyAccept: false });

      await openAddDialog(user);
      const input = document.getElementById('file-upload') as HTMLInputElement;
      await user.upload(input, new File(['a'], 'guide.pdf', { type: 'application/pdf' }));
      const reference = await screen.findByTestId('training-data-add-reference');
      await user.clear(reference);
      await user.type(reference, 'edited');

      const prefix = screen.getByTestId('training-data-add-link-prefix');
      await user.type(prefix, 'A/');
      await user.click(screen.getByTestId('training-data-add-apply-prefix'));
      expect(reference).toHaveValue('A/edited');

      // 文字を変えて押し直すと、変えた文字が使われる（最初に適用した文字が使われ続けない）
      await user.clear(prefix);
      await user.type(prefix, 'B/');
      await user.click(screen.getByTestId('training-data-add-apply-prefix'));
      expect(reference).toHaveValue('B/A/edited');
    });

    test('表示名を空にすると完了を押せず、送信されないこと', async () => {
      const log = mockApis();
      await renderPage();
      const user = userEvent.setup({ applyAccept: false });

      await openAddDialog(user);
      const input = document.getElementById('file-upload') as HTMLInputElement;
      await user.upload(input, new File(['a'], 'guide.pdf'));
      await user.clear(await screen.findByTestId('training-data-add-display-name'));

      expect(screen.getByTestId('training-data-add-submit')).toBeDisabled();
      expect(log.uploaded).toEqual([]);
    });

    test('ファイルを選ぶまで完了を押せないこと', async () => {
      mockApis();
      await renderPage();
      const user = userEvent.setup({ applyAccept: false });

      await openAddDialog(user);

      expect(screen.getByTestId('training-data-add-submit')).toBeDisabled();
    });
  });

  describe('学習データの設定の編集', () => {
    test('表示名・リンク名を変更して保存でき、学習設定のスイッチは出ず status は送らないこと', async () => {
      const log = mockApis();
      await renderPage();
      const user = userEvent.setup({ applyAccept: false });

      await openFileMenu(user, 0);
      await user.click(await screen.findByTestId('training-data-file-edit-settings'));
      const displayName = await screen.findByTestId('training-data-edit-display-name');
      expect(displayName).toHaveValue('製品マニュアル');
      expect(screen.getByTestId('training-data-edit-reference')).toHaveValue('manual-link');
      await user.clear(displayName);
      await user.type(displayName, '改訂版');
      await user.click(screen.getByTestId('training-data-edit-submit'));

      await waitFor(() => expect(log.patchedFiles).toHaveLength(1));
      const patch = log.patchedFiles[0];
      expect(patch.fileId).toBe('f1');
      expect(patch.params.get('displayName')).toBe('改訂版');
      expect(patch.params.has('status')).toBe(false);
      expect(screen.queryByTestId('training-data-edit-status')).not.toBeInTheDocument();
      // チャンク分割を変えていないので送らない。ファイルも選んでいない
      expect(patch.params.has('splitLength')).toBe(false);
      expect(patch.hasFile).toBe(false);
    });

    test('選んだファイルを × で取り消すと、保存でファイルが送られず、書き換えた欄が戻ること', async () => {
      const log = mockApis();
      await renderPage();
      const user = userEvent.setup({ applyAccept: false });

      await openFileMenu(user, 0);
      await user.click(await screen.findByTestId('training-data-file-edit-settings'));
      await user.upload(
        await screen.findByTestId('training-data-edit-file-input'),
        new File(['b'], 'new.pdf', { type: 'application/pdf' }),
      );
      expect(screen.getByTestId('training-data-edit-reference')).toHaveValue('new.pdf');

      // 画像以外はチップで出て、そこから取り消せる
      const chip = screen.getByTestId('training-data-edit-file-chip');
      await user.click(within(chip).getByRole('button'));

      expect(screen.queryByTestId('training-data-edit-file-chip')).not.toBeInTheDocument();
      expect(screen.getByTestId('training-data-edit-reference')).toHaveValue('manual-link');
      await user.click(screen.getByTestId('training-data-edit-submit'));

      await waitFor(() => expect(log.patchedFiles).toHaveLength(1));
      expect(log.patchedFiles[0].hasFile).toBe(false);
    });

    test('取り消したあとに同じファイルを選び直せること', async () => {
      mockApis();
      await renderPage();
      const user = userEvent.setup({ applyAccept: false });

      await openFileMenu(user, 0);
      await user.click(await screen.findByTestId('training-data-file-edit-settings'));
      const file = new File(['b'], 'new.pdf', { type: 'application/pdf' });
      await user.upload(await screen.findByTestId('training-data-edit-file-input'), file);
      await user.click(within(screen.getByTestId('training-data-edit-file-chip')).getByRole('button'));
      await user.upload(screen.getByTestId('training-data-edit-file-input'), file);

      expect(screen.getByTestId('training-data-edit-file-chip')).toBeInTheDocument();
      expect(screen.getByTestId('training-data-edit-reference')).toHaveValue('new.pdf');
    });

    test('リンク名が未設定のファイルは、入力するまで保存できないこと', async () => {
      const log = mockApis();
      await renderPage();
      const user = userEvent.setup({ applyAccept: false });

      await openFileMenu(user, 1);
      await user.click(await screen.findByTestId('training-data-file-edit-settings'));
      await user.click(await screen.findByTestId('training-data-edit-submit'));

      expect(await screen.findByText('VALIDATION.REQUIRED')).toBeInTheDocument();
      expect(log.patchedFiles).toEqual([]);
    });

    test('新しいファイルを選んで保存すると、ファイルが送られること', async () => {
      const log = mockApis();
      await renderPage();
      const user = userEvent.setup({ applyAccept: false });

      await openFileMenu(user, 0);
      await user.click(await screen.findByTestId('training-data-file-edit-settings'));
      await user.upload(
        await screen.findByTestId('training-data-edit-file-input'),
        new File(['b'], 'new.pdf', { type: 'application/pdf' }),
      );
      expect(screen.getByTestId('training-data-edit-reference')).toHaveValue('new.pdf');
      await user.click(screen.getByTestId('training-data-edit-submit'));

      await waitFor(() => expect(log.patchedFiles).toHaveLength(1));
      expect(log.patchedFiles[0].hasFile).toBe(true);
      expect(log.patchedFiles[0].params.get('name')).toBe('new.pdf');
    });

    test('スマートフォンの追加ボタンから、1 件ずつ追加できること', async () => {
      const log = mockApis();
      await renderPage();
      const user = userEvent.setup({ applyAccept: false });

      await user.click(screen.getByTestId('training-data-add-button-sp'));
      await user.upload(
        await screen.findByTestId('training-data-edit-file-input'),
        new File(['c'], 'sp.txt', { type: 'text/plain' }),
      );
      expect(screen.getByTestId('training-data-edit-display-name')).toHaveValue('sp');
      await user.click(screen.getByTestId('training-data-edit-submit'));

      await waitFor(() => expect(log.uploaded).toHaveLength(1));
      expect(log.uploaded[0].params.get('displayName')).toBe('sp');
      expect(log.uploaded[0].params.get('reference')).toBe('sp.txt');
    });
  });

  describe('更新者の欄', () => {
    test('クラウドは API の更新者名を出し、テナントの全ユーザーを取らないこと', async () => {
      let userListRequests = 0;
      server.use(
        http.get(mockPath(API_PATHS.ADMIN.USERS.LIST), () => {
          userListRequests += 1;
          return HttpResponse.json({ content: [], totalElements: 0, totalPages: 1, page: 0, size: 10 });
        }),
      );
      mockApis();
      await renderPage();

      const rows = screen.getAllByTestId('training-data-file-row');
      expect(within(rows[1]).getByTestId('training-data-file-updated-by')).toHaveTextContent('鈴木花子');
      expect(userListRequests).toBe(0);
    });

    test('名前が無いときは ID を出さず、削除されたユーザーと Unknown を出し分けること', async () => {
      const files = [
        { ...FIXTURE_FILES[0], updatedBy: null },
        { ...FIXTURE_FILES[1], updatedBy: null },
      ];
      mockApis({ files });
      await renderPage();

      const updaters = screen
        .getAllByTestId('training-data-file-updated-by')
        .map((cell) => cell.textContent);
      expect(updaters).toEqual([
        'LEARNING_DATA.UPDATED_BY_DELETED',
        'LEARNING_DATA.UPDATED_BY_DELETED',
      ]);
      expect(screen.queryByText('u1')).not.toBeInTheDocument();
      expect(screen.queryByText('u2')).not.toBeInTheDocument();
    });

    test('更新者を絞り込む選択肢が出ないこと', async () => {
      mockApis();
      await renderPage();

      expect(document.querySelector('[data-testid^="training-data-file-user"]')).toBeNull();
    });
  });

  describe('ローカルのフォルダ', () => {
    test('一覧はクラウドではなくローカル用サーバーから、API キーを付けて取ること', async () => {
      const log = mockApis({ index: FIXTURE_LOCAL_INDEX });
      await renderPage();

      expect(log.localRequests).toEqual([
        {
          method: 'GET',
          path: `/api/admin/indexes/${INDEX_ID}/files`,
          authKey: 'mock-local-key',
        },
      ]);
      expect(log.cloudFileRequests).toEqual([]);
    });

    test('削除はクラウドではなくローカル用サーバーへ送られること', async () => {
      const log = mockApis({ index: FIXTURE_LOCAL_INDEX });
      await renderPage();
      const user = userEvent.setup({ applyAccept: false });

      await openFileMenu(user, 1);
      await user.click(await screen.findByTestId('training-data-file-menu-delete'));
      await user.click(await screen.findByTestId('training-data-delete-confirm'));

      await waitFor(() =>
        expect(log.localRequests).toContainEqual({
          method: 'DELETE',
          path: `/api/admin/indexes/${INDEX_ID}/files/f2`,
          authKey: 'mock-local-key',
        }),
      );
      expect(log.cloudFileRequests).toEqual([]);
    });

    test('更新者名は、表示しているファイルのログイン ID だけでユーザーを引いて出すこと', async () => {
      const loginIdQueries: string[][] = [];
      server.use(
        http.get(mockPath(API_PATHS.ADMIN.USERS.LIST), ({ request }) => {
          loginIdQueries.push(new URL(request.url).searchParams.getAll('loginIds'));
          return HttpResponse.json({
            content: [
              { id: 'uuid-1', loginId: 'yamada', name: '山田太郎', role: 'USER', loginKey: null, isRequiredPasswordReset: false, totalCredits: 0 },
            ],
            totalElements: 1,
            totalPages: 1,
            page: 0,
            size: 10,
          });
        }),
      );
      mockApis({
        index: FIXTURE_LOCAL_INDEX,
        files: FIXTURE_FILES.map((file) => ({ ...file, userId: 'yamada', updatedBy: 'yamada' })),
      });
      await renderPage();

      await waitFor(() => expect(screen.getAllByText('山田太郎').length).toBeGreaterThan(0));
      expect(loginIdQueries).toContainEqual(['yamada']);
    });

    test('ログイン ID でユーザーを引けないときは、ID を出さず削除されたユーザーと出すこと', async () => {
      server.use(
        http.get(mockPath(API_PATHS.ADMIN.USERS.LIST), () =>
          HttpResponse.json({ content: [], totalElements: 0, totalPages: 1, page: 0, size: 10 }),
        ),
      );
      mockApis({
        index: FIXTURE_LOCAL_INDEX,
        files: FIXTURE_FILES.map((file) => ({ ...file, userId: 'retired', updatedBy: 'retired' })),
      });
      await renderPage();

      await waitFor(() =>
        expect(screen.getAllByTestId('training-data-file-updated-by')[0]).toHaveTextContent(
          'LEARNING_DATA.UPDATED_BY_DELETED',
        ),
      );
      expect(screen.queryByText('retired')).not.toBeInTheDocument();
    });

    test('名前を引く前の行を出さず、実在のユーザーが削除されたユーザーと出る瞬間が無いこと', async () => {
      let releaseUsers: () => void = () => undefined;
      const usersGate = new Promise<void>((resolve) => {
        releaseUsers = resolve;
      });
      server.use(
        http.get(mockPath(API_PATHS.ADMIN.USERS.LIST), async () => {
          await usersGate;
          return HttpResponse.json({
            content: [
              { id: 'uuid-1', loginId: 'yamada', name: '山田太郎', role: 'USER', loginKey: null, isRequiredPasswordReset: false, totalCredits: 0 },
            ],
            totalElements: 1,
            totalPages: 1,
            page: 0,
            size: 10,
          });
        }),
      );
      mockApis({
        index: FIXTURE_LOCAL_INDEX,
        files: FIXTURE_FILES.map((file) => ({ ...file, userId: 'yamada', updatedBy: 'yamada' })),
      });
      setAuthUser(FIXTURE_TENANT_ADMIN);
      renderApp(`/admin/training-data/${INDEX_ID}`);

      // ユーザーの応答が返るまで、一覧の行も「削除されたユーザー」も出さない
      await waitFor(() => expect(document.querySelector('[data-testid="training-data-detail-title"]')).not.toBeNull());
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(screen.queryAllByTestId('training-data-file-updated-by')).toHaveLength(0);
      expect(screen.queryByText('LEARNING_DATA.UPDATED_BY_DELETED')).not.toBeInTheDocument();

      releaseUsers();
      await waitFor(() => expect(screen.getAllByText('山田太郎').length).toBeGreaterThan(0));
    });

    test('名前を引けなかったときは、全行を削除されたユーザーと出さず、一覧の取得の失敗として扱うこと', async () => {
      server.use(
        http.get(mockPath(API_PATHS.ADMIN.USERS.LIST), () =>
          HttpResponse.json({ message: 'ng' }, { status: 500 }),
        ),
      );
      mockApis({
        index: FIXTURE_LOCAL_INDEX,
        files: FIXTURE_FILES.map((file) => ({ ...file, userId: 'yamada', updatedBy: 'yamada' })),
      });
      setAuthUser(FIXTURE_TENANT_ADMIN);
      renderApp(`/admin/training-data/${INDEX_ID}`);

      await waitFor(() => expect(screen.queryByTestId('training-data-detail-title')).not.toBeNull());
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(screen.queryAllByTestId('training-data-file-updated-by')).toHaveLength(0);
      expect(screen.queryByText('LEARNING_DATA.UPDATED_BY_DELETED')).not.toBeInTheDocument();
    });

    test('接続先が登録されていないときは、どこにも送らずエラーを表示すること', async () => {
      const log = mockApis({ index: { ...FIXTURE_LOCAL_INDEX, tenantEndpoints: [] } });
      useToastStore.getState().clear();
      setAuthUser(FIXTURE_TENANT_ADMIN);
      renderApp(`/admin/training-data/${INDEX_ID}`);

      await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
      expect(useToastStore.getState().toasts[0].type).toBe('error');
      expect(log.localRequests).toEqual([]);
      expect(log.cloudFileRequests).toEqual([]);
    });
  });

  describe('同期', () => {
    test('一括同期を押すと 3 秒待ってから同期され、一覧が読み直されること', async () => {
      const log = mockApis({ index: FIXTURE_LOCAL_INDEX });
      await renderPage();
      const user = userEvent.setup({ applyAccept: false });
      const fileRequestsBefore = log.fileListParams.length;

      await user.click(screen.getByTestId('training-data-sync-button'));
      expect(log.synced).toEqual([]);

      await waitFor(() => expect(log.synced).toEqual([INDEX_ID]), { timeout: 8000 });
      await waitFor(() => expect(log.fileListParams.length).toBeGreaterThan(fileRequestsBefore));
    }, 15000);
  });

  describe('学習先フォルダの編集', () => {
    async function openEditFolder(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByTestId('training-data-detail-menu-button'));
      await user.click(await screen.findByTestId('training-data-detail-edit-folder'));
      await screen.findByRole('dialog');
      await waitFor(() =>
        expect(screen.queryByTestId('admin-training-data-edit-folder-loading')).not.toBeInTheDocument(),
      );
    }

    test('ローカル接続のフォルダは現在の値が入り、接続サーバーは変えられないこと', async () => {
      mockApis({ index: FIXTURE_LOCAL_INDEX });
      await renderPage();
      const user = userEvent.setup({ applyAccept: false });

      await openEditFolder(user);

      expect(screen.getByTestId('admin-training-data-edit-folder-name')).toHaveValue('社内規程');
      expect(screen.getByTestId('admin-training-data-edit-folder-fetch-id')).toHaveValue('fetch-1');
      expect(screen.getByTestId('admin-training-data-edit-folder-delete-id')).toHaveValue('delete-1');
      expect(screen.getByTestId('admin-training-data-edit-folder-learn-id')).toHaveValue('learn-1');
      // 登録済みの接続先が選ばれている
      expect(within(screen.getByRole('dialog')).getByText('ローカルB')).toBeInTheDocument();
      screen.getAllByRole('radio').forEach((radio) => expect(radio).toBeDisabled());
    });

    test('名前を変えて保存すると、全グループと現在の接続先を付けて更新されること', async () => {
      const log = mockApis({ index: FIXTURE_LOCAL_INDEX });
      await renderPage();
      const user = userEvent.setup({ applyAccept: false });

      await openEditFolder(user);
      const name = screen.getByTestId('admin-training-data-edit-folder-name');
      await user.clear(name);
      await user.type(name, '新フォルダ名');
      await user.click(screen.getByTestId('admin-training-data-edit-folder-submit'));

      await waitFor(() => expect(log.patchedFolders).toHaveLength(1));
      expect(log.patchedFolders[0]).toMatchObject({
        name: '新フォルダ名',
        type: 'LOCAL',
        endpointIds: ['le2'],
        groupIds: ['g1', 'g2'],
        get: 'fetch-1',
        delete: 'delete-1',
        add: 'learn-1',
      });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    test('更新に成功したら、フィードバック一覧の学習先フォルダの一覧を取り直す印が付くこと', async () => {
      mockApis({ index: FIXTURE_LOCAL_INDEX });
      const { queryClient } = await renderPage();
      queryClient.setQueryData(LEARNING_FOLDERS_QUERY_KEY, []);
      const user = userEvent.setup({ applyAccept: false });

      await openEditFolder(user);
      await user.click(screen.getByTestId('admin-training-data-edit-folder-submit'));

      await waitFor(() =>
        expect(queryClient.getQueryState(LEARNING_FOLDERS_QUERY_KEY)?.isInvalidated).toBe(true),
      );
    });

    test('クラウド接続のフォルダは接続先とサービスIDの欄が出ず、既存の接続先で更新されること', async () => {
      const log = mockApis();
      await renderPage();
      const user = userEvent.setup({ applyAccept: false });

      await openEditFolder(user);
      expect(screen.queryByTestId('admin-training-data-edit-folder-fetch-id')).not.toBeInTheDocument();
      await user.click(screen.getByTestId('admin-training-data-edit-folder-submit'));

      await waitFor(() => expect(log.patchedFolders).toHaveLength(1));
      expect(log.patchedFolders[0]).toMatchObject({
        type: 'SAAS_GLOBAL',
        endpointIds: ['v1', 'm1'],
      });
      expect(log.patchedFolders[0]).not.toHaveProperty('get');
    });

    test('名前を空にして保存すると必須エラーが出て、更新されないこと', async () => {
      const log = mockApis();
      await renderPage();
      const user = userEvent.setup({ applyAccept: false });

      await openEditFolder(user);
      await user.clear(screen.getByTestId('admin-training-data-edit-folder-name'));

      // 名前が空の間は保存ボタンが押せない（移植元の canSubmit）
      expect(screen.getByTestId('admin-training-data-edit-folder-submit')).toBeDisabled();
      expect(log.patchedFolders).toEqual([]);
    });
  });

  describe('学習先フォルダの削除', () => {
    test('確認して削除すると API が呼ばれ、前の画面へ戻ること', async () => {
      const log = mockApis();
      const { router } = await renderPage();
      const user = userEvent.setup({ applyAccept: false });
      const backSpy = vi.spyOn(router, 'navigate');

      await user.click(screen.getByTestId('training-data-detail-menu-button'));
      await user.click(await screen.findByTestId('training-data-detail-delete-folder'));
      expect(await screen.findByText('LEARNING_DATA.DELETE_FOLDER_CONFIRM_TITLE')).toBeInTheDocument();
      await user.click(screen.getByTestId('training-data-detail-delete-confirm'));

      await waitFor(() => expect(log.deletedFolders).toEqual([INDEX_ID]));
      await waitFor(() => expect(backSpy).toHaveBeenCalledWith(-1));
    });

    test('削除が終わってから前の画面へ戻り、学習先フォルダの一覧を取り直す印が付くこと', async () => {
      const log = mockApis();
      let respond: () => void = () => {};
      server.use(
        http.delete(DETAIL_PATH, ({ params }) => {
          log.deletedFolders.push(String(params.id));
          return new Promise<Response>((resolve) => {
            respond = () => resolve(new HttpResponse(null, { status: 204 }));
          });
        }),
      );
      const { router, queryClient } = await renderPage();
      queryClient.setQueryData(LEARNING_FOLDERS_QUERY_KEY, []);
      const user = userEvent.setup({ applyAccept: false });
      const backSpy = vi.spyOn(router, 'navigate');

      await user.click(screen.getByTestId('training-data-detail-menu-button'));
      await user.click(await screen.findByTestId('training-data-detail-delete-folder'));
      await user.click(await screen.findByTestId('training-data-detail-delete-confirm'));
      await waitFor(() => expect(log.deletedFolders).toEqual([INDEX_ID]));

      // 応答が返るまでは戻らない（戻ると削除前の一覧が出ることがある）
      expect(backSpy).not.toHaveBeenCalled();
      respond();
      await waitFor(() => expect(backSpy).toHaveBeenCalledWith(-1));
      expect(queryClient.getQueryState(LEARNING_FOLDERS_QUERY_KEY)?.isInvalidated).toBe(true);
    });

    test('削除に失敗したら前の画面へ戻らず詳細にとどまること', async () => {
      mockApis();
      server.use(http.delete(DETAIL_PATH, () => HttpResponse.json({ message: 'ng' }, { status: 500 })));
      const { router } = await renderPage();
      const user = userEvent.setup({ applyAccept: false });
      const backSpy = vi.spyOn(router, 'navigate');

      await user.click(screen.getByTestId('training-data-detail-menu-button'));
      await user.click(await screen.findByTestId('training-data-detail-delete-folder'));
      await user.click(await screen.findByTestId('training-data-detail-delete-confirm'));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(backSpy).not.toHaveBeenCalled();
    });
  });

  describe('戻るボタン', () => {
    test('学習データの一覧へのリンクであること', async () => {
      mockApis();
      await renderPage();

      expect(screen.getByTestId('training-data-detail-back')).toHaveAttribute('href', '/admin/training-data');
    });
  });
});
