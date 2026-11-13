import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { useChatStore } from '@/store/chat-store';
import { useRoomsStore } from '@/store/rooms-store';
import { server } from '@/test/setup';
import type { Message } from '@/types/chat/message.type';
import { ChatWindow } from './chat-window';

const FIXTURE_MESSAGES: Message[] = [
  { id: 'm1', messageId: 'm1', role: 'user', status: 'OK', question: '質問A', answer: '', context: '', isRated: false },
];

function renderWindow(props: Partial<React.ComponentProps<typeof ChatWindow>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ChatWindow messages={FIXTURE_MESSAGES} roomId="r1" {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const originalInnerWidth = window.innerWidth;

beforeEach(() => {
  useRoomsStore.setState({
    allRooms: [{ id: 'r1', name: '部屋1', isPinned: false, category: 'chat' }],
  });
  useChatStore.setState({ activeRoomId: 'r1' });
});

afterEach(() => {
  useRoomsStore.getState().reset();
  useChatStore.setState({ activeRoomId: null });
  Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true });
});

describe('ChatWindow', () => {
  test('メッセージ・ヘッダー・入力欄を出すこと', async () => {
    renderWindow();

    expect(screen.getByText('質問A')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '部屋1' })).toBeInTheDocument();
    expect(screen.getByTestId('chat-input-textarea')).toBeInTheDocument();
  });

  test('読み取り専用では入力欄を出さないこと', () => {
    renderWindow({ isReadOnly: true });

    expect(screen.queryByTestId('chat-input-textarea')).not.toBeInTheDocument();
  });

  test('showHeader が false のときはルーム名を隠すこと', () => {
    const { container } = renderWindow({ showHeader: false });

    expect(container.querySelector('.chat-page-header')).toHaveClass('hidden');
  });

  test('ヘッダーの共有ボタンで共有ダイアログを開くこと', async () => {
    server.use(http.get(mockPath(API_PATHS.GROUPS.LIST), () => HttpResponse.json({ data: [] })));
    renderWindow();

    await userEvent.setup().click(screen.getByTestId('room-share-button'));

    expect(screen.getByRole('dialog', { name: 'CHAT.SHARE_DIALOG.TITLE' })).toBeInTheDocument();
  });

  test('ヘッダーの評価ボタンで評価ダイアログを開き、キャンセルで閉じること', async () => {
    renderWindow();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'HEADER.LIKE' }));
    expect(screen.getByRole('dialog', { name: 'CHAT.RATING_DIALOG.TITLE' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'CHAT.RATING_DIALOG.CANCEL' }));

    expect(screen.queryByRole('dialog', { name: 'CHAT.RATING_DIALOG.TITLE' })).not.toBeInTheDocument();
  });

  test('onShareClick を渡したときは共有ダイアログを開かず、渡した処理を呼ぶこと', async () => {
    const onShareClick = vi.fn();
    renderWindow({ onShareClick });

    await userEvent.setup().click(screen.getByTestId('room-share-button'));

    expect(onShareClick).toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'CHAT.SHARE_DIALOG.TITLE' })).not.toBeInTheDocument();
  });

  test('入力欄へファイルをドロップすると添付のチップを出すこと', () => {
    const { container } = renderWindow();

    fireEvent.drop(container.querySelector('.chat-input-textarea-wrap')!, {
      dataTransfer: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    });

    expect(screen.getByText('notes.txt')).toBeInTheDocument();
  });

  test('「＋」メニューの添付項目で、ドロップ領域のファイル選択 input を開き、選んだファイルをチップに出すこと', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    renderWindow();
    const user = userEvent.setup();
    const input = screen.getByTestId<HTMLInputElement>('chat-attach-file-input');
    const clickSpy = vi.spyOn(input, 'click');

    await user.click(screen.getByTestId('chat-attach-button'));
    await user.click(screen.getByTestId('chat-attach-menu-item'));
    expect(clickSpy).toHaveBeenCalled();

    await user.upload(input, new File(['x'], 'memo.txt', { type: 'text/plain' }));
    expect(screen.getByText('memo.txt')).toBeInTheDocument();
  });

  test('モバイルではメニューからビューワーを開き、背景を押すと閉じること', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    renderWindow({ renderViewer: ({ roomId }) => <div>viewer-{roomId}</div> });
    const user = userEvent.setup();

    expect(screen.queryByText('viewer-r1')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'HEADER.MORE' }));
    await user.click(screen.getByRole('menuitem', { name: /HEADER.OPEN_VIEWER/ }));
    expect(screen.getByText('viewer-r1')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    await user.click(screen.getByRole('dialog', { name: 'CHAT.VIEWER.TITLE' }).firstElementChild as HTMLElement);

    expect(screen.queryByText('viewer-r1')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });
});
