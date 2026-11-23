import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { server } from '@/test/setup';
import { FIXTURE_TENANT_ADMIN, renderApp, setAuthUser } from '@/test/render-app';
import { useTemplateListStore } from '@/store/template-list-store';
import { useToastStore } from '@/components/shared/toast-store';

const FIXTURE_TEMPLATES = [
  {
    id: 't1',
    tenantId: 'tenant',
    name: '議事録テンプレート',
    description: '会議の議事録を作る',
    systemPrompt: 'あなたは書記です',
    groups: ['営業', '開発'],
    updatedAt: '2026-11-01T09:05:00',
  },
  {
    id: 't2',
    tenantId: 'tenant',
    name: '翻訳テンプレート',
    description: null,
    systemPrompt: '英訳してください',
    groups: [],
    updatedAt: '2026-10-01T12:00:00',
  },
];

const FIXTURE_GROUPS = [
  { id: 'g1', name: '営業' },
  { id: 'g2', name: '開発' },
  { id: 'g3', name: '総務' },
];

const LIST_PATH = mockPath(API_PATHS.ADMIN.PROMPT_TEMPLATES.LIST);

interface RequestLog {
  listParams: URLSearchParams[];
  created: unknown[];
  updated: { id: string; body: unknown }[];
  deleted: string[];
  groupAdds: { groupId: string; body: unknown }[];
  groupRemoves: { groupId: string; templateId: string }[];
}

