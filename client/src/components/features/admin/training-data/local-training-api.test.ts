import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { persistTenantId, setApiErrorHandler, type ApiErrorContext } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { server } from '@/test/setup';
import type { TrainingDataApiItem, TrainingDataFileFilter } from '@/types/training-data.types';
import {
  addLocalFiles,
  deleteLocalFiles,
  listLocalFiles,
  syncLocalFolder,
  updateLocalFile,
} from './local-training-api';

const LOCAL_ENDPOINT = 'http://local-server.test/secuaigent';
const API_KEY = 'local-key';
const FILES_URL = `${LOCAL_ENDPOINT}/api/admin/indexes/i1/files`;
const FILTER: TrainingDataFileFilter = { pageSize: 10, pageIndex: 1 };

const FOLDER: TrainingDataApiItem = {
  id: 'i1',
  name: 'ローカル',
  description: '',
  type: 'LOCAL',
  updatedAt: '2026-11-01T00:00:00',
  add: 'svc-add',
  delete: 'svc-delete',
  get: 'svc-get',
  localServerEndpointId: 'e1',
};

interface Recorded {
  method: string;
  url: string;
  headers: Headers;
  body?: unknown;
  form?: Multipart;
}

/** 受け取った multipart の項目。jsdom の `File` を含む本文は MSW の `formData()` で読めず、ファイル名も `blob` になる（ブラウザでは保たれる）ため、本文を自前で読み、ファイルは有無だけ確かめる */
interface Multipart {
  get: (name: string) => string | undefined;
  has: (name: string) => boolean;
}

