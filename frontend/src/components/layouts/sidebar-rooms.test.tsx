import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ADMIN_LAYOUT_CONFIG } from '@/lib/constants/layout';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { useChatStore } from '@/store/chat-store';
import { useRoomsStore } from '@/store/rooms-store';
import { useUiStore } from '@/store/ui-store';
import { server } from '@/test/setup';
import { FIXTURE_GENERAL_USER, setAuthUser } from '@/test/render-app';
import { Sidebar } from './sidebar';

function apiRoom(id: string, name: string, pinned = false) {
  return {
    id,
    name,
    pinned,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    tenantId: 't1',
    userId: 'u1',
    rating: null,
    shareUrl: null,
  };
}

function useRoomsResponse(rooms: ReturnType<typeof apiRoom>[], total = rooms.length) {
  server.use(
    http.get(mockPath(API_PATHS.ROOMS.LIST), () =>
      HttpResponse.json({ content: rooms, totalElements: total, number: 0, size: 20 }),
    ),
  );
}

function CurrentPath() {
  return <div data-testid="current-path">{useLocation().pathname}</div>;
}

function renderSidebar(initialPath = '/dashboard') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Sidebar config={ADMIN_LAYOUT_CONFIG} />
        <CurrentPath />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openRoomMenu(name: string) {
  const user = userEvent.setup();
  const item = await screen.findByRole('link', { name: new RegExp(name) });
  await user.click(within(item).getByRole('button', { name: '操作メニュー' }));
  return user;
}

beforeEach(() => {
  vi.restoreAllMocks();
  useRoomsStore.getState().reset();
  useChatStore.setState({ activeRoomId: null });
  useUiStore.setState({ sidebarCollapsed: false, sidebarMobileOpen: false });
  setAuthUser(FIXTURE_GENERAL_USER);
});

