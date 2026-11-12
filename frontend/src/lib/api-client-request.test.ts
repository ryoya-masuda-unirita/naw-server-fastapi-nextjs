import { afterEach, describe, expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';
import {
  ApiError,
  apiClient,
  persistTenantId,
  setApiErrorHandler,
  type ApiErrorContext,
} from './api-client';

// URL 組み立て（ベースURL）は api-client.test.ts、テナントIDは api-client-tenant.test.ts で確認している。
// ここでは #279 で足したメソッド・クエリ・本文・応答の読み方・エラー処理を確認する。

interface CapturedRequest {
  method: string;
  url: URL;
  contentType: string | null;
  tenantId: string | null;
  body: string | FormData | null;
}

const FIXTURE_TENANT_ID = 'tenant-a';
const LOCAL_SERVER_URL = 'http://local-server.example:9000/api/libraries/1';

function capture(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) {
  const captured: { request: CapturedRequest | null } = { request: null };
  server.use(
    http[method](`*${path}`, async ({ request }) => {
      const contentType = request.headers.get('Content-Type');
      let body: string | FormData | null = null;
      if (contentType?.startsWith('multipart/form-data')) {
        body = await request.formData();
      } else {
        const text = await request.text();
        body = text || null;
      }
      captured.request = {
        method: request.method,
        url: new URL(request.url),
        contentType,
        tenantId: request.headers.get('X-Tenant-ID'),
        body,
      };
      return HttpResponse.json({ ok: true });
    })
  );
  return captured;
}

describe('apiClient のリクエスト', () => {
  afterEach(() => {
    setApiErrorHandler(null);
  });

  describe('メソッド', () => {
    test.each([
      ['put', () => apiClient.put('/api/items/1', { name: 'a' })],
      ['patch', () => apiClient.patch('/api/items/1', { name: 'a' })],
    ] as const)('%s で JSON の本文を送れること', async (method, call) => {
      const captured = capture(method, '/api/items/1');

      await call();

      expect(captured.request?.method).toBe(method.toUpperCase());
      expect(captured.request?.contentType).toBe('application/json');
      expect(captured.request?.body).toBe(JSON.stringify({ name: 'a' }));
    });

    test('DELETE で本文（一括削除の ID など）を送れること', async () => {
      const captured = capture('delete', '/api/admin/library-tags');

      await apiClient.delete('/api/admin/library-tags', { body: { ids: ['1', '2'] } });

      expect(captured.request?.method).toBe('DELETE');
      expect(captured.request?.body).toBe(JSON.stringify({ ids: ['1', '2'] }));
    });

    test('すべてのメソッドに X-Tenant-ID が付くこと', async () => {
      persistTenantId(FIXTURE_TENANT_ID);
      const captured = capture('delete', '/api/items/1');

      await apiClient.delete('/api/items/1');

      expect(captured.request?.tenantId).toBe(FIXTURE_TENANT_ID);
    });
  });

  describe('クエリ', () => {
    test('配列は同じキーを繰り返して送り、undefined・null は送らないこと', async () => {
      const captured = capture('get', '/api/libraries');

      await apiClient.get('/api/libraries', {
        params: { page: 0, tagIds: ['t1', 't2'], title: undefined, createdBy: null, mine: false },
      });

      const params = captured.request?.url.searchParams;
      expect(params?.getAll('tagIds')).toEqual(['t1', 't2']);
      expect(params?.get('page')).toBe('0');
      expect(params?.get('mine')).toBe('false');
      expect(params?.has('title')).toBe(false);
      expect(params?.has('createdBy')).toBe(false);
    });
  });

  describe('本文', () => {
    test('FormData は JSON にせず multipart で送ること', async () => {
      const captured = capture('post', '/api/admin/indexes/1/files');
      const formData = new FormData();
      formData.append('feedbackId', 'f1');

      await apiClient.post('/api/admin/indexes/1/files', formData);

      expect(captured.request?.contentType).toMatch(/^multipart\/form-data/);
      expect((captured.request?.body as FormData).get('feedbackId')).toBe('f1');
    });

    test('本文が null なら Content-Type を付けず本文も送らないこと', async () => {
      const captured = capture('post', '/api/items/1/sync');

      await apiClient.post('/api/items/1/sync', null);

      expect(captured.request?.contentType).toBeNull();
      expect(captured.request?.body).toBeNull();
    });
  });

  describe('応答の読み方', () => {
    test('responseType が text なら本文を文字列で返すこと', async () => {
      server.use(http.post('*/auth/logout', () => HttpResponse.text('Logout successful.')));

      const res = await apiClient.post<string>('/auth/logout', null, { responseType: 'text' });

      expect(res).toBe('Logout successful.');
    });

    test('responseType が blob ならファイルとして返すこと', async () => {
      server.use(
        http.get('*/api/admin/indexes/1/files/2', () =>
          HttpResponse.text('file-body', { headers: { 'Content-Type': 'application/pdf' } })
        )
      );

      const res = await apiClient.get<Blob>('/api/admin/indexes/1/files/2', {
        responseType: 'blob',
      });

      expect(res).toBeInstanceOf(Blob);
      expect(await res.text()).toBe('file-body');
    });

    test('204（本文なし）なら null を返すこと', async () => {
      server.use(http.delete('*/api/rooms/1', () => new HttpResponse(null, { status: 204 })));

      const res = await apiClient.delete('/api/rooms/1');

      expect(res).toBeNull();
    });
  });

  describe('エラー', () => {
    test('エラー応答なら status と本文を持つ ApiError を投げること', async () => {
      server.use(
        http.get('*/api/rooms', () => HttpResponse.json({ message: 'not found' }, { status: 404 }))
      );

      const error = await apiClient.get('/api/rooms').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 404,
        body: { message: 'not found' },
        method: 'GET',
        path: '/api/rooms',
        message: 'HTTP 404',
      });
    });

    test('登録したエラーハンドラーに、トースト・セッション破棄を抑止するかが渡ること', async () => {
      const handler = vi.fn<(context: ApiErrorContext) => void>();
      setApiErrorHandler(handler);
      server.use(http.patch('*/api/admin/users/u1', () => HttpResponse.json({}, { status: 400 })));

      await apiClient
        .patch('/api/admin/users/u1', { name: 'a' }, { skipGlobalErrorToast: true })
        .catch(() => undefined);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toMatchObject({
        skipGlobalErrorToast: true,
        skipSessionInvalidation: false,
      });
      expect(handler.mock.calls[0][0].error.status).toBe(400);
    });

    test('呼び出し側が中断したら、通信エラーにせず元の理由のまま投げること', async () => {
      const handler = vi.fn<(context: ApiErrorContext) => void>();
      setApiErrorHandler(handler);
      server.use(http.get('*/api/rooms', () => HttpResponse.json({})));
      const controller = new AbortController();
      controller.abort(new Error('cancelled'));

      const error = await apiClient
        .get('/api/rooms', { signal: controller.signal })
        .catch((e: unknown) => e);

      expect(error).not.toBeInstanceOf(ApiError);
      expect(handler).not.toHaveBeenCalled();
    });

    test('通信自体に失敗したら status 0 の ApiError を投げること', async () => {
      const handler = vi.fn<(context: ApiErrorContext) => void>();
      setApiErrorHandler(handler);
      server.use(http.get('*/api/rooms', () => HttpResponse.error()));

      const error = await apiClient.get('/api/rooms').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(0);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('絶対URL（ローカルサーバ）', () => {
    test('ベースURLを付けずにそのまま送り、401 でもセッションを破棄しない扱いになること', async () => {
      const handler = vi.fn<(context: ApiErrorContext) => void>();
      setApiErrorHandler(handler);
      let requestedUrl = '';
      server.use(
        http.get(LOCAL_SERVER_URL, ({ request }) => {
          requestedUrl = request.url;
          return HttpResponse.json({}, { status: 401 });
        })
      );

      await apiClient
        .get(LOCAL_SERVER_URL, { headers: { 'X-Server-Auth-Key': 'key' } })
        .catch(() => undefined);

      expect(requestedUrl).toBe(LOCAL_SERVER_URL);
      expect(handler.mock.calls[0][0].skipSessionInvalidation).toBe(true);
    });
  });

  describe('stream（SSE 用）', () => {
    test('Response をそのまま返し、Accept などのヘッダーと FormData を送れること', async () => {
      let accept: string | null = null;
      server.use(
        http.post('*/api/messages/content', ({ request }) => {
          accept = request.headers.get('Accept');
          return new HttpResponse('data: {"type":"text_delta"}\n\n', {
            headers: { 'Content-Type': 'text/event-stream' },
          });
        })
      );

      const res = await apiClient.stream('/api/messages/content', {
        body: new FormData(),
        headers: { Accept: 'text/event-stream' },
      });

      expect(accept).toBe('text/event-stream');
      expect(await res.text()).toBe('data: {"type":"text_delta"}\n\n');
    });

    test('エラー応答なら ApiError を投げるが、共通のエラーハンドラーは呼ばないこと', async () => {
      const handler = vi.fn<(context: ApiErrorContext) => void>();
      setApiErrorHandler(handler);
      server.use(http.post('*/api/messages/content', () => HttpResponse.json({}, { status: 401 })));

      const error = await apiClient.stream('/api/messages/content').catch((e: unknown) => e);

      expect((error as ApiError).status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
