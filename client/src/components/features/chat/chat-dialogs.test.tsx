import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { useChatStore } from '@/store/chat-store';
import { useRoomsStore } from '@/store/rooms-store';
import { server } from '@/test/setup';
import { ChatNewRoomDialog } from './chat-new-room-dialog';
import { ChatRenameDialog } from './chat-rename-dialog';
import { NewChatDialog } from './new-chat-dialog';

function buildApiAssistant(id: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    tenantId: 't1',
    type: 'SAAS_CHAT',
    endpoints: [],
    name,
    indexId: null,
    category: 'カテゴリ',
    groups: [],
    description: `${name}の説明`,
    includeHistory: false,
    iconColor: '#000',
    ...overrides,
  };
}

function useAssistantsResponse() {
  server.use(
    http.get(mockPath(API_PATHS.ASSISTANTS.LIST), () =>
      HttpResponse.json([buildApiAssistant('a1', '一般'), buildApiAssistant('a2', '法務')]),
    ),
  );
}

function CurrentPath() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

function wrap(ui: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        {ui}
        <CurrentPath />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useRoomsStore.getState().reset();
  useChatStore.setState({ activeRoomId: null });
});

describe('ChatRenameDialog', () => {
  test('現在の名前を初期値にし、前後の空白を除いて保存すること', async () => {
    const onSave = vi.fn();
    render(<ChatRenameDialog initialName="旧名" onSave={onSave} onCancel={vi.fn()} />);
    const user = userEvent.setup();
    const input = screen.getByDisplayValue('旧名');

    await user.clear(input);
    await user.type(input, '  新しい名前 ');
    await user.click(screen.getByRole('button', { name: 'COMMON.SAVE' }));

    expect(onSave).toHaveBeenCalledWith('新しい名前');
  });

  test('空白だけの名前では保存できないこと', async () => {
    const onSave = vi.fn();
    render(<ChatRenameDialog initialName="旧名" onSave={onSave} onCancel={vi.fn()} />);
    const user = userEvent.setup();

    await user.clear(screen.getByDisplayValue('旧名'));
    await user.type(screen.getByRole('textbox'), '   ');

    expect(screen.getByRole('button', { name: 'COMMON.SAVE' })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  test('キャンセルで閉じること', async () => {
    const onCancel = vi.fn();
    render(<ChatRenameDialog initialName="旧名" onSave={vi.fn()} onCancel={onCancel} />);

    await userEvent.click(screen.getByRole('button', { name: 'COMMON.CANCEL' }));

    expect(onCancel).toHaveBeenCalled();
  });
});

describe('ChatNewRoomDialog', () => {
  test('既定のアシスタントを選んだ状態で出て、作成すると選んだ ID が渡ること', async () => {
    server.use(
      http.get(mockPath(API_PATHS.ASSISTANTS.LIST), () =>
        HttpResponse.json([buildApiAssistant('a1', '一般'), buildApiAssistant('a2', '法務')]),
      ),
    );
    const onCreate = vi.fn();
    wrap(<ChatNewRoomDialog onCreate={onCreate} onCancel={vi.fn()} />);
    const user = userEvent.setup();

    const second = await screen.findByRole('option', { name: /法務/ });
    expect(await screen.findByRole('option', { name: /一般/ })).toHaveAttribute('aria-selected', 'true');
    await user.click(second);
    await user.click(screen.getByRole('button', { name: 'COMMON.CREATE' }));

    expect(onCreate).toHaveBeenCalledWith('a2');
  });
});

describe('NewChatDialog（サイドバー）', () => {
  test('閉じているときは何も出さないこと', () => {
    useAssistantsResponse();
    wrap(<NewChatDialog open={false} onClose={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('アシスタントを選ぶまで作成できないこと', async () => {
    useAssistantsResponse();
    wrap(<NewChatDialog open onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'COMMON.CREATE' })).toBeDisabled();
  });

  test('アシスタントを選んで作成すると、ルームを作ってその画面へ移りダイアログを閉じること', async () => {
    useAssistantsResponse();
    let body: unknown = null;
    server.use(
      http.post(mockPath(API_PATHS.ROOMS.CREATE), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          id: 'new-room',
          name: '一般',
          pinned: false,
          createdAt: '2026-11-13T00:00:00Z',
          updatedAt: '2026-11-13T00:00:00Z',
          tenantId: 't1',
          userId: 'u1',
          rating: null,
          shareUrl: null,
          defaultAssistantId: 'a1',
        });
      }),
    );
    const onClose = vi.fn();
    wrap(<NewChatDialog open onClose={onClose} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('textbox'));
    await user.click(await screen.findByText('法務'));
    await user.click(screen.getByRole('button', { name: 'COMMON.CREATE' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(body).toMatchObject({ assistantId: 'a2' });
    expect(screen.getByTestId('path')).toHaveTextContent('/chat/new-room');
    expect(useChatStore.getState().activeRoomId).toBe('new-room');
  });

  test('作成に失敗したらダイアログを開いたままにすること', async () => {
    useAssistantsResponse();
    server.use(http.post(mockPath(API_PATHS.ROOMS.CREATE), () => new HttpResponse(null, { status: 500 })));
    const onClose = vi.fn();
    wrap(<NewChatDialog open onClose={onClose} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('textbox'));
    await user.click(await screen.findByText('法務'));
    await user.click(screen.getByRole('button', { name: 'COMMON.CREATE' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'COMMON.CREATE' })).toBeEnabled());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('path')).toHaveTextContent('/dashboard');
  });
});
