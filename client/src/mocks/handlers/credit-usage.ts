import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';

// 自分のクレジット利用量の既定の応答（クレジット確認ダイアログが開いたときに取りに行く）。
// ワークスペース分は admin-tenant.ts に既定の応答があるので、ここには入れない。
export const creditUsageHandlers = [
  http.get(mockPath(API_PATHS.CREDIT_USAGE.ME), () => HttpResponse.json({})),
];
