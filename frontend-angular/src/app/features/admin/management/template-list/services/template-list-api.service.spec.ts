import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TemplateListApiService } from './template-list-api.service';
import { ApiClientService } from '@core/services/api-client';
import type { TemplateApiResponse } from '@app-types/admin/template.types';

function buildApiClient() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
}

const makeResponse = (): TemplateApiResponse => ({
  content: [],
  totalElements: 0,
  number: 0,
  size: 10,
});

describe('TemplateListApiService', () => {
  let service: TemplateListApiService;
  let api: ReturnType<typeof buildApiClient>;

  beforeEach(() => {
    api = buildApiClient();
    TestBed.configureTestingModule({
      providers: [TemplateListApiService, { provide: ApiClientService, useValue: api }],
    });
    service = TestBed.inject(TemplateListApiService);
  });

  it('テンプレート一覧を取得できること', async () => {
    api.get.mockResolvedValue(makeResponse());

    await service.list({ pageSize: 10, pageIndex: 1 });

    expect(api.get).toHaveBeenCalledWith(
      '/admin/prompt-templates',
      expect.objectContaining({ params: expect.objectContaining({ page: 0, size: 10 }) }),
    );
  });

  it('検索キーワードを指定して絞り込めること', async () => {
    api.get.mockResolvedValue(makeResponse());

    await service.list({ pageSize: 10, pageIndex: 1, query: 'sales' });

    const params = api.get.mock.calls[0][1].params;
    expect(params.search).toBe('sales');
  });

  it('ページ番号を正しく変換して取得できること', async () => {
    api.get.mockResolvedValue(makeResponse());

    await service.list({ pageSize: 10, pageIndex: 3 });

    const params = api.get.mock.calls[0][1].params;
    expect(params.page).toBe(2);
  });

  it('ソート条件を指定して一覧を取得できること', async () => {
    api.get.mockResolvedValue(makeResponse());

    await service.list({ pageSize: 10, pageIndex: 1, sortField: 'updatedAt', sortOrder: 'desc' });

    const params = api.get.mock.calls[0][1].params;
    expect(params.sort).toBe('updatedAt,desc');
  });

  it('テンプレートを新規作成できること', async () => {
    const payload = { name: 'New Template', systemPrompt: 'You are...' };
    api.post.mockResolvedValue({ id: '1', ...payload });

    await service.create(payload);

    expect(api.post).toHaveBeenCalledWith('/admin/prompt-templates', payload, {
      skipGlobalErrorToast: true,
    });
  });

  it('テンプレートを更新できること', async () => {
    const payload = { name: 'Updated', systemPrompt: 'Updated prompt' };
    api.patch.mockResolvedValue({ id: '42', ...payload });

    await service.update('42', payload);

    expect(api.patch).toHaveBeenCalledWith('/admin/prompt-templates/42', payload, {
      skipGlobalErrorToast: true,
    });
  });

  it('テンプレートを削除できること', async () => {
    api.delete.mockResolvedValue(undefined);

    await service.deleteOne('99');

    expect(api.delete).toHaveBeenCalledWith('/admin/prompt-templates/99', {
      skipGlobalErrorToast: true,
    });
  });

  it('グループを指定して絞り込めること', async () => {
    api.get.mockResolvedValue(makeResponse());

    await service.list({ pageSize: 10, pageIndex: 1, team: 'grp-sales' });

    const params = api.get.mock.calls[0][1].params;
    expect(params.team).toBe('grp-sales');
  });

  it('所属グループなしの条件で絞り込めること', async () => {
    api.get.mockResolvedValue(makeResponse());

    await service.list({ pageSize: 10, pageIndex: 1, team: '__none__' });

    const params = api.get.mock.calls[0][1].params;
    expect(params.team).toBe('__none__');
  });

  it('ソート条件なしでも正しく取得できること', async () => {
    api.get.mockResolvedValue(makeResponse());

    await service.list({ pageSize: 10, pageIndex: 1 });

    const params = api.get.mock.calls[0][1].params;
    expect(params.sort).toBeUndefined();
  });
});
