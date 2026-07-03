import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GroupTemplatesStore } from './group-templates.store';
import { GroupTemplatesApiService } from '../services/group-templates-api.service';
import type { TemplateApiItem } from '../../../../../../types/admin/template.types';
import type { PagedResponse } from '../../../../../../types/api-response.type';

const makeItem = (overrides: Partial<TemplateApiItem> = {}): TemplateApiItem => ({
  id: '1',
  name: 'Template A',
  description: 'A prompt template',
  systemPrompt: 'You are a helpful assistant.',
  createdAt: '2026-01-01T00:00:00',
  ...overrides,
});

const makeResponse = (
  items: TemplateApiItem[],
  total = items.length,
): PagedResponse<TemplateApiItem> => ({
  content: items,
  totalElements: total,
  number: 0,
  size: 25,
});

describe('GroupTemplatesStore', () => {
  let store: InstanceType<typeof GroupTemplatesStore>;
  let apiSpy: {
    listByGroup: ReturnType<typeof vi.fn>;
    addTemplates: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    apiSpy = {
      listByGroup: vi.fn(),
      addTemplates: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [GroupTemplatesStore, { provide: GroupTemplatesApiService, useValue: apiSpy }],
    });
    store = TestBed.inject(GroupTemplatesStore);
  });

  it('loads templates from tab API', async () => {
    store.setGroup('g');
    apiSpy.listByGroup.mockResolvedValue(makeResponse([makeItem()], 1));
    await store.loadItems();
    expect(store.items()).toHaveLength(1);
  });

  it('removeTemplates calls child-resource DELETE API', async () => {
    store.setGroup('g');
    apiSpy.listByGroup.mockResolvedValue(makeResponse([]));
    await store.removeTemplates(['t1']);
    expect(apiSpy.remove).toHaveBeenCalledWith('g', 't1');
  });

  it('addTemplates calls child-resource POST API', async () => {
    store.setGroup('g');
    apiSpy.listByGroup.mockResolvedValue(makeResponse([]));
    await store.addTemplates(['t2']);
    expect(apiSpy.addTemplates).toHaveBeenCalledWith('g', ['t2']);
  });
});
