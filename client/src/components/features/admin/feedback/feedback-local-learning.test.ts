import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { useToastStore } from '@/components/shared/toast-store';
import { persistTenantId } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { FIXTURE_TENANT_ADMIN, setAuthUser } from '@/test/render-app';
import { server } from '@/test/setup';
import { addIfLocalFolder } from './feedback-local-learning';

const LOCAL_ENDPOINT = 'http://local-server.test/secuaigent';
const API_KEY = 'local-key';
const LOCAL_URL = `${LOCAL_ENDPOINT}/api/admin/indexes/i1/additionalLeaning`;

interface Received {
  headers: Headers;
  /** multipart の項目名と値（ファイルは中身ではなく有無だけ確かめる） */
  fields: Map<string, string>;
}

const PART_PATTERN =
  /name="([^"]+)"(?:; filename="([^"]*)")?\r\n(?:[^\r\n]+\r\n)*\r\n([\s\S]*?)\r\n$/;

/** jsdom の `File` を含む本文は MSW の `formData()` で読めないため、本文を自前で読む */
async function readFields(request: Request): Promise<Map<string, string>> {
  const boundary = /boundary=(.+)$/.exec(request.headers.get('content-type') ?? '')?.[1] ?? '';
  const fields = new Map<string, string>();
  for (const part of (await request.text()).split(`--${boundary}`)) {
    const match = PART_PATTERN.exec(part.replace(/^\r\n/, ''));
    if (match) fields.set(match[1], match[3]);
  }
  return fields;
}

let localRequests: Received[];
let cloudRequests: number;
let detailLookups: number;
let endpointLookups: number;

interface FolderOverrides {
  type?: string;
  endpointId?: string | null;
  endpoint?: { endpoint?: string; apiKey?: string };
}

/** 学習先フォルダの取得（クラウド）と接続先の取得、ローカル用サーバー・クラウドの追加学習を差し替える */
function mockFolder({ type = 'LOCAL', endpointId = 'e1', endpoint }: FolderOverrides = {}) {
  server.use(
    http.get(mockPath(API_PATHS.INDEXES.DETAIL(':id')), ({ params }) => {
      detailLookups += 1;
      return HttpResponse.json({
        id: String(params.id),
        tenantId: 'tenant',
        type,
        name: 'フォルダ',
        description: null,
        add: 'svc-add',
        delete: 'svc-delete',
        get: 'svc-get',
        tenantEndpoints: endpointId ? [{ type: 'LOCAL_SERVER', id: endpointId }] : [],
        groupIds: [],
        createdAt: '2026-11-01T09:00:00',
        updatedAt: '2026-11-01T09:00:00',
      });
    }),
    http.get(mockPath(API_PATHS.LOCAL_SERVER.ENDPOINT(':endpointId')), () => {
      endpointLookups += 1;
      return HttpResponse.json(endpoint ?? { endpoint: LOCAL_ENDPOINT, apiKey: API_KEY });
    }),
    http.post(LOCAL_URL, async ({ request }) => {
      localRequests.push({ headers: request.headers, fields: await readFields(request) });
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(mockPath(API_PATHS.INDEXES.ADDITIONAL_LEARNING(':id')), () => {
      cloudRequests += 1;
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

const CONTENT = new File(['内容'], '追加学習.md', { type: 'text/markdown' });

beforeEach(() => {
  localRequests = [];
  cloudRequests = 0;
  detailLookups = 0;
  endpointLookups = 0;
  persistTenantId('test-tenant');
  setAuthUser(FIXTURE_TENANT_ADMIN);
  useToastStore.getState().clear();
});

afterEach(() => {
  setAuthUser(null);
  useToastStore.getState().clear();
});

describe('addIfLocalFolder', () => {
  test('sends the feedback to the local server only with feedbackId when the folder is LOCAL', async () => {
    /** ローカルのフォルダなら、ローカル用サーバーへ feedbackId だけを（roomId なしで）送り、true を返す */
    mockFolder();

    const handled = await addIfLocalFolder('i1', { feedbackId: 'fb1' }, CONTENT);

    expect(handled).toBe(true);
    expect(localRequests).toHaveLength(1);
    const [received] = localRequests;
    expect(received.headers.get('X-Server-Auth-Key')).toBe(API_KEY);
    expect(received.headers.get('X-Tenant-ID')).toBe('test-tenant');
    expect(received.fields.get('feedbackId')).toBe('fb1');
    expect(received.fields.has('roomId')).toBe(false);
    expect(received.fields.get('userId')).toBe(FIXTURE_TENANT_ADMIN.id);
    expect(received.fields.get('creationServiceName')).toBe('svc-add');
    expect(received.fields.has('content')).toBe(true);
    expect(cloudRequests).toBe(0);
  });

  test('sends the room to the local server only with roomId when the folder is LOCAL', async () => {
    /** 満足度タブの対象は roomId だけを（feedbackId なしで）送る */
    mockFolder();

    await addIfLocalFolder('i1', { roomId: 'room1' }, CONTENT);

    const [received] = localRequests;
    expect(received.fields.get('roomId')).toBe('room1');
    expect(received.fields.has('feedbackId')).toBe(false);
  });

  test('returns false and sends nothing to the local server when the folder is not LOCAL', async () => {
    /** ローカル以外のフォルダは何も送らず false を返す（呼び出し側がクラウドへ送る） */
    mockFolder({ type: 'SAAS_GLOBAL', endpointId: null });

    const handled = await addIfLocalFolder('i1', { feedbackId: 'fb1' }, CONTENT);

    expect(handled).toBe(false);
    expect(localRequests).toHaveLength(0);
    expect(endpointLookups).toBe(0);
  });

  test('looks up the folder and the endpoint on every call', async () => {
    /** フォルダの種類も接続先も持たず都度取る（接続先を変えた直後に古い値を使わないため） */
    mockFolder();

    await addIfLocalFolder('i1', { feedbackId: 'fb1' }, CONTENT);
    await addIfLocalFolder('i1', { feedbackId: 'fb2' }, CONTENT);

    expect(detailLookups).toBe(2);
    expect(endpointLookups).toBe(2);
    expect(localRequests).toHaveLength(2);
  });

  test('fails without sending when the logged-in user id is missing, and shows the error', async () => {
    /** ユーザー ID が取れないときは userId なしで送らず失敗させ、エラーを表示する */
    mockFolder();
    setAuthUser(null);

    await expect(addIfLocalFolder('i1', { feedbackId: 'fb1' }, CONTENT)).rejects.toThrow();

    expect(localRequests).toHaveLength(0);
    expect(cloudRequests).toBe(0);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  test('fails without sending when the folder has no endpoint, and shows the error', async () => {
    /** 接続先が登録されていないときは、クラウドにもローカル用サーバーにも送らず失敗させ、エラーを表示する */
    mockFolder({ endpointId: null });

    await expect(addIfLocalFolder('i1', { feedbackId: 'fb1' }, CONTENT)).rejects.toThrow();

    expect(localRequests).toHaveLength(0);
    expect(cloudRequests).toBe(0);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  test('fails without sending when the endpoint has no API key, and shows the error', async () => {
    /** 接続先の API キーが空のときも、送らず失敗させ、エラーを表示する */
    mockFolder({ endpoint: { endpoint: LOCAL_ENDPOINT } });

    await expect(addIfLocalFolder('i1', { feedbackId: 'fb1' }, CONTENT)).rejects.toThrow();

    expect(localRequests).toHaveLength(0);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  test('rethrows an HTTP error from the local server without adding a second toast', async () => {
    /** ローカル用サーバーの HTTP エラーは共通のエラートースト（api-client）に任せ、ここでは出さない */
    mockFolder();
    server.use(http.post(LOCAL_URL, () => HttpResponse.json({ message: 'ng' }, { status: 500 })));

    await expect(addIfLocalFolder('i1', { feedbackId: 'fb1' }, CONTENT)).rejects.toMatchObject({
      status: 500,
    });

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
