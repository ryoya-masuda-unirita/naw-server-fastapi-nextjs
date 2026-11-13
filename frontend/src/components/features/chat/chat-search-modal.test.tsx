import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { useChatStore } from '@/store/chat-store';
import { useRoomsStore } from '@/store/rooms-store';
import { server } from '@/test/setup';
import { ChatSearchModal } from './chat-search-modal';

// デバウンス（300ms）の後に API を呼ぶため、負荷が高いときでも待てるよう既定の 1 秒より長くする
const FIND_OPTIONS = { timeout: 3000 };

function apiRoom(id: string, name: string) {
  return {
    id,
    name,
    pinned: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-03-05T10:00:00',
    tenantId: 't1',
    userId: 'u1',
    rating: null,
    shareUrl: null,
  };
}

function CurrentPath() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

function renderModal(open = true) {
  const onClose = vi.fn();
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <ChatSearchModal open={open} onClose={onClose} />
      <CurrentPath />
    </MemoryRouter>,
  );
  return { onClose };
}

function useSearchResponse(handler: (params: URLSearchParams) => Record<string, unknown>) {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get(mockPath(API_PATHS.ROOMS.LIST), ({ request }) => {
      const params = new URL(request.url).searchParams;
      requests.push(params);
      return HttpResponse.json(handler(params));
    }),
  );
  return requests;
}

beforeEach(() => {
  useRoomsStore.getState().reset();
  useChatStore.setState({ activeRoomId: null });
});

describe('ChatSearchModal', () => {
  test('閉じているときは何も出さないこと', () => {
    renderModal(false);

    expect(screen.queryByTestId('chat-search-input')).not.toBeInTheDocument();
  });

  test('検索語を入れる前は結果欄を出さないこと', () => {
    renderModal();

    expect(screen.getByTestId('chat-search-input')).toBeInTheDocument();
    expect(screen.queryByText('CHAT.SEARCH_MODAL.EMPTY')).not.toBeInTheDocument();
  });

  test('入力するとデバウンス後に名前・ページ・件数付きで検索し、結果を日付つきで出すこと', async () => {
    const requests = useSearchResponse(() => ({
      content: [apiRoom('r1', '議事録の相談'), apiRoom('r2', '議事録の整理')],
      totalElements: 2,
      number: 0,
      size: 20,
    }));
    renderModal();

    await userEvent.setup().type(screen.getByTestId('chat-search-input'), ' 議事録 ');

    expect(await screen.findAllByTestId('chat-search-result-item', {}, FIND_OPTIONS)).toHaveLength(2);
    expect(screen.getAllByText('2026/03/05').length).toBeGreaterThan(0);
    // 文字ごとに検索せず、確定した語で 1 回だけ呼ぶ
    expect(requests).toHaveLength(1);
    expect(requests[0].get('name')).toBe('議事録');
    expect(requests[0].get('page')).toBe('0');
    expect(requests[0].get('size')).toBe('20');
  });

  test('結果が 0 件のときは空の文言を出し、ページ送りを出さないこと', async () => {
    useSearchResponse(() => ({ content: [], totalElements: 0, number: 0, size: 20 }));
    renderModal();

    await userEvent.setup().type(screen.getByTestId('chat-search-input'), 'なし');

    expect(await screen.findByText('CHAT.SEARCH_MODAL.EMPTY', {}, FIND_OPTIONS)).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  test('結果を押すとそのルームへ移動してダイアログを閉じること', async () => {
    useSearchResponse(() => ({
      content: [apiRoom('r1', '議事録の相談')],
      totalElements: 1,
      number: 0,
      size: 20,
    }));
    server.use(
      http.get(mockPath(API_PATHS.MESSAGES.LIST), () =>
        HttpResponse.json({ assistants: [], messages: [] }),
      ),
    );
    const { onClose } = renderModal();
    const user = userEvent.setup();

    await user.type(screen.getByTestId('chat-search-input'), '議事');
    await user.click(await screen.findByTestId('chat-search-result-item', {}, FIND_OPTIONS));

    expect(screen.getByTestId('path')).toHaveTextContent('/chat/r1');
    expect(useChatStore.getState().activeRoomId).toBe('r1');
    expect(onClose).toHaveBeenCalled();
  });

  test('検索語を消すと結果を初期化すること', async () => {
    useSearchResponse(() => ({
      content: [apiRoom('r1', '議事録の相談')],
      totalElements: 1,
      number: 0,
      size: 20,
    }));
    renderModal();
    const user = userEvent.setup();
    const input = screen.getByTestId('chat-search-input');

    await user.type(input, '議事');
    await screen.findByTestId('chat-search-result-item', {}, FIND_OPTIONS);
    await user.clear(input);

    await waitFor(() => {
      expect(screen.queryByTestId('chat-search-result-item')).not.toBeInTheDocument();
    });
  });

  test('検索に失敗したら結果を空にすること', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    server.use(
      http.get(mockPath(API_PATHS.ROOMS.LIST), () =>
        HttpResponse.json({ message: 'error' }, { status: 500 }),
      ),
    );
    renderModal();

    await userEvent.setup().type(screen.getByTestId('chat-search-input'), '議事');

    expect(await screen.findByText('CHAT.SEARCH_MODAL.EMPTY', {}, FIND_OPTIONS)).toBeInTheDocument();
    consoleError.mockRestore();
  });

  test('総件数が 1 ページを超えるときはページ送りで次のページを検索すること', async () => {
    const requests = useSearchResponse((params) => ({
      content: [apiRoom(`r-${params.get('page')}`, `ルーム${params.get('page')}`)],
      totalElements: 45,
      number: Number(params.get('page')),
      size: 20,
    }));
    renderModal();
    const user = userEvent.setup();

    await user.type(screen.getByTestId('chat-search-input'), 'ルーム');
    await screen.findByText('ルーム0', {}, FIND_OPTIONS);
    await user.click(screen.getByRole('button', { name: '2' }));

    expect(await screen.findByText('ルーム1', {}, FIND_OPTIONS)).toBeInTheDocument();
    expect(requests[requests.length - 1]?.get('page')).toBe('1');
  });
});
