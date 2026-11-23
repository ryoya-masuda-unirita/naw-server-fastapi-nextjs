import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { useViewerStore } from '@/store/viewer-store';
import { server } from '@/test/setup';
import { ChatSummary } from './chat-summary';

const FIXTURE_VIEWERS = [
  { id: 'l1', title: '資料1' },
  { id: 'l2', title: '資料2' },
];

function renderSummary(props: Partial<React.ComponentProps<typeof ChatSummary>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatSummary chatId="r1" headerOptions={FIXTURE_VIEWERS} {...props} />
    </QueryClientProvider>,
  );
}

function setLoadedState(overrides: Partial<ReturnType<typeof useViewerStore.getState>> = {}) {
  useViewerStore.setState({
    viewers: FIXTURE_VIEWERS,
    activeLibrary: FIXTURE_VIEWERS[1],
    markdownContent: '# 本文',
    listLoadedRoomId: 'r1',
    ...overrides,
  });
}

beforeEach(() => {
  useViewerStore.getState().reset();
});

describe('ChatSummary', () => {
  describe('表示', () => {
    test('選択中の資料のタイトルと Markdown の本文が出ること', () => {
      setLoadedState();

      renderSummary();

      expect(screen.getByRole('button', { name: 'CHAT.VIEWER.CHANGE_DOC' })).toHaveTextContent('資料2');
      expect(screen.getByRole('heading', { name: '本文' })).toBeInTheDocument();
    });

    test('一覧が空なら「ライブラリがありません」を出し、ビューワーを自動で閉じること', async () => {
      setLoadedState({ viewers: [], activeLibrary: null });
      const onCollapseChange = vi.fn();

      renderSummary({ headerOptions: [], onCollapseChange });

      await waitFor(() => expect(onCollapseChange).toHaveBeenCalledWith(true));
      expect(screen.getByRole('button', { name: 'CHAT.VIEWER.OPEN' })).toBeInTheDocument();
    });

    test('一覧の取得に失敗していたらエラー文言を出すこと', () => {
      setLoadedState({ listLoadError: true });

      renderSummary();

      expect(screen.getByText('CHAT.VIEWER.LOAD_ERROR')).toBeInTheDocument();
    });

    test('本文の取得に失敗していたらエラー文言を出すこと', () => {
      setLoadedState({ contentLoadError: true });

      renderSummary();

      expect(screen.getByText('CHAT.VIEWER.CONTENT_LOAD_ERROR')).toBeInTheDocument();
    });

    test('詳細画面では折りたたみボタンを出さないこと', () => {
      setLoadedState();

      renderSummary({ isDetailPage: true });

      expect(screen.queryByRole('button', { name: 'CHAT.VIEWER.CLOSE' })).not.toBeInTheDocument();
    });

    test('閲覧専用ではその他メニューのボタンを出さないこと', () => {
      setLoadedState();

      renderSummary({ isReadOnly: true });

      expect(screen.queryByTestId('library-summary-more-button')).not.toBeInTheDocument();
    });

    test('このルームのライブラリを生成中は、折りたたんでいても開き、生成中のタイトルを出すこと', async () => {
      setLoadedState({
        viewers: [],
        activeLibrary: null,
        isLibraryStreaming: true,
        streamingRoomId: 'r1',
        streamingLibraryTitle: '生成中の資料',
      });
      const onCollapseChange = vi.fn();

      renderSummary({ headerOptions: [], onCollapseChange });

      expect(screen.getByRole('button', { name: 'CHAT.VIEWER.CHANGE_DOC' })).toHaveTextContent(
        '生成中の資料',
      );
      expect(screen.queryByText('CHAT.VIEWER.EMPTY')).not.toBeInTheDocument();
    });
  });

  describe('操作', () => {
    test('折りたたみボタンで閉じ・開きを切り替え、変更を通知すること', async () => {
      setLoadedState();
      const onCollapseChange = vi.fn();
      renderSummary({ onCollapseChange });
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'CHAT.VIEWER.CLOSE' }));
      expect(onCollapseChange).toHaveBeenLastCalledWith(true);
      expect(screen.queryByRole('heading', { name: '本文' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'CHAT.VIEWER.OPEN' }));
      expect(onCollapseChange).toHaveBeenLastCalledWith(false);
      expect(screen.getByRole('heading', { name: '本文' })).toBeInTheDocument();
    });

    test('タイトルのメニューから別の資料を選ぶと、その本文を取得して表示すること', async () => {
      setLoadedState();
      server.use(
        http.get(mockPath(API_PATHS.LIBRARY.DETAIL('l1')), () =>
          HttpResponse.json({ id: 'l1', title: '資料1', assistant: null }),
        ),
        http.get(mockPath(API_PATHS.VIEWER.CONTENT('l1')), () =>
          HttpResponse.json({ data: '# 一つ目' }),
        ),
      );
      renderSummary();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'CHAT.VIEWER.CHANGE_DOC' }));
      await user.click(screen.getByRole('menuitem', { name: '資料1' }));

      expect(await screen.findByRole('heading', { name: '一つ目' })).toBeInTheDocument();
      expect(useViewerStore.getState().activeLibrary?.id).toBe('l1');
    });

    test('「新しいタブで開く」で、選択中の資料つきのビューワーの URL を開くこと', async () => {
      setLoadedState();
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      renderSummary();
      const user = userEvent.setup();

      await user.click(screen.getByTestId('library-summary-more-button'));
      await user.click(screen.getByRole('menuitem', { name: 'CHAT.VIEWER.OPEN_NEW_TAB' }));

      expect(open).toHaveBeenCalledWith('/chat/viewer/r1?libraryId=l2', '_blank');
    });

    test('ライブラリ生成中は「ライブラリに保存」を押せないこと', () => {
      setLoadedState({ isLibraryStreaming: true, streamingRoomId: 'r1' });

      renderSummary();

      expect(screen.getByTestId('library-save-button')).toBeDisabled();
    });
  });

  describe('ライブラリに保存', () => {
    test('名前・タグ・チームを PUT で保存し、一覧のタイトルを更新してダイアログを閉じること', async () => {
      setLoadedState();
      let putBody: unknown = null;
      server.use(
        http.get(mockPath(API_PATHS.GROUPS.LIST), () => HttpResponse.json([])),
        http.get(mockPath(API_PATHS.LIBRARIES.TAGS), () => HttpResponse.json({ tags: [] })),
        http.put(mockPath(API_PATHS.LIBRARIES.UPDATE(':libraryId')), async ({ request }) => {
          putBody = await request.json();
          return HttpResponse.json({ data: { id: 'l2' } });
        }),
      );
      const onSaveLibrary = vi.fn();
      renderSummary({ onSaveLibrary });
      const user = userEvent.setup();

      await user.click(screen.getByTestId('library-summary-more-button'));
      await user.click(screen.getByTestId('library-save-button'));
      const nameInput = await screen.findByTestId('library-content-name-input');
      expect(nameInput).toHaveValue('資料2');
      await user.clear(nameInput);
      await user.type(nameInput, ' 保存した名前 ');
      await user.click(screen.getByRole('button', { name: 'CHAT.VIEWER.SAVE_LIBRARY_DIALOG.SAVE' }));

      await waitFor(() => expect(onSaveLibrary).toHaveBeenCalled());
      expect(putBody).toEqual({ name: '保存した名前', tags: [], groups: [] });
      expect(useViewerStore.getState().activeLibrary?.title).toBe('保存した名前');
      await waitFor(() =>
        expect(screen.queryByTestId('library-content-name-input')).not.toBeInTheDocument(),
      );
    });

    test('名前が空だと保存できないこと', async () => {
      setLoadedState();
      server.use(
        http.get(mockPath(API_PATHS.GROUPS.LIST), () => HttpResponse.json([])),
        http.get(mockPath(API_PATHS.LIBRARIES.TAGS), () => HttpResponse.json({ tags: [] })),
      );
      renderSummary();
      const user = userEvent.setup();

      await user.click(screen.getByTestId('library-summary-more-button'));
      await user.click(screen.getByTestId('library-save-button'));
      await user.clear(await screen.findByTestId('library-content-name-input'));

      expect(
        screen.getByRole('button', { name: 'CHAT.VIEWER.SAVE_LIBRARY_DIALOG.SAVE' }),
      ).toBeDisabled();
    });

    test('保存に失敗したらダイアログを開いたままにすること', async () => {
      setLoadedState();
      server.use(
        http.get(mockPath(API_PATHS.GROUPS.LIST), () => HttpResponse.json([])),
        http.get(mockPath(API_PATHS.LIBRARIES.TAGS), () => HttpResponse.json({ tags: [] })),
        http.put(mockPath(API_PATHS.LIBRARIES.UPDATE(':libraryId')), () =>
          HttpResponse.json({}, { status: 500 }),
        ),
      );
      const onSaveLibrary = vi.fn();
      renderSummary({ onSaveLibrary });
      const user = userEvent.setup();

      await user.click(screen.getByTestId('library-summary-more-button'));
      await user.click(screen.getByTestId('library-save-button'));
      await screen.findByTestId('library-content-name-input');
      await user.click(screen.getByRole('button', { name: 'CHAT.VIEWER.SAVE_LIBRARY_DIALOG.SAVE' }));

      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'CHAT.VIEWER.SAVE_LIBRARY_DIALOG.SAVE' }),
        ).toBeEnabled(),
      );
      expect(onSaveLibrary).not.toHaveBeenCalled();
      expect(screen.getByTestId('library-content-name-input')).toBeInTheDocument();
    });
  });
});
