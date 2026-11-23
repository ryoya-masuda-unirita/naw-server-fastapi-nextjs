import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';

/** ローカルの学習先フォルダの接続先（テスト用）。ファイル操作はクラウドではなくこの URL へ送られる */
export const MOCK_LOCAL_SERVER_URL = 'http://local-server.test';

// 既定は空の一覧と、中身のないクラウド接続のフォルダ。テストごとの応答は server.use で上書きする。
// 形は backend の PagedIndexResponse・IndexResponse・PagedFileResponse に合わせる。
export const trainingDataHandlers = [
  // ローカルの学習先フォルダ: 接続先の取得と、ローカル用サーバーの一覧（空）。
  // クラウド側のパスは先頭がワイルドカードでローカル用サーバーの URL にも一致するため、先に置く
  http.get(mockPath(API_PATHS.LOCAL_SERVER.ENDPOINT(':endpointId')), () =>
    HttpResponse.json({ endpoint: MOCK_LOCAL_SERVER_URL, apiKey: 'mock-local-key' }),
  ),
  http.get(`${MOCK_LOCAL_SERVER_URL}/${API_PATHS.LOCAL_SERVER.FILES(':id')}`, () =>
    HttpResponse.json({ content: [], totalElements: 0, number: 0, size: 10 }),
  ),
  http.get(mockPath(API_PATHS.INDEXES.LIST), () =>
    HttpResponse.json({ content: [], totalElements: 0, number: 0, size: 5 }),
  ),
  http.get(mockPath(API_PATHS.INDEXES.DETAIL(':id')), ({ params }) =>
    HttpResponse.json({
      id: String(params.id),
      tenantId: 'tenant',
      type: 'SAAS_GLOBAL',
      name: 'フォルダ',
      description: null,
      add: null,
      delete: null,
      get: null,
      tenantEndpoints: [],
      groupIds: [],
      createdAt: '2026-11-01T09:00:00',
      updatedAt: '2026-11-01T09:00:00',
    }),
  ),
  http.get(mockPath(API_PATHS.INDEXES.FILES(':id')), () =>
    HttpResponse.json({ content: [], totalElements: 0, number: 0, size: 10 }),
  ),
];
