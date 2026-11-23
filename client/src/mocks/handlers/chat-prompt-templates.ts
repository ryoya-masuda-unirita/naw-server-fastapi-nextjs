import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';

// チャットの入力欄の「テンプレート」が読む一覧（GET /api/prompt-templates）の既定の応答。空。
// テストごとの応答は server.use で上書きする。
export const chatPromptTemplatesHandlers = [
  http.get(mockPath(API_PATHS.PROMPT_TEMPLATES.LIST), () => HttpResponse.json({ content: [] })),
];
