import { afterEach, describe, expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';

// API_BASE_URL はモジュール読み込み時に決まるため、環境変数を差し替えてから読み込み直す
const loadApiClient = async (baseUrl: string) => {
  vi.stubEnv('VITE_API_URL', baseUrl);
  vi.resetModules();
  const { apiClient } = await import('./api-client');
  return apiClient;
};

describe('apiClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('ベースURLが空（本番ビルド: CloudFront 配下の相対パス）', () => {
    test('GET が配信元と同じオリジンにクエリ付きで送られること', async () => {
      let requestedUrl = '';
      server.use(
        http.get(`${window.location.origin}/api/items`, ({ request }) => {
          requestedUrl = request.url;
          return HttpResponse.json({ ok: true });
        })
      );
      const apiClient = await loadApiClient('');

      const res = await apiClient.get<{ ok: boolean }>('/api/items', {
        params: { page: 1 },
      });

      expect(res).toEqual({ ok: true });
      expect(requestedUrl).toBe(`${window.location.origin}/api/items?page=1`);
    });

    test('POST が配信元と同じオリジンに送られること', async () => {
      let requestedUrl = '';
      server.use(
        http.post(`${window.location.origin}/auth/logout`, ({ request }) => {
          requestedUrl = request.url;
          return HttpResponse.json({});
        })
      );
      const apiClient = await loadApiClient('');

      await apiClient.post('/auth/logout', null);

      expect(requestedUrl).toBe(`${window.location.origin}/auth/logout`);
    });
  });

  describe('ベースURLが絶対URL（ローカル開発）', () => {
    test('GET が指定したベースURLに送られること', async () => {
      let requestedUrl = '';
      server.use(
        http.get('http://localhost:8000/api/auth', ({ request }) => {
          requestedUrl = request.url;
          return HttpResponse.json({ ok: true });
        })
      );
      const apiClient = await loadApiClient('http://localhost:8000');

      await apiClient.get('/api/auth');

      expect(requestedUrl).toBe('http://localhost:8000/api/auth');
    });
  });
});
