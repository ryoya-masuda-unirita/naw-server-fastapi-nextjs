import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, test } from 'vitest';
import { getLibraryStreamBridge } from '@/lib/chat/library-stream-bridge';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { server } from '@/test/setup';
import { useViewerStore } from './viewer-store';

const FIXTURE_LIST = [
  { id: 'l1', title: '資料1' },
  { id: 'l2', title: '資料2' },
];

function mockList(items: { id: string; title: string | null }[]) {
  server.use(
    http.get(mockPath(API_PATHS.VIEWER.DETAIL_LIST(':roomId')), () =>
      HttpResponse.json({ data: items }),
    ),
  );
}

function mockContent(libraryId: string, title: string, body: string) {
  server.use(
    http.get(mockPath(API_PATHS.LIBRARY.DETAIL(libraryId)), () =>
      HttpResponse.json({ id: libraryId, title, assistant: null }),
    ),
    http.get(mockPath(API_PATHS.VIEWER.CONTENT(libraryId)), () => HttpResponse.json({ data: body })),
  );
}

beforeEach(() => {
  useViewerStore.getState().reset();
});

describe('useViewerStore', () => {
  describe('一覧の読み込み', () => {
    test('一覧を読むと末尾の資料を選び、その本文を表示すること', async () => {
      mockList(FIXTURE_LIST);
      mockContent('l2', '資料2', '# 二つ目');

      await useViewerStore.getState().loadList('r1');

      await expect.poll(() => useViewerStore.getState().markdownContent).toBe('# 二つ目');
      expect(useViewerStore.getState().activeLibrary).toEqual({ id: 'l2', title: '資料2' });
      expect(useViewerStore.getState().hasListLoadedFor('r1')).toBe(true);
    });

    test('autoSelect が false のときは資料を選ばないこと', async () => {
      mockList(FIXTURE_LIST);

      await useViewerStore.getState().loadList('r1', { autoSelect: false });

      expect(useViewerStore.getState().activeLibrary).toBeNull();
      expect(useViewerStore.getState().viewers).toHaveLength(2);
    });

    test('タイトルが null の資料は空文字として扱うこと', async () => {
      mockList([{ id: 'l1', title: null }]);
      mockContent('l1', '', '');

      await useViewerStore.getState().loadList('r1', { autoSelect: false });

      expect(useViewerStore.getState().viewers).toEqual([{ id: 'l1', title: '' }]);
    });

    test('一覧が空なら選択と本文を空にすること', async () => {
      mockList([]);

      await useViewerStore.getState().loadList('r1');

      expect(useViewerStore.getState().activeLibrary).toBeNull();
      expect(useViewerStore.getState().markdownContent).toBe('');
    });

    test('一覧の取得に失敗したらエラー状態になり一覧は空になること', async () => {
      server.use(
        http.get(mockPath(API_PATHS.VIEWER.DETAIL_LIST(':roomId')), () =>
          HttpResponse.json({}, { status: 500 }),
        ),
      );

      await useViewerStore.getState().loadList('r1');

      expect(useViewerStore.getState().listLoadError).toBe(true);
      expect(useViewerStore.getState().viewers).toEqual([]);
    });
  });

  describe('資料の選択', () => {
    test('本文の取得に失敗したら本文エラーになること', async () => {
      server.use(
        http.get(mockPath(API_PATHS.LIBRARY.DETAIL(':libraryId')), () =>
          HttpResponse.json({}, { status: 500 }),
        ),
      );

      useViewerStore.getState().selectLibrary({ id: 'l1', title: '資料1' });

      await expect.poll(() => useViewerStore.getState().contentLoadError).toBe(true);
      expect(useViewerStore.getState().markdownContent).toBe('');
    });

    test('showLibrary は取得した本文のタイトルで一覧と選択を更新すること', async () => {
      mockContent('l9', 'APIのタイトル', '本文');

      await useViewerStore.getState().showLibrary({ id: 'l9', title: '' });

      expect(useViewerStore.getState().viewers).toEqual([{ id: 'l9', title: 'APIのタイトル' }]);
      expect(useViewerStore.getState().activeLibrary?.title).toBe('APIのタイトル');
      expect(useViewerStore.getState().markdownContent).toBe('本文');
    });

    test('SECURE アシスタントのライブラリはローカルサーバーから本文を取ること', async () => {
      server.use(
        http.get(mockPath(API_PATHS.LIBRARY.DETAIL(':libraryId')), () =>
          HttpResponse.json({
            id: 'l1',
            title: 'ローカル資料',
            assistant: {
              id: 'a1',
              type: 'SECURE',
              endpoints: [
                {
                  id: 'e1',
                  type: 'LOCAL_SERVER',
                  destination: 'http://local.test/',
                  apiKey: 'key-1',
                },
              ],
            },
          }),
        ),
        http.get('http://local.test/api/libraries/l1/content', ({ request }) =>
          HttpResponse.json({
            data: `ローカル本文:${request.headers.get('X-Server-Auth-Key')}`,
          }),
        ),
      );

      await useViewerStore.getState().showLibrary({ id: 'l1', title: '' });

      expect(useViewerStore.getState().markdownContent).toBe('ローカル本文:key-1');
    });

    test('updateLibraryTitle は一覧と選択中の資料のタイトルを更新すること', async () => {
      mockList(FIXTURE_LIST);
      await useViewerStore.getState().loadList('r1', { autoSelect: false });
      useViewerStore.setState({ activeLibrary: FIXTURE_LIST[0] });

      useViewerStore.getState().updateLibraryTitle('l1', '新しい名前');

      expect(useViewerStore.getState().viewers[0].title).toBe('新しい名前');
      expect(useViewerStore.getState().activeLibrary?.title).toBe('新しい名前');
    });
  });

  describe('ライブラリ生成のストリーミング', () => {
    test('messages-store から使う窓口に登録されていること', () => {
      expect(getLibraryStreamBridge()).not.toBeNull();
    });

    test('途中経過を本文とタイトルに足し、終了で一覧を読み直して同じタイトルの資料を選ぶこと', async () => {
      const store = useViewerStore.getState();
      mockList([{ id: 'l1', title: '生成した資料' }]);
      mockContent('l1', '生成した資料', 'サーバーの本文');

      const token = store.beginLibraryStream('r1');
      store.appendLibraryTitleDelta(token, '生成した');
      store.appendLibraryTitleDelta(token, '資料\n');
      store.appendLibraryContentDelta(token, '# 見出し');
      expect(useViewerStore.getState().isLibraryStreaming).toBe(true);
      expect(useViewerStore.getState().markdownContent).toBe('# 見出し');

      await store.endLibraryStream(token, 'r1');

      expect(useViewerStore.getState().isLibraryStreaming).toBe(false);
      expect(useViewerStore.getState().activeLibrary).toEqual({ id: 'l1', title: '生成した資料' });
      // ストリーム済みの本文は自動選択で上書きしない
      expect(useViewerStore.getState().markdownContent).toBe('# 見出し');
    });

    test('古いトークンの途中経過は無視すること', () => {
      const store = useViewerStore.getState();
      const oldToken = store.beginLibraryStream('r1');
      store.beginLibraryStream('r1');

      store.appendLibraryContentDelta(oldToken, '古い');

      expect(useViewerStore.getState().markdownContent).toBe('');
    });

    test('生成中に別の資料を選ぶとストリームの表示を手放すこと', () => {
      const store = useViewerStore.getState();
      const token = store.beginLibraryStream('r1');
      mockContent('l1', '資料1', '本文');

      store.selectLibrary({ id: 'l1', title: '資料1' });
      store.appendLibraryContentDelta(token, '無視される');

      expect(useViewerStore.getState().isLibraryStreaming).toBe(false);
      expect(useViewerStore.getState().markdownContent).not.toContain('無視される');
    });

    test('失敗したらストリームを手放し、選択中の資料の本文に戻すこと', async () => {
      useViewerStore.setState({ activeLibrary: { id: 'l1', title: '資料1' } });
      mockContent('l1', '資料1', 'サーバーの本文');
      const store = useViewerStore.getState();
      const token = store.beginLibraryStream('r1');
      store.appendLibraryContentDelta(token, '途中');

      await store.abortLibraryStream(token);

      expect(useViewerStore.getState().isLibraryStreaming).toBe(false);
      expect(useViewerStore.getState().markdownContent).toBe('サーバーの本文');
    });
  });
});
