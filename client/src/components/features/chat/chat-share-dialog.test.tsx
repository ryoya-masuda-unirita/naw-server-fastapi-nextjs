import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { useChatStore } from '@/store/chat-store';
import { useRoomsStore } from '@/store/rooms-store';
import { useTeamsStore } from '@/store/teams-store';
import { server } from '@/test/setup';
import type { ChatRoom } from '@/types/chat/chat-room.type';
import { ChatShareDialog } from './chat-share-dialog';

const FIXTURE_ROOM: ChatRoom = { id: 'r1', name: '部屋1', isPinned: false, category: 'chat' };

function useTeamsResponse() {
  server.use(
    http.get(mockPath(API_PATHS.GROUPS.LIST), () =>
      HttpResponse.json({
        data: [
          { id: 'g1', name: '営業' },
          { id: 'g2', name: '開発' },
        ],
      }),
    ),
  );
}

function renderDialog(isReadOnly = false) {
  const onClose = vi.fn();
  render(<ChatShareDialog isReadOnly={isReadOnly} onClose={onClose} />);
  return { onClose };
}

async function selectTeam(user: ReturnType<typeof userEvent.setup>, label: string) {
  await waitFor(() => expect(useTeamsStore.getState().teams).toHaveLength(2));
  fireEvent.click(await screen.findByTestId('room-share-team-trigger'));
  const options = await screen.findAllByTestId('room-share-team-option');
  await user.click(options.find((option) => option.textContent?.includes(label))!);
  await user.click(screen.getByTestId('room-share-team-confirm-button'));
}

beforeEach(() => {
  useRoomsStore.getState().reset();
  useTeamsStore.setState({ teams: [] });
  useChatStore.setState({ activeRoomId: 'r1', sharedRoomContext: undefined });
  useRoomsStore.setState({ allRooms: [FIXTURE_ROOM] });
  useTeamsResponse();
});

describe('ChatShareDialog', () => {
  test('開くとチーム一覧を取得し、未選択のうちは共有できないこと', async () => {
    renderDialog();

    await waitFor(() => expect(useTeamsStore.getState().teams).toHaveLength(2));
    expect(screen.getByRole('button', { name: 'CHAT.SHARE_DIALOG.SHARE_ACTION' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'CHAT.SHARE_DIALOG.UNSHARE' })).not.toBeInTheDocument();
  });

  test('チームを選んで共有すると API に送り、ダイアログは開いたまま共有リンクの操作を出すこと', async () => {
    const requests: unknown[] = [];
    server.use(
      http.post(mockPath(API_PATHS.SHARES.CREATE), async ({ request }) => {
        requests.push(await request.json());
        return HttpResponse.json({ data: { id: 's1', roomId: 'r1', teamIds: ['g1'] } });
      }),
    );
    const { onClose } = renderDialog();
    const user = userEvent.setup();

    await selectTeam(user, '営業');
    await user.click(screen.getByRole('button', { name: 'CHAT.SHARE_DIALOG.SHARE_ACTION' }));

    expect(await screen.findByRole('button', { name: 'CHAT.SHARE_DIALOG.COPY_LINK' })).toBeInTheDocument();
    expect(requests).toEqual([{ roomId: 'r1', teamIds: ['g1'] }]);
    expect(useRoomsStore.getState().allRooms[0]).toMatchObject({ shareId: 's1', teamIds: ['g1'] });
    expect(onClose).not.toHaveBeenCalled();
  });

  test('共有に失敗したらダイアログを閉じること', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    server.use(
      http.post(mockPath(API_PATHS.SHARES.CREATE), () =>
        HttpResponse.json({ message: 'error' }, { status: 500 }),
      ),
    );
    const { onClose } = renderDialog();
    const user = userEvent.setup();

    await selectTeam(user, '営業');
    await user.click(screen.getByRole('button', { name: 'CHAT.SHARE_DIALOG.SHARE_ACTION' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    consoleError.mockRestore();
  });

  test('共有済みのルームは共有先を初期選択にして、リンクのコピーができること', async () => {
    useRoomsStore.setState({
      allRooms: [{ ...FIXTURE_ROOM, shareId: 's1', teamIds: ['g1'] }],
    });
    renderDialog();
    // userEvent.setup() が navigator.clipboard を差し替えるため、その後に監視する
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');

    expect(screen.getByRole('button', { name: 'CHAT.SHARE_DIALOG.SHARE_ACTION' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'CHAT.SHARE_DIALOG.COPY_LINK' }));

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/chat/share/s1`);
  });

  test('共有の解除を確認すると API を呼び、共有ダイアログを閉じること', async () => {
    useRoomsStore.setState({
      allRooms: [{ ...FIXTURE_ROOM, shareId: 's1', teamIds: ['g1'] }],
    });
    let deletedShareId: string | readonly string[] | undefined;
    server.use(
      http.delete(mockPath(API_PATHS.SHARES.DELETE(':shareId')), ({ params }) => {
        deletedShareId = params.shareId;
        return HttpResponse.json({ data: { id: 's1' } });
      }),
    );
    const { onClose } = renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'CHAT.SHARE_DIALOG.UNSHARE' }));
    expect(screen.getByText('CHAT.SHARE_DIALOG.UNSHARE_CONFIRM_TITLE')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /CHAT.SHARE_DIALOG.UNSHARE_CONFIRM_BUTTON/ }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(deletedShareId).toBe('s1');
    expect(useRoomsStore.getState().allRooms[0]).toMatchObject({ shareId: null, teamIds: [] });
  });

  test('無関係なルームの更新では、選びかけのチームを消さないこと', async () => {
    renderDialog();
    const user = userEvent.setup();
    await selectTeam(user, '営業');

    act(() => {
      useRoomsStore.getState().updateRoom('r1', { name: '改名した部屋' });
    });

    expect(screen.getByRole('button', { name: 'CHAT.SHARE_DIALOG.SHARE_ACTION' })).toBeEnabled();
  });

  test('解除の確認をキャンセルすると API を呼ばず、共有ダイアログを残すこと', async () => {
    useRoomsStore.setState({
      allRooms: [{ ...FIXTURE_ROOM, shareId: 's1', teamIds: ['g1'] }],
    });
    const { onClose } = renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'CHAT.SHARE_DIALOG.UNSHARE' }));
    const cancelButtons = screen.getAllByRole('button', { name: 'COMMON.CANCEL' });
    await user.click(cancelButtons[cancelButtons.length - 1]);

    expect(screen.queryByText('CHAT.SHARE_DIALOG.UNSHARE_CONFIRM_TITLE')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(useRoomsStore.getState().allRooms[0].shareId).toBe('s1');
  });

  test('読み取り専用では共有ボタンとリンクの操作を出さず、チーム選択を無効にすること', () => {
    useRoomsStore.setState({
      allRooms: [{ ...FIXTURE_ROOM, shareId: 's1', teamIds: ['g1'] }],
    });
    renderDialog(true);

    expect(screen.queryByRole('button', { name: 'CHAT.SHARE_DIALOG.SHARE_ACTION' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'CHAT.SHARE_DIALOG.COPY_LINK' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CHAT.SHARE_DIALOG.CANCEL' })).toBeInTheDocument();
  });
});
