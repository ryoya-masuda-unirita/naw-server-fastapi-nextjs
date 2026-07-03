import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GroupListStore, toViewModel } from './group-list.store';
import { GroupApiService } from '../services/group-api.service';
import type {
  GroupApiResponse,
  GroupApiItem,
  GroupListItem,
} from '../../../../../../types/admin/group-management.types';

const makeApiItem = (overrides: Partial<GroupApiItem> = {}): GroupApiItem => ({
  id: '1',
  name: 'Team Alpha',
  users: ['u1', 'u2'],
  adminUserIds: ['u1'],
  assistants: ['a1'],
  promptTemplates: ['t1'],
  updatedAt: '2026-01-01T00:00:00',
  ...overrides,
});

const makeResponse = (items: GroupApiItem[], total = items.length): GroupApiResponse => ({
  data: items,
  total,
  page: 0,
  size: 5,
});

const identityResolver = (_kind: string, ids: string[]) => ids;

describe('toViewModel', () => {
  it('グループの情報が正しく表示用に変換されること', () => {
    const item = makeApiItem({
      id: '42',
      name: 'G1',
      users: ['u1'],
      adminUserIds: ['u2'],
      assistants: ['a1'],
      promptTemplates: ['t1'],
    });
    const resolver = vi.fn((_kind: string, ids: string[]) => ids.map((id) => `name:${id}`));
    const vm = toViewModel(item, resolver as Parameters<typeof toViewModel>[1]);
    expect(vm.id).toBe('42');
    expect(vm.name).toBe('G1');
    expect(vm.userNames).toEqual(['name:u1']);
    expect(vm.adminUserNames).toEqual(['name:u2']);
    expect(vm.assistants).toEqual(['name:a1']);
    expect(vm.templates).toEqual(['name:t1']);
    expect(vm.updatedAt).toBe('2026-01-01T00:00:00');
  });

  it('APIの表示名フィールドを優先して表示用に変換されること', () => {
    const item = makeApiItem({
      users: ['u1'],
      adminUserIds: ['u2'],
      userNames: ['山田太郎'],
      adminUserNames: ['佐藤花子'],
    });
    const resolver = vi.fn((_kind: string, ids: string[]) => ids.map((id) => `name:${id}`));
    const vm = toViewModel(item, resolver as Parameters<typeof toViewModel>[1]);
    expect(vm.userNames).toEqual(['山田太郎']);
    expect(vm.adminUserNames).toEqual(['佐藤花子']);
    expect(resolver).not.toHaveBeenCalledWith('admin', expect.anything());
    expect(resolver).not.toHaveBeenCalledWith('user', expect.anything());
  });

  it('メンバー情報が未設定のグループでも正しく表示されること', () => {
    const item = makeApiItem({
      users: undefined,
      adminUserIds: undefined,
      assistants: undefined,
      promptTemplates: undefined,
    });
    const vm = toViewModel(item, identityResolver);
    expect(vm.userNames).toEqual([]);
    expect(vm.adminUserNames).toEqual([]);
    expect(vm.assistants).toEqual([]);
    expect(vm.templates).toEqual([]);
  });
});

