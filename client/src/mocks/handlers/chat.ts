import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';

// チャット画面（新規チャット・ルーム）が開いたときに呼ぶ API の既定の応答。いずれも空。
// 形は backend の実際の応答に合わせる（ルーム一覧は Page 形式、メッセージ一覧は { assistants, messages }）。
// テストごとの応答は server.use で上書きする。
export const chatHandlers = [
  http.get(mockPath(API_PATHS.ASSISTANTS.LIST), () => HttpResponse.json([])),
  http.get(mockPath(API_PATHS.ROOMS.LIST), () =>
    HttpResponse.json({ content: [], totalElements: 0, number: 0, size: 20 }),
  ),
  http.get(mockPath(API_PATHS.MESSAGES.LIST), () =>
    HttpResponse.json({ assistants: [], messages: [] }),
  ),
];
