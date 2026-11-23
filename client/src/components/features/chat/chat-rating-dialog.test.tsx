import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { useRoomsStore } from '@/store/rooms-store';
import { server } from '@/test/setup';
import { ChatRatingDialog } from './chat-rating-dialog';

function renderDialog(props: Partial<React.ComponentProps<typeof ChatRatingDialog>> = {}) {
  const onClose = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ChatRatingDialog roomId="r1" existingRating={undefined} onClose={onClose} {...props} />
    </QueryClientProvider>,
  );
  return { onClose };
}

function useFeedbackResponse(status = 200) {
  const requests: unknown[] = [];
  server.use(
    http.post(mockPath(API_PATHS.ROOMS.FEEDBACK(':roomId')), async ({ request }) => {
      requests.push(await request.json());
      if (status !== 200) return HttpResponse.json({ message: 'error' }, { status });
      return HttpResponse.json({ data: { roomId: 'r1', rating: 'VERY_GOOD' } });
    }),
  );
  return requests;
}

beforeEach(() => {
  useRoomsStore.getState().reset();
  useRoomsStore.setState({
    allRooms: [{ id: 'r1', name: '部屋1', isPinned: false, category: 'chat' }],
  });
});

describe('ChatRatingDialog', () => {
  test('既存の評価がなければ何も選ばれていないこと', () => {
    renderDialog();

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).not.toBeChecked();
    }
  });

  test('既存の評価があれば、その星の数を初期選択にすること', () => {
    renderDialog({ existingRating: 'VERY_GOOD' });

    expect(screen.getByRole('radio', { name: '★★★★☆' })).toBeChecked();
  });

  test('星を選んで送信すると評価を送り、成功したら閉じること', async () => {
    const requests = useFeedbackResponse();
    const { onClose } = renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: '★★★★☆' }));
    await user.click(screen.getByRole('button', { name: 'CHAT.RATING_DIALOG.SUBMIT' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(requests).toEqual([{ rating: 'VERY_GOOD' }]);
    expect(useRoomsStore.getState().allRooms[0].rating).toBe('VERY_GOOD');
  });

  test('何も選ばずに送信しても API を呼ばず閉じないこと', async () => {
    const requests = useFeedbackResponse();
    const { onClose } = renderDialog();

    await userEvent.setup().click(screen.getByRole('button', { name: 'CHAT.RATING_DIALOG.SUBMIT' }));

    expect(requests).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
  });

  test('送信に失敗したらダイアログを開いたままにすること', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useFeedbackResponse(500);
    const { onClose } = renderDialog({ existingRating: 'GOOD' });

    await userEvent.setup().click(screen.getByRole('button', { name: 'CHAT.RATING_DIALOG.SUBMIT' }));

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test('キャンセルで送信せずに閉じること', async () => {
    const requests = useFeedbackResponse();
    const { onClose } = renderDialog({ existingRating: 'GOOD' });

    await userEvent.setup().click(screen.getByRole('button', { name: 'CHAT.RATING_DIALOG.CANCEL' }));

    expect(onClose).toHaveBeenCalled();
    expect(requests).toEqual([]);
  });
});
