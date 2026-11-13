import { act, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, test } from 'vitest';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { useChatStore } from '@/store/chat-store';
import { useMessagesStore } from '@/store/messages-store';
import { useRoomsStore } from '@/store/rooms-store';
import { server } from '@/test/setup';
import { FIXTURE_TENANT_ADMIN, renderApp, setAuthUser } from '@/test/render-app';

const FIXTURE_CONTENT = {
  id: 'c-m1',
  messageId: 'm1',
  status: 'OK',
  question: '過去の質問',
  answer: '過去の回答',
  context: null,
  attachmentFiles: [],
  referencePaths: null,
  isRated: false,
};

function mockMessages() {
  server.use(
    http.get(mockPath(API_PATHS.MESSAGES.LIST), () =>
      HttpResponse.json({
        assistants: [{ id: 'a1', type: 'SAAS_CHAT', endpoints: [] }],
        messages: [{ id: 'm1', roomId: 'r1', assistantId: 'a1', parentId: null, isRated: false }],
      }),
    ),
    http.post(mockPath(API_PATHS.MESSAGES.CONTENTS), () => HttpResponse.json([FIXTURE_CONTENT])),
  );
}

beforeEach(() => {
  setAuthUser(FIXTURE_TENANT_ADMIN);
  useChatStore.setState({ activeRoomId: null, sharedRoomContext: undefined });
  useMessagesStore.getState().clearMessages();
  useRoomsStore.getState().reset();
});

describe('チャット履歴詳細画面（/admin/chat-history/:roomId）', () => {
  test('メッセージを読み取り専用で表示し、一覧から渡された state の名前を見出しに出すこと', async () => {
    mockMessages();
    const { router } = renderApp('/admin/chat-history');
    await act(() =>
      router.navigate('/admin/chat-history/r1', {
        state: { roomName: '議事録の相談', userName: '田中', userId: 'u1' },
      }),
    );

    expect(await screen.findByText('過去の回答')).toBeInTheDocument();
    // ChatWindow のヘッダーも（hidden クラスで隠れた状態で）描画されるため、先頭が画面側の見出し
    expect(screen.getAllByRole('heading', { name: '議事録の相談' })[0]).toHaveClass('min-w-0');
    expect(screen.queryByTestId('chat-input-textarea')).not.toBeInTheDocument();
    expect(useChatStore.getState().activeRoomId).toBe('r1');
    expect(useChatStore.getState().sharedRoomContext).toMatchObject({
      id: 'r1',
      name: '議事録の相談',
      userId: 'u1',
      userName: '田中',
    });
  });

  test('state がないときの見出しは画面タイトルになること', async () => {
    mockMessages();
    renderApp('/admin/chat-history/r1');

    expect(await screen.findByText('過去の回答')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'CHAT_HISTORY.TITLE' })).toBeInTheDocument();
  });

  test('戻るボタンが一覧へのリンクになっていること', async () => {
    mockMessages();
    renderApp('/admin/chat-history/r1');

    const back = await screen.findByTestId('admin-chat-history-back-button');
    expect(back.closest('a')).toHaveAttribute('href', '/admin/chat-history');
  });

  test('メッセージがないときは空のメッセージを出すこと', async () => {
    server.use(
      http.get(mockPath(API_PATHS.MESSAGES.LIST), () =>
        HttpResponse.json({ assistants: [], messages: [] }),
      ),
    );
    renderApp('/admin/chat-history/r1');

    expect(await screen.findByText('CHAT_HISTORY.DETAIL.EMPTY')).toBeInTheDocument();
  });

  test('403 のときは権限がないメッセージを出すこと', async () => {
    server.use(
      http.get(mockPath(API_PATHS.MESSAGES.LIST), () => new HttpResponse(null, { status: 403 })),
    );
    renderApp('/admin/chat-history/r1');

    expect(await screen.findByText('CHAT_HISTORY.DETAIL.FORBIDDEN')).toBeInTheDocument();
  });

  test('その他の取得失敗のときは読み込み失敗のメッセージを出すこと', async () => {
    server.use(
      http.get(mockPath(API_PATHS.MESSAGES.LIST), () => new HttpResponse(null, { status: 500 })),
    );
    renderApp('/admin/chat-history/r1');

    expect(await screen.findByText('CHAT_HISTORY.DETAIL.LOAD_ERROR')).toBeInTheDocument();
  });

  test('回答があるときだけビューワーの枠が出ること', async () => {
    mockMessages();
    renderApp('/admin/chat-history/r1');

    expect(await screen.findByRole('complementary', { name: 'ビューワー' })).toBeInTheDocument();
  });

  test('画面を離れると文脈と表示中のルームとメッセージを捨てること', async () => {
    mockMessages();
    const { router } = renderApp('/admin/chat-history/r1');
    await screen.findByText('過去の回答');

    await act(() => router.navigate('/admin/chat-history'));

    await waitFor(() => expect(useChatStore.getState().activeRoomId).toBeNull());
    expect(useChatStore.getState().sharedRoomContext).toBeUndefined();
    expect(useMessagesStore.getState().messages).toEqual([]);
  });
});
