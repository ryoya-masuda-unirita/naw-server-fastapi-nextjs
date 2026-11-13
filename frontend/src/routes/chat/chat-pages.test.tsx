import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, test } from 'vitest';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { useChatStore } from '@/store/chat-store';
import { useMessagesStore } from '@/store/messages-store';
import { useRoomsStore } from '@/store/rooms-store';
import { server } from '@/test/setup';
import { FIXTURE_GENERAL_USER, renderApp, setAuthUser } from '@/test/render-app';

const FIXTURE_ASSISTANT = {
  id: 'a1',
  tenantId: 't1',
  type: 'SAAS_CHAT',
  endpoints: [{ id: 'e1', label: null, url: 'https://x', model: 'gpt', type: 'AZURE_OPENAI_CHAT' }],
  name: '一般アシスタント',
  indexId: null,
  category: null,
  groups: [],
  description: '一般的な質問に答えます',
  includeHistory: false,
  iconColor: '#000',
  isDefault: true,
};

function buildApiRoom(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `部屋-${id}`,
    pinned: false,
    createdAt: '2026-11-13T00:00:00Z',
    updatedAt: '2026-11-13T00:00:00Z',
    tenantId: 't1',
    userId: 'u1',
    rating: null,
    shareUrl: null,
    defaultAssistantId: 'a1',
    ...overrides,
  };
}

function sse(events: unknown[]): Response {
  const body = events.map((e) => `data:${JSON.stringify(e)}\n\n`).join('');
  return new HttpResponse(body, { headers: { 'Content-Type': 'text/event-stream' } });
}

function buildContent(messageId: string, answer: string) {
  return {
    id: `c-${messageId}`,
    messageId,
    status: 'OK',
    question: '',
    answer,
    context: null,
    attachmentFiles: [],
    referencePaths: null,
    isRated: false,
  };
}

beforeEach(() => {
  setAuthUser(FIXTURE_GENERAL_USER);
  useChatStore.setState({ activeRoomId: null });
  useMessagesStore.getState().clearMessages();
  useRoomsStore.getState().reset();
  server.use(http.get(mockPath(API_PATHS.ASSISTANTS.LIST), () => HttpResponse.json([FIXTURE_ASSISTANT])));
});

