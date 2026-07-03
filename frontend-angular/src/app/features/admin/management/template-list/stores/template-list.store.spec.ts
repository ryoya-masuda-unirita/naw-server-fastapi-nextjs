import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TemplateListStore } from './template-list.store';
import { TemplateListApiService } from '../services/template-list-api.service';
import type { TemplateApiItem, TemplateApiResponse } from '@app-types/admin/template.types';

const makeApiItem = (overrides: Partial<TemplateApiItem> = {}): TemplateApiItem => ({
  id: '1',
  name: 'Template Alpha',
  description: 'Description',
  systemPrompt: 'System prompt',
  groups: [],
  updatedAt: '2026-01-01T00:00:00',
  ...overrides,
});

const makeResponse = (
  items: TemplateApiItem[],
  totalElements = items.length,
): TemplateApiResponse => ({
  content: items,
  totalElements,
  number: 0,
  size: 10,
});

describe('TemplateListStore', () => {
  let store: InstanceType<typeof TemplateListStore>;
  let apiSpy: { list: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    apiSpy = { list: vi.fn() };
    TestBed.configureTestingModule({
      providers: [TemplateListStore, { provide: TemplateListApiService, useValue: apiSpy }],
    });
    store = TestBed.inject(TemplateListStore);
  });

  describe('テンプレート一覧取得', () => {
    it('テンプレート一覧を取得できること', async () => {
      const items = [makeApiItem({ id: '1' }), makeApiItem({ id: '2', name: 'Template B' })];
      apiSpy.list.mockResolvedValue(makeResponse(items, 2));

      await store.loadItems();

      expect(store.items()).toHaveLength(2);
      expect(store.items()[0].id).toBe('1');
      expect(store.items()[1].id).toBe('2');
    });

    it('総件数が正しく反映されること', async () => {
      const items = [makeApiItem()];
      apiSpy.list.mockResolvedValue(makeResponse(items, 50));

      await store.loadItems();

      expect(store.totalItems()).toBe(50);
    });

    it('読み込み中はローディングが表示されること', () => {
      let loadingDuringFetch = false;
      apiSpy.list.mockImplementation(() => {
        loadingDuringFetch = store.isLoading();
        return Promise.resolve(makeResponse([]));
      });

      void store.loadItems();

      expect(loadingDuringFetch).toBe(true);
    });

    it('読み込み完了後はローディングが非表示になること', async () => {
      apiSpy.list.mockResolvedValue(makeResponse([]));

      await store.loadItems();

      expect(store.isLoading()).toBe(false);
    });

    it('取得に失敗したとき一覧が空になること', async () => {
      apiSpy.list.mockRejectedValue(new Error('network error'));

      await store.loadItems();

      expect(store.items()).toEqual([]);
      expect(store.totalItems()).toBe(0);
    });

    it('取得に失敗したときエラーメッセージが設定されること', async () => {
      apiSpy.list.mockRejectedValue(new Error('network error'));

      await store.loadItems();

      expect(store.error()).toBe('network error');
    });
  });

  describe('ページ操作', () => {
    it('ページを切り替えると対応するページのデータが表示されること', async () => {
      const page1Items = [makeApiItem({ id: 'p1-1' })];
      const page2Items = [makeApiItem({ id: 'p2-1' })];

      apiSpy.list
        .mockResolvedValueOnce(makeResponse(page1Items, 2))
        .mockResolvedValueOnce(makeResponse(page2Items, 2));

      await store.loadItems();
      expect(store.items()[0].id).toBe('p1-1');

      store.updatePageIndex(2);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect(store.filter().pageIndex).toBe(2);
      expect(store.items()[0].id).toBe('p2-1');
    });

    it('ページサイズを変更するとページが先頭に戻ること', async () => {
      apiSpy.list.mockResolvedValue(makeResponse([]));

      store.updatePageSize(25);
      await Promise.resolve();

      expect(store.filter().pageSize).toBe(25);
      expect(store.filter().pageIndex).toBe(1);
    });
  });

  describe('絞り込み', () => {
    it('絞り込み条件を変更するとページが先頭に戻ること', async () => {
      apiSpy.list.mockResolvedValue(makeResponse([]));

      store.updateFilter({ query: 'keyword', pageIndex: 3 });
      await Promise.resolve();

      expect(store.filter().query).toBe('keyword');
      expect(store.filter().pageIndex).toBe(1);
    });
  });

  describe('一覧の操作', () => {
    it('テンプレートを追加すると一覧の先頭に追加されること', async () => {
      apiSpy.list.mockResolvedValue(makeResponse([makeApiItem({ id: 'existing' })]));
      await store.loadItems();

      const newItem = {
        id: 'new',
        name: 'New',
        description: '',
        systemPrompt: '',
        teams: [],
      };
      store.addOne(newItem);

      expect(store.items()[0].id).toBe('new');
      expect(store.items()[1].id).toBe('existing');
      expect(store.totalItems()).toBe(2);
    });

    it('テンプレートを更新すると一覧の内容が反映されること', async () => {
      apiSpy.list.mockResolvedValue(
        makeResponse([makeApiItem({ id: '1', name: 'Old' }), makeApiItem({ id: '2' })]),
      );
      await store.loadItems();

      store.updateOne({ id: '1', name: 'Updated', description: '', systemPrompt: '', teams: [] });

      expect(store.items()[0].name).toBe('Updated');
      expect(store.items()[1].id).toBe('2');
    });

    it('テンプレートを削除すると一覧から除外されること', async () => {
      apiSpy.list.mockResolvedValue(
        makeResponse(
          [makeApiItem({ id: '1' }), makeApiItem({ id: '2' }), makeApiItem({ id: '3' })],
          3,
        ),
      );
      await store.loadItems();

      store.removeMany(['1', '3']);

      expect(store.items().map((t) => t.id)).toEqual(['2']);
      expect(store.totalItems()).toBe(1);
    });
  });

  describe('選択操作', () => {
    it('テンプレートを個別に選択・解除できること', async () => {
      apiSpy.list.mockResolvedValue(makeResponse([makeApiItem({ id: '1' })]));
      await store.loadItems();

      store.toggleSelected('1', true);
      expect(store.selectedIds().has('1')).toBe(true);

      store.toggleSelected('1', false);
      expect(store.selectedIds().has('1')).toBe(false);
    });

    it('全選択するとすべてのテンプレートが選択されること', async () => {
      apiSpy.list.mockResolvedValue(
        makeResponse([makeApiItem({ id: '1' }), makeApiItem({ id: '2' })]),
      );
      await store.loadItems();

      store.toggleSelectAll(true);
      expect(store.selectedIds().has('1')).toBe(true);
      expect(store.selectedIds().has('2')).toBe(true);
    });

    it('全選択を解除するとすべての選択が外れること', async () => {
      apiSpy.list.mockResolvedValue(
        makeResponse([makeApiItem({ id: '1' }), makeApiItem({ id: '2' })]),
      );
      await store.loadItems();
      store.toggleSelectAll(true);

      store.toggleSelectAll(false);
      expect(store.selectedIds().size).toBe(0);
    });

    it('選択をクリアするとすべての選択が外れること', async () => {
      apiSpy.list.mockResolvedValue(makeResponse([makeApiItem({ id: '1' })]));
      await store.loadItems();
      store.toggleSelectAll(true);

      store.clearSelection();
      expect(store.selectedIds().size).toBe(0);
    });

    it('全テンプレートが選択されている場合に全選択状態と判定されること', async () => {
      apiSpy.list.mockResolvedValue(
        makeResponse([makeApiItem({ id: '1' }), makeApiItem({ id: '2' })]),
      );
      await store.loadItems();

      store.toggleSelectAll(true);
      expect(store.allSelected()).toBe(true);
    });

    it('一部のテンプレートのみ選択されている場合に部分選択状態と判定されること', async () => {
      apiSpy.list.mockResolvedValue(
        makeResponse([makeApiItem({ id: '1' }), makeApiItem({ id: '2' })]),
      );
      await store.loadItems();

      store.toggleSelected('1', true);
      expect(store.someSelected()).toBe(true);
      expect(store.allSelected()).toBe(false);
    });
  });

  describe('ページ情報', () => {
    it('総件数からページ数が正しく計算されること', async () => {
      apiSpy.list.mockResolvedValue(makeResponse([makeApiItem()], 25));
      await store.loadItems();
      // pageSize=10, totalItems=25 → 3ページ
      expect(store.totalPages()).toBe(3);
    });

    it('テンプレートが0件のときページ数が1になること', async () => {
      apiSpy.list.mockResolvedValue(makeResponse([], 0));
      await store.loadItems();
      expect(store.totalPages()).toBe(1);
    });

    it('現在ページの表示範囲が正しく計算されること', async () => {
      apiSpy.list.mockResolvedValue(makeResponse([makeApiItem()], 25));
      await store.loadItems();
      // pageIndex=1, pageSize=10, totalItems=25
      expect(store.pageRange()).toEqual({ from: 1, to: 10, total: 25 });
    });

    it('テンプレートが0件のとき表示範囲がすべて0になること', async () => {
      apiSpy.list.mockResolvedValue(makeResponse([], 0));
      await store.loadItems();
      expect(store.pageRange()).toEqual({ from: 0, to: 0, total: 0 });
    });
  });
});
