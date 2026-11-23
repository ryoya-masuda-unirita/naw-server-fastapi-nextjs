import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { useRoomsStore } from '@/store/rooms-store';
import { server } from '@/test/setup';
import { ChatContextMenu } from './chat-context-menu';
import { ChatDeleteDialog } from './chat-delete-dialog';
import { ChatRoomMenu } from './chat-room-menu';
import { ChatSortDialog } from './chat-sort-dialog';

function apiRoom(id: string, name: string, pinned = false) {
  return {
    id,
    name,
    pinned,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-03-04T00:00:00Z',
    tenantId: 't1',
    userId: 'u1',
    rating: null,
    shareUrl: null,
  };
}

function wrap(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useRoomsStore.getState().reset();
});

describe('ChatRoomMenu', () => {
  const baseProps = {
    isOpen: true,
    isPinned: false,
    topPx: 100,
    triggerTopPx: 80,
    onRename: vi.fn(),
    onTogglePin: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());

  test('各項目を押すと対応する操作を通知してメニューを閉じること', async () => {
    const user = userEvent.setup();
    render(<ChatRoomMenu {...baseProps} />);

    await user.click(screen.getByText('SIDEBAR.RENAME_CHAT'));
    await user.click(screen.getByText('SIDEBAR.PIN_CHAT'));
    await user.click(screen.getByText('SIDEBAR.DELETE_CHAT'));

    expect(baseProps.onRename).toHaveBeenCalledTimes(1);
    expect(baseProps.onTogglePin).toHaveBeenCalledTimes(1);
    expect(baseProps.onDelete).toHaveBeenCalledTimes(1);
    expect(baseProps.onClose).toHaveBeenCalledTimes(3);
  });

  test('閉じているときは何も描画しないこと', () => {
    render(<ChatRoomMenu {...baseProps} isOpen={false} />);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('下に収まるときはボタンの下に、収まらないときはボタンの上に出ること', () => {
    const { rerender } = render(<ChatRoomMenu {...baseProps} />);
    expect(screen.getByRole('menu')).toHaveStyle({ top: '100px' });

    // jsdom の高さは 768。100px 下げたメニュー(168px)が収まらない位置
    rerender(<ChatRoomMenu {...baseProps} topPx={700} triggerTopPx={680} />);
    expect(screen.getByRole('menu')).toHaveStyle({ top: `${680 - 168 - 4}px` });
  });

  test('上に出しても画面の外に出るときは上端の余白に合わせること', () => {
    render(<ChatRoomMenu {...baseProps} topPx={700} triggerTopPx={20} />);

    expect(screen.getByRole('menu')).toHaveStyle({ top: '8px' });
  });

  test('背面をクリックすると閉じる通知が出ること', async () => {
    const user = userEvent.setup();
    render(<ChatRoomMenu {...baseProps} />);

    await user.click(screen.getByTestId('chat-room-menu-backdrop'));

    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ChatContextMenu', () => {
  test('「選択して削除」を押すと通知すること', async () => {
    const onDeleteSelected = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatContextMenu
        isOpen
        chatMenuTopPx={100}
        onDeleteSelected={onDeleteSelected}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByText('SIDEBAR.DELETE_SELECTED'));

    expect(onDeleteSelected).toHaveBeenCalledTimes(1);
  });

  test('閉じているときは何も描画しないこと', () => {
    render(
      <ChatContextMenu isOpen={false} chatMenuTopPx={0} onDeleteSelected={vi.fn()} onClose={vi.fn()} />,
    );

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('ChatDeleteDialog', () => {
  function useRoomsPages() {
    server.use(
      http.get(mockPath(API_PATHS.ROOMS.LIST), ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'));
        const rooms =
          page === 0
            ? [apiRoom('r1', '会議メモ'), apiRoom('r2', '企画')]
            : [apiRoom('r3', '二ページ目')];
        return HttpResponse.json({ content: rooms, totalElements: 12, number: page, size: 10 });
      }),
    );
  }

  test('ルームを表に並べ、何も選んでいない間は削除ボタンが押せないこと', async () => {
    useRoomsPages();
    wrap(<ChatDeleteDialog onClose={vi.fn()} />);

    expect((await screen.findAllByText('会議メモ')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('2026/03/04').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'COMMON.DELETE' })).toBeDisabled();
  });

  test('選んで確認で確定すると、選んだルームを削除して ID を通知すること', async () => {
    useRoomsPages();
    const body = vi.fn();
    server.use(
      http.delete(mockPath(API_PATHS.ROOMS.DEFAULT), async ({ request }) => {
        body(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    wrap(<ChatDeleteDialog onClose={onClose} />);
    await screen.findAllByText('会議メモ');

    const row = screen.getAllByTestId('chat-delete-room-row')[0];
    await user.click(within(row).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'COMMON.DELETE' }));
    expect(screen.getByText('SIDEBAR.DELETE_DIALOG.CONFIRM_DESC')).toBeInTheDocument();
    const confirmButtons = screen.getAllByRole('button', { name: /COMMON.DELETE/ });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(onClose).toHaveBeenCalledWith(['r1']));
    expect(body).toHaveBeenCalledWith({ ids: ['r1'] });
  });

  test('キャンセルすると null を通知すること', async () => {
    useRoomsPages();
    const onClose = vi.fn();
    const user = userEvent.setup();
    wrap(<ChatDeleteDialog onClose={onClose} />);
    await screen.findAllByText('会議メモ');

    await user.click(screen.getByRole('button', { name: 'COMMON.CANCEL' }));

    expect(onClose).toHaveBeenCalledWith(null);
  });

  test('ページを変えると次のページを読み込むこと', async () => {
    useRoomsPages();
    const user = userEvent.setup();
    wrap(<ChatDeleteDialog onClose={vi.fn()} />);
    await screen.findAllByText('会議メモ');

    await user.click(screen.getByRole('button', { name: '2' }));

    expect((await screen.findAllByText('二ページ目')).length).toBeGreaterThan(0);
  });
});

describe('ChatSortDialog', () => {
  function useRoomsByPin() {
    server.use(
      http.get(mockPath(API_PATHS.ROOMS.LIST), ({ request }) => {
        const isPinned = new URL(request.url).searchParams.get('isPinned') === 'true';
        const rooms = isPinned
          ? [apiRoom('p1', '固定A', true)]
          : [apiRoom('u1', '通常A'), apiRoom('u2', '通常B')];
        return HttpResponse.json({ content: rooms, totalElements: rooms.length, number: 0, size: 10 });
      }),
    );
  }

  test('固定したチャットと固定していないチャットを分けて出すこと', async () => {
    useRoomsByPin();
    wrap(<ChatSortDialog onClose={vi.fn()} />);

    expect(await screen.findByText('固定A')).toBeInTheDocument();
    expect(screen.getByText('通常A')).toBeInTheDocument();
    expect(screen.getByText('SIDEBAR.PINNED_CHATS')).toBeInTheDocument();
    expect(screen.getByText('SIDEBAR.UNPINNED_CHATS')).toBeInTheDocument();
  });

  test('ピンを切り替えて保存すると、変更分だけを送って通知すること', async () => {
    useRoomsByPin();
    const body = vi.fn();
    server.use(
      http.put(mockPath(API_PATHS.ROOMS.BULK_PIN_UPDATE), async ({ request }) => {
        body(await request.json());
        return HttpResponse.json({ data: [] });
      }),
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    wrap(<ChatSortDialog onClose={onClose} />);
    await screen.findByText('固定A');

    await user.click(screen.getByRole('button', { name: 'toggle-pin-u1' }));
    await user.click(screen.getByRole('button', { name: 'toggle-pin-p1' }));
    // 固定側に移ったものは、固定していない側から消える
    expect(screen.getAllByText('通常A')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'SIDEBAR.SAVE' }));

    await waitFor(() =>
      expect(onClose).toHaveBeenCalledWith([
        { roomId: 'u1', isPinned: true },
        { roomId: 'p1', isPinned: false },
      ]),
    );
    expect(body).toHaveBeenCalledWith({
      rooms: [
        { roomId: 'u1', isPinned: true },
        { roomId: 'p1', isPinned: false },
      ],
    });
  });

  test('切り替えをもとに戻すと、変更として送らないこと', async () => {
    useRoomsByPin();
    const body = vi.fn();
    server.use(
      http.put(mockPath(API_PATHS.ROOMS.BULK_PIN_UPDATE), async ({ request }) => {
        body(await request.json());
        return HttpResponse.json({ data: [] });
      }),
    );
    const user = userEvent.setup();
    wrap(<ChatSortDialog onClose={vi.fn()} />);
    await screen.findByText('固定A');

    await user.click(screen.getByRole('button', { name: 'toggle-pin-u1' }));
    await user.click(screen.getByRole('button', { name: 'toggle-pin-u1' }));
    await user.click(screen.getByRole('button', { name: 'SIDEBAR.SAVE' }));

    await waitFor(() => expect(body).toHaveBeenCalledWith({ rooms: [] }));
  });

  test('保存の API が失敗するとダイアログを開いたままにすること（移植元の server に PUT /api/rooms/pin がない）', async () => {
    useRoomsByPin();
    server.use(
      http.put(mockPath(API_PATHS.ROOMS.BULK_PIN_UPDATE), () =>
        HttpResponse.json({ detail: 'Not Found' }, { status: 404 }),
      ),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onClose = vi.fn();
    const user = userEvent.setup();
    wrap(<ChatSortDialog onClose={onClose} />);
    await screen.findByText('固定A');

    await user.click(screen.getByRole('button', { name: 'SIDEBAR.SAVE' }));

    await waitFor(() => expect(useRoomsStore.getState().isReorderingRooms).toBe(false));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('固定A')).toBeInTheDocument();
  });

  test('キャンセルすると false を通知すること', async () => {
    useRoomsByPin();
    const onClose = vi.fn();
    const user = userEvent.setup();
    wrap(<ChatSortDialog onClose={onClose} />);
    await screen.findByText('固定A');

    await user.click(screen.getByRole('button', { name: 'SIDEBAR.CANCEL' }));

    expect(onClose).toHaveBeenCalledWith(false);
  });
});