/** 一覧・グループ・変更系の API を差し替え、受けたリクエストを記録する */
function mockApis(options: { createFails?: boolean } = {}): RequestLog {
  const log: RequestLog = {
    listParams: [],
    created: [],
    updated: [],
    deleted: [],
    groupAdds: [],
    groupRemoves: [],
  };
  server.use(
    http.get(LIST_PATH, ({ request }) => {
      log.listParams.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        content: FIXTURE_TEMPLATES,
        totalElements: 25,
        number: 0,
        size: 10,
      });
    }),
    http.get(mockPath(API_PATHS.ADMIN.GROUPS.LIST), () =>
      HttpResponse.json({ data: FIXTURE_GROUPS, total: 3, page: 0, size: 1000 }),
    ),
    http.post(LIST_PATH, async ({ request }) => {
      if (options.createFails) return HttpResponse.json({ message: 'ng' }, { status: 400 });
      const body = await request.json();
      log.created.push(body);
      return HttpResponse.json({ id: 'new1', tenantId: 'tenant', ...(body as object), groups: [] });
    }),
    http.patch(mockPath(API_PATHS.ADMIN.PROMPT_TEMPLATES.DETAIL(':id')), async ({ request, params }) => {
      const body = await request.json();
      log.updated.push({ id: String(params.id), body });
      return HttpResponse.json({ id: params.id, tenantId: 'tenant', ...(body as object), groups: [] });
    }),
    http.delete(mockPath(API_PATHS.ADMIN.PROMPT_TEMPLATES.DETAIL(':id')), ({ params }) => {
      log.deleted.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(mockPath(API_PATHS.ADMIN.GROUPS.TEMPLATES(':groupId')), async ({ request, params }) => {
      log.groupAdds.push({ groupId: String(params.groupId), body: await request.json() });
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(
      mockPath(API_PATHS.ADMIN.GROUPS.TEMPLATE_DETAIL(':groupId', ':templateId')),
      ({ params }) => {
        log.groupRemoves.push({ groupId: String(params.groupId), templateId: String(params.templateId) });
        return new HttpResponse(null, { status: 204 });
      },
    ),
  );
  return log;
}

async function renderPage() {
  setAuthUser(FIXTURE_TENANT_ADMIN);
  const result = renderApp('/admin/templates');
  await screen.findByText('議事録テンプレート');
  return result;
}

beforeEach(() => {
  useTemplateListStore.getState().reset();
  useToastStore.getState().clear();
});

afterEach(() => {
  setAuthUser(null);
});

describe('AdminTemplateListPage', () => {
  describe('一覧の表示', () => {
    test('テンプレートの名前・説明・所属チーム・更新日時が表示されること', async () => {
      mockApis();
      await renderPage();

      expect(screen.getByText('会議の議事録を作る')).toBeInTheDocument();
      expect(screen.getByText('営業, 開発')).toBeInTheDocument();
      expect(screen.getByText('2026/11/01 09:05')).toBeInTheDocument();
      // 件数表示（テストでは i18n 未初期化のため t() はキーを返す）
      expect(screen.getByText('TEMPLATES.PAGE_COUNT')).toBeInTheDocument();
    });

    test('テンプレートが 0 件のとき、見つからない旨を表示すること', async () => {
      setAuthUser(FIXTURE_TENANT_ADMIN);
      renderApp('/admin/templates');
      expect(await screen.findByText('TEMPLATES.NO_DATA')).toBeInTheDocument();
    });

    test('初期表示では更新日時の降順で 1 ページ目を取得すること', async () => {
      const log = mockApis();
      await renderPage();

      const params = log.listParams[0];
      expect(params.get('page')).toBe('0');
      expect(params.get('size')).toBe('10');
      expect(params.get('sort')).toBe('updatedAt,desc');
    });
  });

  describe('ページ送り', () => {
    test('総件数が減って現在のページが範囲外になったら最終ページへ戻ること', async () => {
      server.use(
        http.get(LIST_PATH, () =>
          HttpResponse.json({ content: FIXTURE_TEMPLATES, totalElements: 5, number: 0, size: 10 }),
        ),
      );
      useTemplateListStore.getState().updatePageIndex(3);
      setAuthUser(FIXTURE_TENANT_ADMIN);
      renderApp('/admin/templates');

      await waitFor(() => expect(useTemplateListStore.getState().filter.pageIndex).toBe(1));
    });
  });

  describe('検索・絞り込み', () => {
    test('検索ワードを入力すると search を付けて取得し直すこと', async () => {
      const log = mockApis();
      await renderPage();

      await userEvent.type(screen.getByPlaceholderText('TEMPLATES.SEARCH_PLACEHOLDER'), 'a');

      await waitFor(() => expect(log.listParams.some((p) => p.get('search') === 'a')).toBe(true));
    });
  });

  describe('作成', () => {
    test('名前とシステムプロンプトを入力して作成できること', async () => {
      const log = mockApis();
      await renderPage();

      await userEvent.click(screen.getByText('TEMPLATES.ADD_TEMPLATE'));
      const confirm = await screen.findByTestId('dialog-confirm-button');
      expect(confirm).toBeDisabled();

      await userEvent.type(screen.getByPlaceholderText('TEMPLATES.NAME_PLACEHOLDER'), ' 新規 ');
      await userEvent.type(screen.getByPlaceholderText('TEMPLATES.SYSTEM_PROMPT_PLACEHOLDER'), 'プロンプト');
      await waitFor(() => expect(confirm).toBeEnabled());
      await userEvent.click(confirm);

      await waitFor(() => expect(log.created).toHaveLength(1));
      expect(log.created[0]).toEqual({ name: '新規', systemPrompt: 'プロンプト', description: '' });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
        'TEMPLATES.CREATE_SUCCESS',
      );
    });

    test('名前が 100 文字を超えるとエラーを表示して作成できないこと', async () => {
      mockApis();
      await renderPage();

      await userEvent.click(screen.getByText('TEMPLATES.ADD_TEMPLATE'));
      const nameInput = await screen.findByPlaceholderText('TEMPLATES.NAME_PLACEHOLDER');
      await userEvent.click(nameInput);
      await userEvent.paste('あ'.repeat(101));
      await userEvent.type(screen.getByPlaceholderText('TEMPLATES.SYSTEM_PROMPT_PLACEHOLDER'), 'p');
      await userEvent.click(nameInput);
      await userEvent.tab();

      expect(await screen.findByText('VALIDATION.MAX_LENGTH')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-confirm-button')).toBeDisabled();
    });

    test('作成に失敗したらエラーのトーストを出し、ダイアログを閉じないこと', async () => {
      mockApis({ createFails: true });
      await renderPage();

      await userEvent.click(screen.getByText('TEMPLATES.ADD_TEMPLATE'));
      await userEvent.type(await screen.findByPlaceholderText('TEMPLATES.NAME_PLACEHOLDER'), 'n');
      await userEvent.type(screen.getByPlaceholderText('TEMPLATES.SYSTEM_PROMPT_PLACEHOLDER'), 'p');
      await userEvent.click(screen.getByTestId('dialog-confirm-button'));

      await waitFor(() =>
        expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
          'TEMPLATES.CREATE_FAILED',
        ),
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('編集', () => {
    test('既存の値が入った状態で開き、保存すると更新されること（チームは変更なし）', async () => {
      const log = mockApis();
      await renderPage();

      await userEvent.click(screen.getByTestId('template-menu-t1'));
      await userEvent.click(await screen.findByText('TEMPLATES.EDIT_ACTION'));

      const nameInput = await screen.findByPlaceholderText('TEMPLATES.NAME_PLACEHOLDER');
      expect(nameInput).toHaveValue('議事録テンプレート');
      await userEvent.type(nameInput, '改');
      await userEvent.click(screen.getByTestId('dialog-confirm-button'));

      await waitFor(() => expect(log.updated).toHaveLength(1));
      expect(log.updated[0]).toEqual({
        id: 't1',
        body: {
          name: '議事録テンプレート改',
          systemPrompt: 'あなたは書記です',
          description: '会議の議事録を作る',
        },
      });
      expect(log.groupAdds).toHaveLength(0);
      expect(log.groupRemoves).toHaveLength(0);
    });
  });

  describe('削除', () => {
    test('選択したテンプレートをまとめて削除できること', async () => {
      const log = mockApis();
      await renderPage();

      const rows = screen.getAllByRole('checkbox');
      // 先頭の 2 つは PC・モバイルの全選択。その後ろが各行
      await userEvent.click(rows[2]);
      await userEvent.click(rows[3]);
      await userEvent.click(await screen.findByText('TEMPLATES.DELETE_SELECTED'));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('TEMPLATES.DELETE_TEMPLATE_MESSAGE')).toBeInTheDocument();
      await userEvent.click(within(dialog).getByTestId('dialog-confirm-button'));

      await waitFor(() => expect(log.deleted.sort()).toEqual(['t1', 't2']));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByText('TEMPLATES.ADD_TEMPLATE')).toBeInTheDocument();
    });

    test('行のメニューから削除すると、そのテンプレートだけ削除されること', async () => {
      const log = mockApis();
      await renderPage();

      await userEvent.click(screen.getByTestId('template-menu-t2'));
      await userEvent.click(await screen.findByText('TEMPLATES.DELETE_ACTION'));
      await userEvent.click(await screen.findByTestId('dialog-confirm-button'));

      await waitFor(() => expect(log.deleted).toEqual(['t2']));
    });
  });
});
