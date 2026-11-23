import { afterEach, describe, expect, test, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { server } from '@/test/setup';
import { FIXTURE_TENANT_ADMIN, renderApp, setAuthUser } from '@/test/render-app';

const FIXTURE_FOLDERS = [
  { id: 'folder-1', name: 'フォルダA' },
  { id: 'folder-2', name: 'フォルダB' },
];

const PAGE_META = { totalElements: 12, number: 0, size: 5, totalPages: 3 };

const FIXTURE_ACCURACY = {
  feedbacks: {
    content: [
      {
        id: 'fb1',
        tenantId: 't',
        userId: 'u1',
        messageId: 'm1',
        message: {
          assistantId: 'a1',
          assistantName: '営業アシスタント',
          content: {
            question: '**見積**の<b>出し方</b>は?',
            answer: '[手順](http://x)を確認',
          },
        },
        rating: 'GOOD',
        indexId: 'folder-1',
        createdAt: '2026-11-01T09:05:00',
        updatedAt: '2026-11-01T09:05:00',
      },
      {
        id: 'fb2',
        tenantId: 't',
        userId: 'u1',
        messageId: 'm2',
        message: {
          assistantId: null,
          assistantName: null,
          content: { question: '質問2', answer: '回答2' },
        },
        rating: 'BAD',
        indexId: null,
        createdAt: '2026-10-01T12:00:00',
        updatedAt: '2026-10-01T12:00:00',
      },
    ],
    ...PAGE_META,
    numberOfElements: 2,
  },
  assistantIdToServerMap: {},
};

const FIXTURE_SATISFACTION = {
  feedbacks: {
    content: [
      {
        id: 'rf1',
        tenantId: 't',
        userId: 'u1',
        userName: '山田太郎',
        roomId: 'room1',
        room: {
          id: 'room1',
          name: '見積相談',
          defaultAssistantId: 'a1',
          defaultAssistantName: '営業アシスタント',
          rating: 'VERY_GOOD',
        },
        rating: 'VERY_GOOD',
        indexId: 'folder-2',
        createdAt: '2026-11-02T10:00:00',
        updatedAt: '2026-11-02T10:00:00',
      },
    ],
    ...PAGE_META,
    numberOfElements: 1,
  },
};

const FIXTURE_USERS = {
  feedbacks: {
    content: [
      {
        user: { id: 'uuid1', userId: 'taro', displayName: 'feedback側の名前' },
        responded: true,
        isResponded: true,
        feedbackMessageCount: 7,
        feedbackRoomCount: {
          excellent: 5,
          veryGood: 4,
          good: 3,
          average: 2,
          poor: 1,
        },
        updatedAt: '2026-11-03T08:30:00',
      },
    ],
    ...PAGE_META,
    numberOfElements: 1,
  },
};

/** 直近の追加学習で FormData に追加した項目（content はファイル名） */
const pending: { fields: Record<string, string> } = { fields: {} };

interface RequestLog {
  accuracy: URLSearchParams[];
  satisfaction: URLSearchParams[];
  users: URLSearchParams[];
  learning: {
    indexId: string;
    fields: Record<string, string>;
    fileName: string;
  }[];
}

/** 一覧・選択肢・追加学習の API を差し替え、受けたリクエストを記録する */
function mockApis(options: { learningFails?: boolean } = {}): RequestLog {
  const log: RequestLog = {
    accuracy: [],
    satisfaction: [],
    users: [],
    learning: [],
  };
  // jsdom の Blob は fetch に渡すと本文が空になるため、サーバー側では読まず、送る前の FormData への追加を記録する
  const originalAppend = FormData.prototype.append;
  vi.spyOn(FormData.prototype, 'append').mockImplementation(function (
    this: FormData,
    name: string,
    value: string | Blob,
    fileName?: string,
  ) {
    pending.fields[name] = typeof value === 'string' ? value : ((value as File).name ?? '');
    return Reflect.apply(
      originalAppend,
      this,
      fileName === undefined ? [name, value] : [name, value, fileName],
    );
  });
  server.use(
    http.get(mockPath(API_PATHS.ADMIN.FEEDBACK_MESSAGES.LIST), ({ request }) => {
      log.accuracy.push(new URL(request.url).searchParams);
      return HttpResponse.json(FIXTURE_ACCURACY);
    }),
    http.get(mockPath(API_PATHS.ADMIN.FEEDBACK_ROOMS.LIST), ({ request }) => {
      log.satisfaction.push(new URL(request.url).searchParams);
      return HttpResponse.json(FIXTURE_SATISFACTION);
    }),
    http.get(mockPath(API_PATHS.ADMIN.FEEDBACK_USERS.LIST), ({ request }) => {
      log.users.push(new URL(request.url).searchParams);
      return HttpResponse.json(FIXTURE_USERS);
    }),
    http.get(mockPath(API_PATHS.ADMIN.ASSISTANTS.LIST), () =>
      HttpResponse.json({
        content: [{ id: 'a1', name: '営業アシスタント' }],
        totalElements: 1,
        number: 0,
        size: 20,
      }),
    ),
    http.get(mockPath(API_PATHS.INDEXES.LIST), () =>
      HttpResponse.json({
        content: FIXTURE_FOLDERS,
        totalElements: 2,
        number: 0,
        size: 20,
      }),
    ),
    http.get(mockPath(API_PATHS.ADMIN.USERS.LIST), () =>
      HttpResponse.json({
        content: [
          {
            id: 'uuid1',
            loginId: 'taro',
            name: '管理画面側の名前',
            role: 'USER',
          },
        ],
        totalElements: 1,
        number: 0,
        size: 5,
      }),
    ),
    http.post(mockPath(API_PATHS.INDEXES.ADDITIONAL_LEARNING(':indexId')), ({ params }) => {
      if (options.learningFails) return HttpResponse.json({ message: 'ng' }, { status: 500 });
      const { content, ...fields } = pending.fields;
      log.learning.push({
        indexId: String(params.indexId),
        fields,
        fileName: content ?? '',
      });
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return log;
}

afterEach(() => {
  setAuthUser(null);
  pending.fields = {};
  vi.restoreAllMocks();
});

async function renderTab(tab: 'accuracy' | 'satisfaction' | 'count', waitFor: string) {
  setAuthUser(FIXTURE_TENANT_ADMIN);
  const result = renderApp(`/admin/feedback?tab=${tab}`);
  await screen.findByText(waitFor);
  return result;
}

describe('AdminFeedbackListPage', () => {
  describe('タブ', () => {
    test('タブの指定がなければ回答精度評価タブを表示し、タブで切り替えられること', async () => {
      mockApis();
      setAuthUser(FIXTURE_TENANT_ADMIN);
      const { router } = renderApp('/admin/feedback');

      expect(await screen.findByText('FEEDBACK.ACCURACY_DESCRIPTION')).toBeInTheDocument();
      await waitFor(() => expect(router.state.location.search).toBe('?tab=accuracy'));

      await userEvent.click(screen.getAllByText('FEEDBACK.TAB_COUNT')[0]);
      expect(await screen.findByText('FEEDBACK.COUNT_DESCRIPTION')).toBeInTheDocument();
      expect(router.state.location.search).toBe('?tab=count');

      await userEvent.click(screen.getAllByText('FEEDBACK.TAB_SATISFACTION')[0]);
      expect(await screen.findByText('FEEDBACK.SATISFACTION_DESCRIPTION')).toBeInTheDocument();
    });
  });

  describe('回答精度評価タブ', () => {
    test('評価の一覧が表示されること', async () => {
      mockApis();
      await renderTab('accuracy', '営業アシスタント');

      // HTML・Markdown の記号は取り除いて 1 行にする
      expect(screen.getByText('見積 の 出し方 は?')).toBeInTheDocument();
      expect(screen.getByText('手順を確認')).toBeInTheDocument();
      expect(screen.getByText('FEEDBACK.ACCURATE')).toBeInTheDocument();
      expect(screen.getByText('FEEDBACK.INACCURATE')).toBeInTheDocument();
      expect(screen.getByText('2026/11/01 09:05')).toBeInTheDocument();
      expect(screen.getByText('ON')).toBeInTheDocument();
      expect(screen.getByText('OFF')).toBeInTheDocument();
      expect(await screen.findByText('フォルダA')).toBeInTheDocument();
      expect(screen.getByText('FEEDBACK.PAGE_COUNT')).toBeInTheDocument();
    });

    test('アシスタント名がないときは不明なアシスタントと表示すること', async () => {
      mockApis();
      await renderTab('accuracy', '営業アシスタント');

      expect(screen.getByText('CHAT.MESSAGE.UNKNOWN_ASSISTANT')).toBeInTheDocument();
    });

    test('0 件のときはデータなしと表示すること', async () => {
      setAuthUser(FIXTURE_TENANT_ADMIN);
      renderApp('/admin/feedback?tab=accuracy');

      expect(await screen.findByText('FEEDBACK.NO_DATA')).toBeInTheDocument();
    });

    test('初期表示では更新日時の降順で 1 ページ目を 5 件取得すること', async () => {
      const log = mockApis();
      await renderTab('accuracy', '営業アシスタント');

      const params = log.accuracy[0];
      expect(params.get('page')).toBe('0');
      expect(params.get('size')).toBe('5');
      expect(params.get('sortField')).toBe('updatedAt');
      expect(params.get('sortOrder')).toBe('desc');
      expect(params.has('rating')).toBe(false);
      expect(params.has('assistantId')).toBe(false);
      expect(params.has('folderId')).toBe(false);
    });

    test('精度で絞り込むと rating を付けて取得し直すこと', async () => {
      const log = mockApis();
      await renderTab('accuracy', '営業アシスタント');

      await userEvent.click(screen.getByText('FEEDBACK.ALL_ACCURACY'));
      await userEvent.click(await screen.findByRole('option', { name: 'FEEDBACK.INACCURATE' }));

      await waitFor(() => expect(log.accuracy.some((p) => p.get('rating') === 'BAD')).toBe(true));
    });

    test('アシスタントで絞り込むと assistantId を付けて取得し直すこと', async () => {
      const log = mockApis();
      await renderTab('accuracy', '営業アシスタント');

      await userEvent.click(screen.getByTestId('feedback-assistant-trigger'));
      const options = await screen.findAllByTestId('feedback-assistant-option');
      await userEvent.click(
        options.find((option) => option.textContent?.includes('営業アシスタント'))!,
      );

      await waitFor(() =>
        expect(log.accuracy.some((p) => p.get('assistantId') === 'a1')).toBe(true),
      );
    });

    test('並べ替えの項目を変えると sortField を変えて取得し直すこと', async () => {
      const log = mockApis();
      await renderTab('accuracy', '営業アシスタント');

      await userEvent.click(screen.getByTestId('feedback-sort-trigger'));
      const fieldOptions = await screen.findAllByTestId('feedback-sort-field-option');
      await userEvent.click(fieldOptions[1]);

      await waitFor(() =>
        expect(log.accuracy.some((p) => p.get('sortField') === 'name')).toBe(true),
      );
    });

    test('学習先フォルダを選んで追加学習すると feedbackId を送り、ダイアログを閉じること', async () => {
      const log = mockApis();
      await renderTab('accuracy', '営業アシスタント');

      await userEvent.click(screen.getByTestId('feedback-menu-fb1'));
      await userEvent.click(await screen.findByText('FEEDBACK.SPECIFY_FOLDER'));

      // 行の学習先フォルダが初期選択される
      const confirm = await screen.findByTestId('dialog-confirm-button');
      expect(confirm).toBeEnabled();
      await userEvent.click(confirm);

      await waitFor(() => expect(log.learning).toHaveLength(1));
      expect(log.learning[0].indexId).toBe('folder-1');
      expect(log.learning[0].fields).toEqual({ feedbackId: 'fb1' });
      expect(log.learning[0].fileName).toBe('追加学習_fb1.md');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      // 登録後は一覧を読み直す
      await waitFor(() => expect(mockCalls(log.accuracy)).toBeGreaterThanOrEqual(2));
    });

    test('学習先フォルダが未選択の行では追加学習を押せないこと', async () => {
      mockApis();
      await renderTab('accuracy', '営業アシスタント');

      await userEvent.click(screen.getByTestId('feedback-menu-fb2'));
      await userEvent.click(await screen.findByText('FEEDBACK.SPECIFY_FOLDER'));

      expect(await screen.findByTestId('dialog-confirm-button')).toBeDisabled();
    });

    test('追加学習に失敗したらダイアログを開いたままにすること', async () => {
      const log = mockApis({ learningFails: true });
      await renderTab('accuracy', '営業アシスタント');

      await userEvent.click(screen.getByTestId('feedback-menu-fb1'));
      await userEvent.click(await screen.findByText('FEEDBACK.SPECIFY_FOLDER'));
      await userEvent.click(await screen.findByTestId('dialog-confirm-button'));

      await waitFor(() => expect(screen.getByTestId('dialog-confirm-button')).toBeEnabled());
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(log.learning).toHaveLength(0);
    });
  });

  describe('チャット満足度タブ', () => {
    test('満足度の一覧が表示されること', async () => {
      mockApis();
      await renderTab('satisfaction', '見積相談');

      expect(screen.getByText('★★★★☆')).toBeInTheDocument();
      expect(screen.getByText('営業アシスタント')).toBeInTheDocument();
      expect(screen.getByText('山田太郎')).toBeInTheDocument();
      expect(screen.getByText('2026/11/02 10:00')).toBeInTheDocument();
      expect(screen.getByText('ON')).toBeInTheDocument();
      expect(await screen.findByText('フォルダB')).toBeInTheDocument();
    });

    test('初期表示では更新日時の降順で 1 ページ目を 5 件取得すること', async () => {
      const log = mockApis();
      await renderTab('satisfaction', '見積相談');

      const params = log.satisfaction[0];
      expect(params.get('page')).toBe('0');
      expect(params.get('size')).toBe('5');
      expect(params.get('sortField')).toBe('updatedAt');
      expect(params.get('sortOrder')).toBe('desc');
      expect(params.has('rating')).toBe(false);
    });

    test('満足度で絞り込むと rating を付けて取得し直すこと', async () => {
      const log = mockApis();
      await renderTab('satisfaction', '見積相談');

      await userEvent.click(screen.getByText('FEEDBACK.ALL_SATISFACTION'));
      await userEvent.click(await screen.findByRole('option', { name: '★★★☆☆' }));

      await waitFor(() =>
        expect(log.satisfaction.some((p) => p.get('rating') === 'GOOD')).toBe(true),
      );
    });

    test('追加学習すると roomId を送ること', async () => {
      const log = mockApis();
      await renderTab('satisfaction', '見積相談');

      await userEvent.click(screen.getByTestId('feedback-menu-rf1'));
      await userEvent.click(await screen.findByText('FEEDBACK.SPECIFY_FOLDER'));
      await userEvent.click(await screen.findByTestId('dialog-confirm-button'));

      await waitFor(() => expect(log.learning).toHaveLength(1));
      expect(log.learning[0].indexId).toBe('folder-2');
      expect(log.learning[0].fields).toEqual({ roomId: 'room1' });
      expect(log.learning[0].fileName).toBe('追加学習_ルーム_room1.md');
    });
  });

  describe('回答数一覧タブ', () => {
    test('ユーザーごとの回答数が表示され、表示名はユーザー管理の値を使うこと', async () => {
      mockApis();
      await renderTab('count', '管理画面側の名前');

      expect(screen.queryByText('feedback側の名前')).not.toBeInTheDocument();
      // 更新日時のあと、精度評価数・満足度 1〜5（poor → excellent の順）の回答数が並ぶ
      const row = screen.getByText('管理画面側の名前').closest('.table-list-row') as HTMLElement;
      const cells = Array.from(row.querySelectorAll('.table-list-date')).map(
        (cell) => cell.textContent,
      );
      expect(cells).toEqual(['2026/11/03 08:30', '7', '1', '2', '3', '4', '5']);
    });

    test('初期表示では更新日時の降順で 1 ページ目を 5 件取得すること', async () => {
      const log = mockApis();
      await renderTab('count', '管理画面側の名前');

      const params = log.users[0];
      expect(params.get('page')).toBe('0');
      expect(params.get('size')).toBe('5');
      expect(params.get('sortField')).toBe('updatedAt');
      expect(params.get('sortOrder')).toBe('desc');
      expect(params.has('responseStatus')).toBe(false);
      expect(params.has('satisfaction')).toBe(false);
    });

    test('回答状況で絞り込むと responseStatus を付けて取得し直すこと', async () => {
      const log = mockApis();
      await renderTab('count', '管理画面側の名前');

      await userEvent.click(screen.getByText('FEEDBACK.ALL_RESPONSES'));
      await userEvent.click(await screen.findByRole('option', { name: 'FEEDBACK.NO_RESPONSE' }));

      await waitFor(() =>
        expect(log.users.some((p) => p.get('responseStatus') === 'no_response')).toBe(true),
      );
    });

    test('満足度で絞り込むと satisfaction を付けて取得し直すこと', async () => {
      const log = mockApis();
      await renderTab('count', '管理画面側の名前');

      await userEvent.click(screen.getByText('FEEDBACK.ALL_SATISFACTION'));
      await userEvent.click(await screen.findByRole('option', { name: '★★★★★' }));

      await waitFor(() =>
        expect(log.users.some((p) => p.get('satisfaction') === 'star5')).toBe(true),
      );
    });
  });
});

function mockCalls(requests: URLSearchParams[]): number {
  return requests.length;
}