describe('Sidebar のルーム一覧', () => {
  describe('表示', () => {
    test('マウント時にルーム一覧を読み込み、チャットのセクションに並べること', async () => {
      useRoomsResponse([apiRoom('r1', '会議メモ'), apiRoom('r2', '企画')]);
      renderSidebar();

      expect(await screen.findByText('会議メモ')).toBeInTheDocument();
      expect(screen.getByText('SIDEBAR.CHAT')).toBeInTheDocument();
      expect(screen.getAllByTestId('chat-history-item')).toHaveLength(2);
      expect(screen.getByRole('link', { name: /企画/ })).toHaveAttribute('href', '/chat/r2');
    });

    test('ルーム名は翻訳せずそのまま出ること', async () => {
      useRoomsResponse([apiRoom('r1', 'SIDEBAR.CHAT: メモ')]);
      renderSidebar();

      expect(await screen.findByText('SIDEBAR.CHAT: メモ')).toBeInTheDocument();
    });

    test('ピン留めのルームにはピンが出て、そうでないルームには出ないこと', async () => {
      useRoomsResponse([apiRoom('r1', '固定', true), apiRoom('r2', '通常')]);
      renderSidebar();

      const pinned = await screen.findByRole('link', { name: /固定/ });
      const normal = screen.getByRole('link', { name: /通常/ });
      // ピンのアイコン（push_pin）の分だけ svg が多い
      expect(pinned.querySelectorAll('svg').length).toBe(normal.querySelectorAll('svg').length + 1);
    });

    test('サイドバーを折りたたむとルーム一覧の領域の高さが 0 になること', async () => {
      useRoomsResponse([apiRoom('r1', '会議メモ')]);
      renderSidebar();
      const link = await screen.findByRole('link', { name: /会議メモ/ });

      expect(link.parentElement).toHaveStyle({ height: '36px' });

      useUiStore.setState({ sidebarCollapsed: true });
      await waitFor(() => expect(link.parentElement).toHaveStyle({ height: '0px' }));
    });
  });

  describe('追加読み込み', () => {
    test('末尾に近づくまでスクロールすると次のページを読むこと', async () => {
      const pages: number[] = [];
      server.use(
        http.get(mockPath(API_PATHS.ROOMS.LIST), ({ request }) => {
          const page = Number(new URL(request.url).searchParams.get('page'));
          pages.push(page);
          return HttpResponse.json({
            content: [apiRoom(`r${page}`, `ルーム${page}`)],
            totalElements: 2,
            number: page,
            size: 20,
          });
        }),
      );
      renderSidebar();
      const link = await screen.findByRole('link', { name: /ルーム0/ });
      const scroller = link.closest('.sidebar-scroll') as HTMLElement;
      Object.defineProperties(scroller, {
        scrollHeight: { value: 1000, configurable: true },
        clientHeight: { value: 500, configurable: true },
      });

      // 末尾まで遠い間は読まない
      scroller.scrollTop = 100;
      fireEvent.scroll(scroller);
      expect(pages).toEqual([0]);

      scroller.scrollTop = 450;
      fireEvent.scroll(scroller);
      expect(await screen.findByRole('link', { name: /ルーム1/ })).toBeInTheDocument();
      expect(pages).toEqual([0, 1]);
    });
  });

  describe('操作メニュー', () => {
    test('操作メニューのボタンでメニューが開き、背面をクリックすると閉じること', async () => {
      useRoomsResponse([apiRoom('r1', '会議メモ')]);
      renderSidebar();
      const user = await openRoomMenu('会議メモ');

      expect(screen.getByText('SIDEBAR.RENAME_CHAT')).toBeInTheDocument();
      expect(screen.getByText('SIDEBAR.PIN_CHAT')).toBeInTheDocument();
      expect(screen.getByText('SIDEBAR.DELETE_CHAT')).toBeInTheDocument();

      await user.click(screen.getByTestId('chat-room-menu-backdrop'));
      expect(screen.queryByText('SIDEBAR.RENAME_CHAT')).not.toBeInTheDocument();
    });

    test('メニューを開いてもルームの画面には移らないこと', async () => {
      useRoomsResponse([apiRoom('r1', '会議メモ')]);
      renderSidebar();
      await openRoomMenu('会議メモ');

      expect(screen.getByTestId('current-path')).toHaveTextContent('/dashboard');
    });

    test('ピン留めのルームのメニューには「固定を解除」が出ること', async () => {
      useRoomsResponse([apiRoom('r1', '固定', true)]);
      renderSidebar();
      await openRoomMenu('固定');

      expect(screen.getByText('SIDEBAR.UNPIN_CHAT')).toBeInTheDocument();
    });
  });

  describe('ピン留め', () => {
    test('「上部に固定」でピン留めの API を呼び、一覧のピンが付くこと', async () => {
      useRoomsResponse([apiRoom('r1', '会議メモ')]);
      const pinned = vi.fn();
      server.use(
        http.post(mockPath(API_PATHS.ROOMS.PIN(':roomId')), ({ params }) => {
          pinned(params.roomId);
          return HttpResponse.json({});
        }),
      );
      renderSidebar();
      const user = await openRoomMenu('会議メモ');

      await user.click(screen.getByText('SIDEBAR.PIN_CHAT'));

      await waitFor(() => expect(pinned).toHaveBeenCalledWith('r1'));
      await waitFor(() =>
        expect(useRoomsStore.getState().allRooms.find((r) => r.id === 'r1')?.isPinned).toBe(true),
      );
    });

    test('「固定を解除」で解除の API を呼ぶこと', async () => {
      useRoomsResponse([apiRoom('r1', '固定', true)]);
      const unpinned = vi.fn();
      server.use(
        http.delete(mockPath(API_PATHS.ROOMS.UNPIN(':roomId')), ({ params }) => {
          unpinned(params.roomId);
          return new HttpResponse(null, { status: 204 });
        }),
      );
      renderSidebar();
      const user = await openRoomMenu('固定');

      await user.click(screen.getByText('SIDEBAR.UNPIN_CHAT'));

      await waitFor(() => expect(unpinned).toHaveBeenCalledWith('r1'));
    });
  });

  describe('名前の変更', () => {
    test('現在の名前を初期値に、前後の空白を除いて保存し、一覧の名前が変わること', async () => {
      useRoomsResponse([apiRoom('r1', '会議メモ')]);
      const body = vi.fn();
      server.use(
        http.patch(mockPath(API_PATHS.ROOMS.RENAME(':roomId')), async ({ request }) => {
          body(await request.json());
          return HttpResponse.json(apiRoom('r1', '新しい名前'));
        }),
      );
      renderSidebar();
      const user = await openRoomMenu('会議メモ');

      await user.click(screen.getByText('SIDEBAR.RENAME_CHAT'));
      const input = screen.getByDisplayValue('会議メモ');
      await user.clear(input);
      await user.type(input, '  新しい名前 ');
      await user.click(screen.getByRole('button', { name: 'SIDEBAR.SAVE' }));

      await waitFor(() => expect(body).toHaveBeenCalledWith({ name: '新しい名前' }));
      expect(await screen.findByRole('link', { name: /新しい名前/ })).toBeInTheDocument();
      expect(screen.queryByDisplayValue('新しい名前')).not.toBeInTheDocument();
    });

    test('空白だけの名前では保存できないこと', async () => {
      useRoomsResponse([apiRoom('r1', '会議メモ')]);
      renderSidebar();
      const user = await openRoomMenu('会議メモ');

      await user.click(screen.getByText('SIDEBAR.RENAME_CHAT'));
      await user.clear(screen.getByDisplayValue('会議メモ'));
      await user.type(screen.getByRole('textbox'), '   ');

      expect(screen.getByRole('button', { name: 'SIDEBAR.SAVE' })).toBeDisabled();
    });

    test('キャンセルすると API を呼ばずに閉じること', async () => {
      useRoomsResponse([apiRoom('r1', '会議メモ')]);
      const renamed = vi.fn();
      server.use(
        http.patch(mockPath(API_PATHS.ROOMS.RENAME(':roomId')), () => {
          renamed();
          return HttpResponse.json(apiRoom('r1', 'x'));
        }),
      );
      renderSidebar();
      const user = await openRoomMenu('会議メモ');

      await user.click(screen.getByText('SIDEBAR.RENAME_CHAT'));
      await user.click(screen.getByRole('button', { name: 'SIDEBAR.CANCEL' }));

      expect(screen.queryByDisplayValue('会議メモ')).not.toBeInTheDocument();
      expect(renamed).not.toHaveBeenCalled();
    });
  });

  describe('削除', () => {
    test('確認ダイアログで確定すると削除し、一覧から消えること', async () => {
      useRoomsResponse([apiRoom('r1', '会議メモ'), apiRoom('r2', '企画')]);
      const deleted = vi.fn();
      server.use(
        http.delete(mockPath(API_PATHS.ROOMS.DETAIL(':roomId')), ({ params }) => {
          deleted(params.roomId);
          return new HttpResponse(null, { status: 204 });
        }),
      );
      renderSidebar();
      const user = await openRoomMenu('会議メモ');

      await user.click(screen.getByText('SIDEBAR.DELETE_CHAT'));
      expect(screen.getByText('SIDEBAR.DELETE_DIALOG.CONFIRM_DESC')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /COMMON.DELETE/ }));

      await waitFor(() => expect(deleted).toHaveBeenCalledWith('r1'));
      await waitFor(() =>
        expect(screen.queryByRole('link', { name: /会議メモ/ })).not.toBeInTheDocument(),
      );
      expect(screen.queryByText('SIDEBAR.DELETE_DIALOG.CONFIRM_DESC')).not.toBeInTheDocument();
      // 別のルームを見ているので移動しない
      expect(screen.getByTestId('current-path')).toHaveTextContent('/dashboard');
    });

    test('表示中のルームを削除すると新規チャットへ移り、表示中のルームを空にすること', async () => {
      useRoomsResponse([apiRoom('r1', '会議メモ')]);
      server.use(
        http.delete(mockPath(API_PATHS.ROOMS.DETAIL(':roomId')), () => new HttpResponse(null, { status: 204 })),
      );
      useChatStore.setState({ activeRoomId: 'r1' });
      renderSidebar('/chat/r1');
      const user = await openRoomMenu('会議メモ');

      await user.click(screen.getByText('SIDEBAR.DELETE_CHAT'));
      await user.click(screen.getByRole('button', { name: /COMMON.DELETE/ }));

      await waitFor(() =>
        expect(screen.getByTestId('current-path')).toHaveTextContent('/chat/new'),
      );
      expect(useChatStore.getState().activeRoomId).toBeNull();
    });

    test('キャンセルすると削除しないこと', async () => {
      useRoomsResponse([apiRoom('r1', '会議メモ')]);
      renderSidebar();
      const user = await openRoomMenu('会議メモ');

      await user.click(screen.getByText('SIDEBAR.DELETE_CHAT'));
      await user.click(screen.getByRole('button', { name: 'COMMON.CANCEL' }));

      expect(screen.queryByText('SIDEBAR.DELETE_DIALOG.CONFIRM_DESC')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: /会議メモ/ })).toBeInTheDocument();
    });
  });
});
