import { TestBed } from '@angular/core/testing';
import { ApiClientService } from '@core/services/api-client';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AssistantListApiService } from './assistant-list-api.service';

function buildApiClient() {
  return { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
}

describe('AssistantListApiService', () => {
  let service: AssistantListApiService;
  let api: ReturnType<typeof buildApiClient>;

  beforeEach(() => {
    api = buildApiClient();
    TestBed.configureTestingModule({
      providers: [AssistantListApiService, { provide: ApiClientService, useValue: api }],
    });
    service = TestBed.inject(AssistantListApiService);
  });

  describe('getGroupOptions', () => {
    it('チーム一覧のページネーション形式レスポンスを選択肢に変換できること', async () => {
      api.get.mockResolvedValue({
        data: [
          { id: 'g1', name: '営業部' },
          { id: 'g2', name: '開発部' },
        ],
        total: 2,
      });

      const result = await service.getGroupOptions();

      expect(result).toEqual([
        { value: 'g1', label: '営業部' },
        { value: 'g2', label: '開発部' },
      ]);
    });

    it('チームが存在しない場合は空の選択肢になること', async () => {
      api.get.mockResolvedValue({ data: [], total: 0 });

      const result = await service.getGroupOptions();

      expect(result).toEqual([]);
    });
  });

  describe('getFolderOptions', () => {
    it('size=1000を指定して/admin/indexesを呼び出すこと', async () => {
      api.get.mockResolvedValue([]);
      await service.getFolderOptions();
      expect(api.get).toHaveBeenCalledWith('/admin/indexes', {
        params: { size: '1000' },
      });
    });

    it('SAAS_GLOBALタイプのフォルダのみを選択肢に変換できること', async () => {
      api.get.mockResolvedValue([
        { id: 'idx-1', name: 'フォルダA', type: 'LOCAL' },
        { id: 'idx-2', name: 'フォルダB', type: 'SAAS_GLOBAL' },
        { id: 'idx-3', name: 'フォルダC', type: 'LOCAL' },
        { id: 'idx-4', name: 'フォルダD', type: 'SAAS_GLOBAL' },
      ]);

      const result = await service.getFolderOptions();

      expect(result).toEqual([
        { value: 'idx-2', label: 'フォルダB' },
        { value: 'idx-4', label: 'フォルダD' },
      ]);
    });

    it('レスポンスがcontentキーを持つオブジェクト形式（Page形式）でも正しく処理できること', async () => {
      api.get.mockResolvedValue({
        content: [{ id: 'idx-2', name: 'フォルダB', type: 'SAAS_GLOBAL' }],
      });

      const result = await service.getFolderOptions();

      expect(result).toEqual([{ value: 'idx-2', label: 'フォルダB' }]);
    });

    it('該当するSAAS_GLOBALフォルダが存在しない場合は空配列になること', async () => {
      api.get.mockResolvedValue([{ id: 'idx-1', name: 'フォルダA', type: 'LOCAL' }]);

      const result = await service.getFolderOptions();

      expect(result).toEqual([]);
    });
  });
});
