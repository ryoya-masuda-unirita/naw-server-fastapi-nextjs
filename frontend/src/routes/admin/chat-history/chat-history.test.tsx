import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { server } from '@/test/setup';
import { FIXTURE_TENANT_ADMIN, renderApp, setAuthUser } from '@/test/render-app';
import { useChatHistoryStore } from '@/store/chat-history-store';

const FIXTURE_HISTORIES = [
  {
    id: 'r1',
    name: '議事録の相談',
    defaultAssistantId: 'a1',
    userId: 'u1',
    userName: '田中',
    indexIds: [],
    createdAt: '2026-11-01T09:00:00+09:00',
    updatedAt: '2026-11-01T09:05:00',
    shareUrl: null,
    rating: null,
  },
  {
    id: 'r2',
    name: null,
    defaultAssistantId: 'a1',
    userId: 'u2',
    userName: '鈴木',
    indexIds: [],
    createdAt: '2026-10-01T12:00:00+09:00',
    updatedAt: '2026-10-01T12:00:00',
    shareUrl: null,
    rating: null,
  },
];

const LIST_PATH = mockPath(API_PATHS.ADMIN.HISTORIES.LIST);

/** 一覧 API を差し替え、受けたクエリを記録する */
function mockList(totalElements = 45): URLSearchParams[] {
  const received: URLSearchParams[] = [];
  server.use(
    http.get(LIST_PATH, ({ request }) => {
      received.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        content: FIXTURE_HISTORIES,
        totalElements,
        number: 0,
        size: 20,
      });
    }),
  );
  return received;
}

async function renderPage() {
  setAuthUser(FIXTURE_TENANT_ADMIN);
  const result = renderApp('/admin/chat-history');
  await screen.findByText('議事録の相談');
  return result;
}

beforeEach(() => {
  useChatHistoryStore.getState().reset();
});

afterEach(() => {
  setAuthUser(null);
});

describe('ChatHistoryPage', () => {
  describe('一覧の表示', () => {
    test('チャット名・更新者名・更新日時と件数が表示されること', async () => {
      mockList();
      await renderPage();

      expect(screen.getByText('田中')).toBeInTheDocument();
      expect(screen.getByText('2026/11/01 09:05')).toBeInTheDocument();
      expect(screen.getAllByTestId('admin-chat-history-list-row')).toHaveLength(2);
      // テストでは i18n 未初期化のため t() はキーを返す
      expect(screen.getByText('CHAT_HISTORY.PAGE_COUNT')).toBeInTheDocument();
    });

    test('履歴が 0 件のとき、見つからない旨を表示すること', async () => {
      setAuthUser(FIXTURE_TENANT_ADMIN);
      renderApp('/admin/chat-history');
      expect(await screen.findByText('CHAT_HISTORY.NO_DATA')).toBeInTheDocument();
    });

    test('初期表示では更新日時の降順で 1 ページ目を 20 件取得すること', async () => {
      const received = mockList();
      await renderPage();

      const params = received[0];
      expect(params.get('page')).toBe('0');
      expect(params.get('size')).toBe('20');
      expect(params.get('orderBy')).toBe('updatedAt');
      expect(params.get('reverse')).toBe('true');
      expect(params.get('createdAtFrom')).toBeNull();
    });
  });

  describe('詳細への遷移', () => {
    test('行の矢印ボタンで詳細画面へ移動すること', async () => {
      mockList();
      const { router } = await renderPage();

      await userEvent.click(screen.getAllByTestId('admin-chat-history-detail-button')[0]);

      expect(router.state.location.pathname).toBe('/admin/chat-history/r1');
      expect(router.state.location.state).toEqual({
        roomName: '議事録の相談',
        userName: '田中',
        userId: 'u1',
      });
    });
  });

  describe('検索・絞り込み', () => {
    test('検索ワードを入力すると name を付けて取得し直すこと', async () => {
      const received = mockList();
      await renderPage();

      await userEvent.type(screen.getByTestId('admin-chat-history-search-input'), 'a');

      await waitFor(() => expect(received.some((p) => p.get('name') === 'a')).toBe(true));
    });

    test('チャット名順を選ぶと orderBy が name になること', async () => {
      const received = mockList();
      await renderPage();

      await userEvent.click(screen.getByTestId('admin-chat-history-sort-trigger'));
      const options = screen.getAllByTestId('admin-chat-history-sort-field-option');
      await userEvent.click(options[2]);

      await waitFor(() => expect(received.some((p) => p.get('orderBy') === 'name')).toBe(true));
    });

    test('期間に今日を選ぶと ISO 8601 のオフセット付きで開始と終了を送ること', async () => {
      const received = mockList();
      await renderPage();

      await userEvent.click(screen.getByTestId('admin-chat-history-period-trigger'));
      await userEvent.click(screen.getAllByTestId('admin-chat-history-period-option')[1]);

      await waitFor(() => expect(received.some((p) => p.get('createdAtFrom') !== null)).toBe(true));
      const params = received.find((p) => p.get('createdAtFrom') !== null);
      const from = new Date(params?.get('createdAtFrom') ?? '');
      const to = new Date(params?.get('createdAtTo') ?? '');
      expect(params?.get('createdAtFrom')).toMatch(/Z$/);
      // 終了は翌日の 0:00（排他）。サマータイムの日は 23〜25 時間後になる
      expect(to.getTime()).toBeGreaterThan(from.getTime());
    });

    test('ユーザーを選ぶと userId を付けて取得し直すこと', async () => {
      const received = mockList();
      await renderPage();

      await userEvent.click(screen.getByTestId('admin-chat-history-user-trigger'));
      await userEvent.click((await screen.findAllByTestId('admin-chat-history-user-option'))[0]);

      await waitFor(() => expect(received.some((p) => p.get('userId') === 'u1')).toBe(true));
    });
  });

  describe('ページ送り', () => {
    test('ストアのページ位置を page（0 始まり）で送ること', async () => {
      useChatHistoryStore.getState().updatePageIndex(3);
      const received = mockList();
      setAuthUser(FIXTURE_TENANT_ADMIN);
      renderApp('/admin/chat-history');

      await screen.findByText('議事録の相談');
      expect(received[0].get('page')).toBe('2');
    });
  });
});