describe('GroupListStore', () => {
  let store: InstanceType<typeof GroupListStore>;
  let apiSpy: { list: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    apiSpy = { list: vi.fn() };
    TestBed.configureTestingModule({
      providers: [GroupListStore, { provide: GroupApiService, useValue: apiSpy }],
    });
    store = TestBed.inject(GroupListStore);
  });

  it('初期状態ではグループ一覧が空であること', () => {
    expect(store.items()).toEqual([]);
    expect(store.totalItems()).toBe(0);
    expect(store.isLoading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  describe('ページ数計算', () => {
    it('グループが0件のときページ数が1になること', () => {
      expect(store.totalPages()).toBe(1);
    });

    it('総件数からページ数が切り上げで計算されること', async () => {
      apiSpy.list.mockResolvedValue(makeResponse([makeApiItem()], 11));
      await store.loadItems();
      // pageSize default = 5, totalItems = 11 → ceil(11/5) = 3
      expect(store.totalPages()).toBe(3);
    });
  });

  describe('ページ範囲', () => {
    it('グループが0件のとき表示範囲がすべて0になること', () => {
      expect(store.pageRange()).toEqual({ from: 0, to: 0, total: 0 });
    });

    it('現在ページの表示範囲が正しく計算されること', async () => {
      const items = Array.from({ length: 5 }, (_, i) =>
        makeApiItem({ id: String(i + 1), name: `Team ${i + 1}` }),
      );
      apiSpy.list.mockResolvedValue(makeResponse(items, 12));
      await store.loadItems();
      const range = store.pageRange();
      expect(range.from).toBe(1);
      expect(range.to).toBe(5);
      expect(range.total).toBe(12);
    });
  });

  describe('グループ一覧取得', () => {
    it('グループ一覧を取得できること', async () => {
      const items = [makeApiItem({ id: '1' }), makeApiItem({ id: '2', name: 'Team B' })];
      apiSpy.list.mockResolvedValue(makeResponse(items, 2));
      await store.loadItems();
      expect(store.items()).toHaveLength(2);
      expect(store.totalItems()).toBe(2);
      expect(store.isLoading()).toBe(false);
      expect(store.error()).toBeNull();
    });

    it('取得に失敗したときエラーが設定されること', async () => {
      apiSpy.list.mockRejectedValue(new Error('network'));
      await store.loadItems();
      expect(store.items()).toEqual([]);
      expect(store.totalItems()).toBe(0);
      expect(store.error()).toBe('network');
      expect(store.isLoading()).toBe(false);
    });

    it('名前変換なしでグループ情報が表示されること', async () => {
      apiSpy.list.mockResolvedValue(makeResponse([makeApiItem({ users: ['u1'] })]));
      await store.loadItems();
      expect(store.items()[0].userNames).toEqual(['u1']);
    });

    it('カスタムの名前変換を適用できること', async () => {
      store.setNameResolver((_kind, ids) => ids.map((id) => `Resolved-${id}`));
      apiSpy.list.mockResolvedValue(makeResponse([makeApiItem({ users: ['u1'] })]));
      await store.loadItems();
      expect(store.items()[0].userNames).toEqual(['Resolved-u1']);
    });
  });

  describe('絞り込み', () => {
    it('絞り込み条件を変更するとページが先頭に戻ること', async () => {
      apiSpy.list.mockResolvedValue(makeResponse([]));
      store.updateFilter({ query: 'alpha', pageIndex: 3 });
      await Promise.resolve(); // flush microtask
      expect(store.filter().query).toBe('alpha');
      expect(store.filter().pageIndex).toBe(1);
    });
  });

  describe('ページ切り替え', () => {
    it('ページを切り替えると対応するページが表示されること', async () => {
      apiSpy.list.mockResolvedValue(makeResponse([]));
      store.updatePageIndex(3);
      await Promise.resolve();
      expect(store.filter().pageIndex).toBe(3);
      expect(apiSpy.list).toHaveBeenCalled();
    });
  });

  describe('ページサイズ変更', () => {
    it('ページサイズを変更するとページが先頭に戻ること', async () => {
      apiSpy.list.mockResolvedValue(makeResponse([]));
      store.updatePageSize(10);
      await Promise.resolve();
      expect(store.filter().pageSize).toBe(10);
      expect(store.filter().pageIndex).toBe(1);
    });
  });

  describe('グループ追加', () => {
    it('グループを追加すると一覧の先頭に追加されること', () => {
      const item: GroupListItem = {
        id: '99',
        name: 'New',
        adminUserNames: [],
        userNames: [],
        assistants: [],
        templates: [],
      };
      store.addOne(item);
      expect(store.items()[0]).toEqual(item);
      expect(store.totalItems()).toBe(1);
    });
  });

  describe('グループ更新', () => {
    it('グループを更新すると一覧の内容が反映されること', async () => {
      apiSpy.list.mockResolvedValue(makeResponse([makeApiItem({ id: '1', name: 'Old' })]));
      await store.loadItems();
      const updated: GroupListItem = {
        id: '1',
        name: 'Updated',
        adminUserNames: [],
        userNames: [],
        assistants: [],
        templates: [],
      };
      store.updateOne(updated);
      expect(store.items()[0].name).toBe('Updated');
    });
  });

  describe('グループ削除', () => {
    it('グループを削除すると一覧から除外されること', async () => {
      apiSpy.list.mockResolvedValue(
        makeResponse(
          [
            makeApiItem({ id: '1', name: 'A' }),
            makeApiItem({ id: '2', name: 'B' }),
            makeApiItem({ id: '3', name: 'C' }),
          ],
          3,
        ),
      );
      await store.loadItems();
      store.removeMany(['1', '3']);
      expect(store.items().map((i) => i.id)).toEqual(['2']);
      expect(store.totalItems()).toBe(1);
    });
  });
});
