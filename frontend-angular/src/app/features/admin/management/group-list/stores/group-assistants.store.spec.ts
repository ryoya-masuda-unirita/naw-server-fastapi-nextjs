import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GroupAssistantsStore } from './group-assistants.store';
import { GroupAssistantsApiService } from '../services/group-assistants-api.service';
import type { AssistantApiItem } from '../../../../../../types/admin/assistant.types';
import type { PagedResponse } from '../../../../../../types/api-response.type';

const makeItem = (overrides: Partial<AssistantApiItem> = {}): AssistantApiItem => ({
  id: '1',
  name: 'Assist-A',
  description: 'desc',
  type: 'SECURE',
  includeHistory: true,
  iconColor: '#000000',
  groups: [],
  category: null,
  categories: [],
  endpoints: [],
  ...overrides,
});

const makeResponse = (
  items: AssistantApiItem[],
  total = items.length,
): PagedResponse<AssistantApiItem> => ({
  content: items,
  totalElements: total,
  number: 0,
  size: 25,
});

describe('GroupAssistantsStore', () => {
  let store: InstanceType<typeof GroupAssistantsStore>;
  let apiSpy: {
    listByGroup: ReturnType<typeof vi.fn>;
    addAssistants: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    apiSpy = {
      listByGroup: vi.fn(),
      addAssistants: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [GroupAssistantsStore, { provide: GroupAssistantsApiService, useValue: apiSpy }],
    });
    store = TestBed.inject(GroupAssistantsStore);
  });

  it('maps SECURE server type label', async () => {
    store.setGroup('g');
    apiSpy.listByGroup.mockResolvedValue(makeResponse([makeItem({ type: 'SECURE' })]));
    await store.loadItems();
    expect(store.items()[0].serverLabel).toBe('ローカル');
  });

  it('maps endpoint label from model when label is empty', async () => {
    store.setGroup('g');
    apiSpy.listByGroup.mockResolvedValue(
      makeResponse([
        makeItem({
          endpoints: [
            { id: 'ep-1', label: '', model: 'gpt-5.4', url: '', type: 'AZURE_OPENAI_CHAT' },
          ],
        }),
      ]),
    );
    await store.loadItems();
    expect(store.items()[0].endpointLabel).toBe('gpt-5.4');
  });

  it('addAssistants calls child-resource POST API', async () => {
    store.setGroup('g');
    apiSpy.listByGroup.mockResolvedValue(makeResponse([]));
    await store.addAssistants(['a1']);
    expect(apiSpy.addAssistants).toHaveBeenCalledWith('g', ['a1']);
  });

  it('removeAssistants calls child-resource DELETE API', async () => {
    store.setGroup('g');
    apiSpy.listByGroup.mockResolvedValue(makeResponse([]));
    await store.removeAssistants(['a1']);
    expect(apiSpy.remove).toHaveBeenCalledWith('g', 'a1');
  });
});