describe('新規チャット画面（/dashboard・/chat/new）', () => {
  test.each(['/dashboard', '/chat/new'])('%s で空の状態（ロゴと入力欄）が出ること', async (path) => {
    renderApp(path);

    // 初回は画面の遅延読み込みがあるので、待ち時間を長めにする
    expect(await screen.findByText('CHAT.EMPTY.SUBTITLE', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByTestId('chat-input-textarea')).toBeInTheDocument();
  });

  test('ルームを開いたあとで新規チャットへ移ると、メッセージと表示中のルームが空になること', async () => {
    useChatStore.setState({ activeRoomId: 'old' });
    useMessagesStore.setState({
      messages: [
        { id: 'c1', messageId: 'm1', role: 'user', status: 'OK', question: '前の質問', answer: '', context: '', isRated: false },
      ],
    });

    renderApp('/chat/new');

    await waitFor(() => expect(useChatStore.getState().activeRoomId).toBeNull());
    expect(useMessagesStore.getState().messages).toEqual([]);
  });

  test('最初のメッセージを送ると、ルームを作ってそのルームの画面で送信され回答が出ること', async () => {
    let createRoomBody: Record<string, unknown> | null = null;
    server.use(
      http.post(mockPath(API_PATHS.ROOMS.CREATE), async ({ request }) => {
        createRoomBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(buildApiRoom('r-new', { name: FIXTURE_ASSISTANT.name }));
      }),
      http.get(mockPath(API_PATHS.ROOMS.LIST), () =>
        HttpResponse.json({ content: [buildApiRoom('r-new')], totalElements: 1, number: 0, size: 20 }),
      ),
      http.patch(mockPath(API_PATHS.ROOMS.RENAME(':roomId')), () => HttpResponse.json(buildApiRoom('r-new'))),
      http.post(mockPath(API_PATHS.MESSAGES.CREATE), () => HttpResponse.text('m-new')),
      http.post(mockPath(API_PATHS.MESSAGES.CONTENT), () =>
        sse([{ type: 'message_content', data: buildContent('m-new', 'こちらが回答です') }]),
      ),
    );
    const { router } = renderApp('/chat/new');
    const user = userEvent.setup();

    const textarea = await screen.findByTestId('chat-input-textarea');
    await user.type(textarea, 'はじめまして');
    // 初期アシスタントが決まって送れるようになるのを待つ
    await waitFor(() => expect(screen.getByTestId('chat-send-button')).toBeEnabled());
    await user.click(screen.getByTestId('chat-send-button'));

    expect(await screen.findByText('こちらが回答です')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/chat/r-new');
    expect(createRoomBody).toMatchObject({ assistantId: 'a1' });
    expect(screen.getByText('はじめまして')).toBeInTheDocument();
    expect(useChatStore.getState().activeRoomId).toBe('r-new');
  });
});

describe('チャットルーム画面（/chat/:roomId）', () => {
  function mockRoomWithHistory() {
    server.use(
      http.get(mockPath(API_PATHS.ROOMS.LIST), () =>
        HttpResponse.json({
          content: [buildApiRoom('r1', { name: '議事録の相談' })],
          totalElements: 1,
          number: 0,
          size: 20,
        }),
      ),
      http.get(mockPath(API_PATHS.MESSAGES.LIST), () =>
        HttpResponse.json({
          assistants: [{ id: 'a1', type: 'SAAS_CHAT', endpoints: [] }],
          messages: [{ id: 'm1', roomId: 'r1', assistantId: 'a1', parentId: null, isRated: false }],
        }),
      ),
      http.post(mockPath(API_PATHS.MESSAGES.CONTENTS), () =>
        HttpResponse.json([{ ...buildContent('m1', '過去の回答'), question: '過去の質問' }]),
      ),
    );
  }

  test('ルームのメッセージを読み込んで表示し、ヘッダーにルーム名を出すこと', async () => {
    mockRoomWithHistory();
    renderApp('/chat/r1');

    expect(await screen.findByText('過去の質問')).toBeInTheDocument();
    expect(screen.getByText('過去の回答')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '議事録の相談' })).toBeInTheDocument();
    expect(useChatStore.getState().activeRoomId).toBe('r1');
  });

  test('回答があるときはビューワーの枠が右に出ること', async () => {
    mockRoomWithHistory();
    renderApp('/chat/r1');

    expect(await screen.findByRole('complementary', { name: 'ビューワー' })).toBeInTheDocument();
  });

  test('メッセージがないルームではロゴと説明を出し、ビューワーの枠は出さないこと', async () => {
    server.use(
      http.get(mockPath(API_PATHS.ROOMS.LIST), () =>
        HttpResponse.json({ content: [buildApiRoom('r1')], totalElements: 1, number: 0, size: 20 }),
      ),
    );
    renderApp('/chat/r1');

    expect(await screen.findByText('CHAT.EMPTY.TITLE')).toBeInTheDocument();
    // 同じ説明がアシスタント選択の一覧（閉じている）にもあるため、一覧の外にあるものを見る
    const descriptions = await screen.findAllByText('一般的な質問に答えます');
    expect(descriptions.some((element) => !element.closest('[role="listbox"]'))).toBe(true);
    expect(screen.queryByRole('complementary', { name: 'ビューワー' })).not.toBeInTheDocument();
  });

  test('読み込み中はローディングを出すこと', async () => {
    server.use(
      http.get(mockPath(API_PATHS.MESSAGES.LIST), async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({ assistants: [], messages: [] });
      }),
    );
    renderApp('/chat/r1');

    expect(await screen.findByText('CHAT.LOADING')).toBeInTheDocument();
    expect(await screen.findByTestId('chat-input-textarea')).toBeInTheDocument();
  });

  test('ルーム名の変更で名前が更新されること', async () => {
    mockRoomWithHistory();
    let renamed: unknown = null;
    server.use(
      http.patch(mockPath(API_PATHS.ROOMS.RENAME(':roomId')), async ({ request }) => {
        renamed = await request.json();
        return HttpResponse.json(buildApiRoom('r1', { name: '新しい名前' }));
      }),
    );
    renderApp('/chat/r1');
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: '議事録の相談' });
    await user.click(screen.getAllByRole('button', { name: 'HEADER.RENAME' })[0]);
    const input = screen.getByDisplayValue('議事録の相談');
    await user.clear(input);
    await user.type(input, '新しい名前');
    await user.click(screen.getByRole('button', { name: 'COMMON.SAVE' }));

    await waitFor(() => expect(renamed).toEqual({ name: '新しい名前' }));
    expect(await screen.findByRole('heading', { name: '新しい名前' })).toBeInTheDocument();
  });

  test('既存のルームでメッセージを送ると、同じルームに送信されて回答が追加されること', async () => {
    mockRoomWithHistory();
    let createBody: Record<string, unknown> | null = null;
    server.use(
      http.post(mockPath(API_PATHS.MESSAGES.CREATE), async ({ request }) => {
        createBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.text('m2');
      }),
      http.post(mockPath(API_PATHS.MESSAGES.CONTENT), () =>
        sse([{ type: 'message_content', data: buildContent('m2', '2 つ目の回答') }]),
      ),
    );
    renderApp('/chat/r1');
    const user = userEvent.setup();

    await screen.findByText('過去の回答');
    await user.type(screen.getByTestId('chat-input-textarea'), '続きの質問');
    await waitFor(() => expect(screen.getByTestId('chat-send-button')).toBeEnabled());
    await user.click(screen.getByTestId('chat-send-button'));

    expect(await screen.findByText('2 つ目の回答')).toBeInTheDocument();
    expect(createBody).toMatchObject({ roomId: 'r1', parentMessageId: 'm1' });
    expect(screen.getByText('過去の回答')).toBeInTheDocument();
  });
});
