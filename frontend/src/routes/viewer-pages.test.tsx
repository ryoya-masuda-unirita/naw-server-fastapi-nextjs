import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, test } from 'vitest';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { useChatStore } from '@/store/chat-store';
import { useMessagesStore } from '@/store/messages-store';
import { useRoomsStore } from '@/store/rooms-store';
import { useViewerStore } from '@/store/viewer-store';
import { server } from '@/test/setup';
import { FIXTURE_GENERAL_USER, renderApp, setAuthUser } from '@/test/render-app';

const PAGE_TIMEOUT = { timeout: 5000 };

function mockLibrary(libraryId: string, title: string, body: string) {
  server.use(
    http.get(mockPath(API_PATHS.LIBRARY.DETAIL(libraryId)), () =>
      HttpResponse.json({ id: libraryId, title, assistant: null }),
    ),
    http.get(mockPath(API_PATHS.VIEWER.CONTENT(libraryId)), () => HttpResponse.json({ data: body })),
  );
}

function mockMessages(answer: string) {
  server.use(
    http.get(mockPath(API_PATHS.MESSAGES.LIST), () =>
      HttpResponse.json({
        assistants: [{ id: 'a1', type: 'SAAS_CHAT', endpoints: [] }],
        messages: [{ id: 'm1', roomId: 'r1', assistantId: 'a1', parentId: null, isRated: false }],
      }),
    ),
    http.post(mockPath(API_PATHS.MESSAGES.CONTENTS), () =>
      HttpResponse.json([
        {
          id: 'c1',
          messageId: 'm1',
          status: 'OK',
          question: '質問です',
          answer,
          context: null,
          attachmentFiles: [],
          referencePaths: null,
          isRated: false,
        },
      ]),
    ),
  );
}

beforeEach(() => {
  setAuthUser(FIXTURE_GENERAL_USER);
  useViewerStore.getState().reset();
  useChatStore.setState({ activeRoomId: null, sharedRoomContext: undefined });
  useMessagesStore.getState().clearMessages();
  useRoomsStore.getState().reset();
});

describe('ビューワー画面（/chat/viewer/:chatId）', () => {
  test('一覧の末尾の資料を選んで本文を表示し、折りたたみボタンは出さないこと', async () => {
    server.use(
      http.get(mockPath(API_PATHS.VIEWER.DETAIL_LIST(':roomId')), () =>
        HttpResponse.json({
          data: [
            { id: 'l1', title: '資料1' },
            { id: 'l2', title: '資料2' },
          ],
        }),
      ),
    );
    mockLibrary('l2', '資料2', '# 二つ目の本文');

    renderApp('/chat/viewer/r1');

    expect(await screen.findByRole('heading', { name: '二つ目の本文' }, PAGE_TIMEOUT)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'CHAT.VIEWER.CLOSE' })).not.toBeInTheDocument();
  });

  test('libraryId があるときは、その資料を選んで表示すること', async () => {
    server.use(
      http.get(mockPath(API_PATHS.VIEWER.DETAIL_LIST(':roomId')), () =>
        HttpResponse.json({
          data: [
            { id: 'l1', title: '資料1' },
            { id: 'l2', title: '資料2' },
          ],
        }),
      ),
    );
    mockLibrary('l1', '資料1', '# 一つ目の本文');

    renderApp('/chat/viewer/r1?libraryId=l1');

    expect(await screen.findByRole('heading', { name: '一つ目の本文' }, PAGE_TIMEOUT)).toBeInTheDocument();
    expect(useViewerStore.getState().activeLibrary?.id).toBe('l1');
  });

  test('libraryId が一覧になければ、その資料だけを直接取得して表示すること', async () => {
    mockLibrary('l9', '別ルームの資料', '# 直接取得');

    renderApp('/chat/viewer/r1?libraryId=l9');

    expect(await screen.findByRole('heading', { name: '直接取得' }, PAGE_TIMEOUT)).toBeInTheDocument();
    expect(useViewerStore.getState().viewers).toEqual([{ id: 'l9', title: '別ルームの資料' }]);
  });
});