const PART_PATTERN =
  /name="([^"]+)"(?:; filename="([^"]*)")?\r\n(?:[^\r\n]+\r\n)*\r\n([\s\S]*?)\r\n$/;

async function readMultipart(request: Request): Promise<Multipart> {
  const boundary = /boundary=(.+)$/.exec(request.headers.get('content-type') ?? '')?.[1] ?? '';
  const values = new Map<string, string>();
  for (const part of (await request.text()).split(`--${boundary}`)) {
    const match = PART_PATTERN.exec(part.replace(/^\r\n/, ''));
    if (!match) continue;
    values.set(match[1], match[3]);
  }
  return {
    get: (name) => values.get(name),
    has: (name) => values.has(name),
  };
}

let requests: Recorded[];
let endpointLookups: number;

/** 接続先の取得（クラウド）をモックする。`endpoint` を関数にすると、取得のたびに値を変えられる */
function useEndpoint(value: () => { endpoint: string; apiKey: string } | Record<string, never>) {
  server.use(
    http.get(mockPath(API_PATHS.LOCAL_SERVER.ENDPOINT(':endpointId')), () => {
      endpointLookups += 1;
      return HttpResponse.json(value());
    }),
  );
}

async function record(request: Request): Promise<Recorded> {
  const url = request.url;
  const method = request.method;
  const headers = request.headers;
  if ((request.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
    return { method, url, headers, form: await readMultipart(request) };
  }
  const text = await request.text();
  return { method, url, headers, body: text ? JSON.parse(text) : undefined };
}

function useLocalServer(extra: Parameters<typeof server.use>[0][] = []) {
  server.use(
    http.all(`${LOCAL_ENDPOINT}/*`, async ({ request }) => {
      requests.push(await record(request));
      return HttpResponse.json({ content: [], totalElements: 0, number: 0, size: 10 });
    }),
    ...extra,
  );
}

beforeEach(() => {
  requests = [];
  endpointLookups = 0;
  persistTenantId('test-tenant');
  useEndpoint(() => ({ endpoint: LOCAL_ENDPOINT, apiKey: API_KEY }));
  useLocalServer();
});

afterEach(() => setApiErrorHandler(null));

describe('listLocalFiles', () => {
  test('sends the list to the local server with the auth key and the tenant id', async () => {
    /** 一覧はローカル用サーバーへ送り、認証キーとテナント ID を付ける（クラウドのファイル API は呼ばない） */
    await listLocalFiles(FOLDER, { ...FILTER, query: '規程' });

    expect(requests).toHaveLength(1);
    const [list] = requests;
    expect(list.method).toBe('GET');
    expect(list.url).toContain(`${FILES_URL}?`);
    expect(new URL(list.url).searchParams.get('displayName')).toBe('規程');
    expect(list.headers.get('X-Server-Auth-Key')).toBe(API_KEY);
    expect(list.headers.get('X-Tenant-ID')).toBe('test-tenant');
  });
});

describe('addLocalFiles', () => {
  test('sends the files one by one in order with the fields the local server needs', async () => {
    /** 1 件ずつ順に送る。ファイル名・表示名・リンク・チャンクサイズ・更新者・追加のサービス名を付ける */
    const order: string[] = [];
    server.use(
      http.post(FILES_URL, async ({ request }) => {
        const form = await readMultipart(request);
        const name = String(form.get('name'));
        order.push(`start:${name}`);
        if (name === 'a.txt') await new Promise((resolve) => setTimeout(resolve, 30));
        order.push(`end:${name}`);
        requests.push({ method: 'POST', url: request.url, headers: request.headers, form });
        return HttpResponse.json({});
      }),
    );

    await addLocalFiles(
      FOLDER,
      [
        { file: new File(['a'], 'a.txt'), displayName: 'A', reference: 'ref-a', chunkSize: '1000' },
        { file: new File(['b'], 'b.txt'), displayName: 'B' },
      ],
      'user-1',
    );

    expect(order).toEqual(['start:a.txt', 'end:a.txt', 'start:b.txt', 'end:b.txt']);
    const first = requests[0].form!;
    expect(first.get('displayName')).toBe('A');
    expect(first.get('reference')).toBe('ref-a');
    expect(first.get('splitLength')).toBe('1000');
    expect(first.get('userId')).toBe('user-1');
    expect(first.get('creationServiceName')).toBe('svc-add');
    expect(first.get('name')).toBe('a.txt');
    expect(first.has('file')).toBe(true);
    expect(requests[1].form!.has('reference')).toBe(false);
  });
});

describe('updateLocalFile', () => {
  test('changes only the names without a file and sends the service names but no status', async () => {
    /** ファイルが無いときは `file`・`name` を送らず、表示名とリンクだけ変える。学習の ON/OFF は送らない */
    await updateLocalFile(FOLDER, 'f1', { displayName: '新', reference: 'r' }, 'user-1');

    const [patch] = requests;
    expect(patch.method).toBe('PATCH');
    expect(patch.url).toBe(`${FILES_URL}/f1`);
    const form = patch.form!;
    expect(form.get('displayName')).toBe('新');
    expect(form.get('creationServiceName')).toBe('svc-add');
    expect(form.get('deletionServiceName')).toBe('svc-delete');
    expect(form.get('userId')).toBe('user-1');
    expect(form.has('file')).toBe(false);
    expect(form.has('name')).toBe(false);
    expect(form.has('status')).toBe(false);
  });

  test('sends the file and its name when the file is replaced', async () => {
    /** ファイルを差し替えるときは `file` と `name` を送る */
    await updateLocalFile(FOLDER, 'f1', {}, 'user-1', new File(['x'], 'new.txt'));

    const form = requests[0].form!;
    expect(form.has('file')).toBe(true);
    expect(form.get('name')).toBe('new.txt');
  });
});

describe('deleteLocalFiles', () => {
  test('sends one DELETE per file with the service name and the physical delete flag', async () => {
    /** 件数分の DELETE を、削除のサービス名と物理削除を JSON で付けて送る */
    await deleteLocalFiles(FOLDER, ['f1', 'f2', 'f3']);

    expect(requests.map((r) => r.method)).toEqual(['DELETE', 'DELETE', 'DELETE']);
    expect(requests.map((r) => r.url).sort()).toEqual(
      ['f1', 'f2', 'f3'].map((id) => `${FILES_URL}/${id}`),
    );
    expect(requests[0].body).toEqual({ deletionServiceName: 'svc-delete', physicalDelete: true });
  });

  test('still sends the other deletions when one of them fails', async () => {
    /** 1 件が失敗しても、ほかの削除は送られる（呼び出し側が成否を問わず一覧を読み直す） */
    server.use(http.delete(`${FILES_URL}/f2`, () => HttpResponse.json({}, { status: 500 })));

    await expect(deleteLocalFiles(FOLDER, ['f1', 'f2', 'f3'])).rejects.toThrow();
    await vi.waitFor(() =>
      expect(requests.map((r) => r.url).sort()).toEqual([`${FILES_URL}/f1`, `${FILES_URL}/f3`]),
    );
  });
});

describe('syncLocalFolder', () => {
  test('sends the user and the get service name as JSON', async () => {
    /** 同期は更新者と取得のサービス名を JSON で送る */
    await syncLocalFolder(FOLDER, 'user-1');

    const [sync] = requests;
    expect(sync.method).toBe('POST');
    expect(sync.url).toBe(`${LOCAL_ENDPOINT}/api/admin/indexes/i1/sync`);
    expect(sync.body).toEqual({ userId: 'user-1', syncServiceName: 'svc-get' });
  });
});

describe('local server endpoint', () => {
  test.each([['has no endpoint id', { ...FOLDER, localServerEndpointId: undefined }]])(
    'fails without sending anything when the folder %s',
    async (_name, folder) => {
      /** 接続先の ID が無いときは、クラウドにもローカル用サーバーにも送らずに失敗する */
      await expect(listLocalFiles(folder, FILTER)).rejects.toThrow();

      expect(endpointLookups).toBe(0);
      expect(requests).toHaveLength(0);
    },
  );

  test.each([
    ['the url is missing', { endpoint: '', apiKey: API_KEY }],
    ['the api key is missing', { endpoint: LOCAL_ENDPOINT, apiKey: '' }],
    ['the response is empty', {}],
  ])('fails without sending to the local server when %s', async (_name, value) => {
    /** 接続先の URL か API キーが無いときは、ローカル用サーバーへ送らずに失敗する */
    useEndpoint(() => value as { endpoint: string; apiKey: string });

    await expect(listLocalFiles(FOLDER, FILTER)).rejects.toThrow();

    expect(requests).toHaveLength(0);
  });

  test('looks the endpoint up again for every operation', async () => {
    /** 接続先は操作のたびに取り直す（設定を変えた直後に古い値で送らない） */
    let calls = 0;
    useEndpoint(() => {
      calls += 1;
      return { endpoint: `${LOCAL_ENDPOINT}${calls}`, apiKey: API_KEY };
    });
    server.use(
      http.all(`${LOCAL_ENDPOINT}1/*`, async ({ request }) => {
        requests.push(await record(request));
        return HttpResponse.json({ content: [] });
      }),
      http.all(`${LOCAL_ENDPOINT}2/*`, async ({ request }) => {
        requests.push(await record(request));
        return HttpResponse.json({ content: [] });
      }),
    );

    await listLocalFiles(FOLDER, FILTER);
    await listLocalFiles(FOLDER, FILTER);

    expect(requests.map((r) => new URL(r.url).pathname.split('/')[1])).toEqual([
      'secuaigent1',
      'secuaigent2',
    ]);
  });
});

describe('errors from the local server', () => {
  test('does not invalidate the cloud session on 401', async () => {
    /** ローカル用サーバーの 401（API キーの誤りなど）で、クラウドのログインを切らない */
    const handler = vi.fn<(context: ApiErrorContext) => void>();
    setApiErrorHandler(handler);
    server.use(http.get(FILES_URL, () => HttpResponse.json({}, { status: 401 })));

    await expect(listLocalFiles(FOLDER, FILTER)).rejects.toThrow();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].skipSessionInvalidation).toBe(true);
  });
});
