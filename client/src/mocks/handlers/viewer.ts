import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';

// ビューワー（ライブラリ一覧・詳細・本文）の既定の応答。形は backend の LibraryListItemResponse・LibraryGetResponse・
// LibraryContentResponse に合わせる。チャット画面が開くと一覧を読むため、既定は空の一覧。
// テストごとの応答は server.use で上書きする。
export const viewerHandlers = [
  http.get(mockPath(API_PATHS.VIEWER.DETAIL_LIST(':roomId')), () => HttpResponse.json({ data: [] })),
  http.get(mockPath(API_PATHS.LIBRARY.DETAIL(':libraryId')), ({ params }) =>
    HttpResponse.json({
      id: params.libraryId,
      title: 'ライブラリ',
      messageId: 'm1',
      userId: 'u1',
      assistant: null,
      hasNawContent: true,
    }),
  ),
  http.get(mockPath(API_PATHS.VIEWER.CONTENT(':libraryId')), () =>
    HttpResponse.json({ data: '# 本文' }),
  ),
];