describe('ライブラリ詳細画面（/library/:id）', () => {
  test('ライブラリの本文とタイトルを表示すること', async () => {
    mockLibrary('l1', '詳細の資料', '# 詳細の本文');

    renderApp('/library/l1');

    expect(await screen.findByRole('heading', { name: '詳細の本文' }, PAGE_TIMEOUT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CHAT.VIEWER.CHANGE_DOC' })).toHaveTextContent(
      '詳細の資料',
    );
    expect(screen.queryByRole('button', { name: 'CHAT.VIEWER.CLOSE' })).not.toBeInTheDocument();
  });
});

describe('共有閲覧画面（/chat/share/:shareId）', () => {
  test('共有情報が取れたら、共有ルームの会話を閲覧専用で表示すること', async () => {
    server.use(
      http.get(mockPath(API_PATHS.SHARES.ACCESS(':shareId')), () =>
        HttpResponse.json({
          data: { roomId: 'r1', roomName: '共有された部屋', isReadOnly: true, teamIds: [] },
        }),
      ),
    );
    mockMessages('共有された回答');

    renderApp('/chat/share/s1');

    expect(await screen.findByText('共有された回答', {}, PAGE_TIMEOUT)).toBeInTheDocument();
    expect(screen.getByText('共有された部屋')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-input-textarea')).not.toBeInTheDocument();
    expect(useChatStore.getState().activeRoomId).toBe('r1');
  });

  test('共有情報が取れなければ、閲覧できない旨と戻るリンクを出すこと', async () => {
    server.use(
      http.get(mockPath(API_PATHS.SHARES.ACCESS(':shareId')), () =>
        HttpResponse.json({}, { status: 403 }),
      ),
    );

    renderApp('/chat/share/s1');

    expect(await screen.findByText('CHAT.SHARED.NO_ACCESS', {}, PAGE_TIMEOUT)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /COMMON\.BACK/ })).toHaveAttribute('href', '/chat/new');
  });

  test('画面を離れると共有ルームの文脈を消すこと', async () => {
    server.use(
      http.get(mockPath(API_PATHS.SHARES.ACCESS(':shareId')), () =>
        HttpResponse.json({
          data: { roomId: 'r1', roomName: '共有された部屋', isReadOnly: true, teamIds: [] },
        }),
      ),
    );
    mockMessages('共有された回答');
    const { unmount } = renderApp('/chat/share/s1');
    await waitFor(() => expect(useChatStore.getState().sharedRoomContext?.id).toBe('r1'));

    unmount();

    expect(useChatStore.getState().sharedRoomContext).toBeUndefined();
  });
});

describe('共有履歴・フィードバックプレビュー', () => {
  test.each(['/chat-shared-history/r1', '/feedback-preview/r1'])(
    '%s でルームの会話を閲覧専用で表示すること',
    async (path) => {
      setAuthUser({ ...FIXTURE_GENERAL_USER, role: 'ADMIN' });
      server.use(
        http.get(mockPath(API_PATHS.ROOMS.LIST), () =>
          HttpResponse.json({
            content: [
              {
                id: 'r1',
                name: '履歴の部屋',
                pinned: false,
                createdAt: '2026-11-13T00:00:00Z',
                updatedAt: '2026-11-13T00:00:00Z',
                tenantId: 't1',
                userId: 'u1',
                defaultAssistantId: 'a1',
              },
            ],
            totalElements: 1,
            number: 0,
            size: 20,
          }),
        ),
      );
      mockMessages('履歴の回答');

      renderApp(path);

      expect(await screen.findByText('履歴の回答', {}, PAGE_TIMEOUT)).toBeInTheDocument();
      expect(screen.queryByTestId('chat-input-textarea')).not.toBeInTheDocument();
      expect(useChatStore.getState().activeRoomId).toBe('r1');
    },
  );
});

describe('チャットルーム画面のビューワー（/chat/:roomId）', () => {
  test('回答がなくても、このルームのライブラリを生成中ならビューワーの枠を出すこと', async () => {
    server.use(
      http.get(mockPath(API_PATHS.ROOMS.LIST), () =>
        HttpResponse.json({
          content: [
            {
              id: 'r1',
              name: '生成中の部屋',
              pinned: false,
              createdAt: '2026-11-13T00:00:00Z',
              updatedAt: '2026-11-13T00:00:00Z',
              tenantId: 't1',
              userId: 'u1',
              defaultAssistantId: 'a1',
            },
          ],
          totalElements: 1,
          number: 0,
          size: 20,
        }),
      ),
    );
    const { unmount } = renderApp('/chat/r1');
    expect(await screen.findByText('CHAT.EMPTY.TITLE', {}, PAGE_TIMEOUT)).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'ビューワー' })).not.toBeInTheDocument();
    unmount();

    useViewerStore.getState().beginLibraryStream('r1');
    renderApp('/chat/r1');

    expect(
      await screen.findByRole('complementary', { name: 'ビューワー' }, PAGE_TIMEOUT),
    ).toBeInTheDocument();
  });
});
