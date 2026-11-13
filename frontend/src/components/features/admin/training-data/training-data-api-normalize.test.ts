import { describe, expect, test } from 'vitest';
import {
  normalizeTrainingDataListBody,
  toTrainingDataItem,
  type IndexRow,
} from './training-data-api-normalize';
import { buildIndexPayload, resolveSaasGlobalEndpointIds } from './training-folder-form';

const FIXTURE_ROW: IndexRow = {
  id: 'i1',
  name: 'フォルダ',
  description: null,
  type: 'SAAS_GLOBAL',
  add: null,
  delete: null,
  get: null,
  createdAt: '2026-11-01T00:00:00',
  updatedAt: '2026-11-02T00:00:00',
  tenantEndpoints: [{ id: 'e1' }, { id: 'e2' }],
  groupIds: ['g1'],
};

function normalizeOne(row: IndexRow) {
  return normalizeTrainingDataListBody({ content: [row], totalElements: 1, number: 0, size: 5 });
}

describe('training-data-api-normalize', () => {
  test('tenantEndpoints から endpointIds を作り、number を 1 始まりにすること', () => {
    const result = normalizeOne(FIXTURE_ROW);

    expect(result.page).toBe(1);
    expect(result.data[0].endpointIds).toEqual(['e1', 'e2']);
    expect(result.data[0].description).toBe('');
    expect(result.data[0].add).toBeUndefined();
  });

  test('クラウドとローカルを日本語の接続サーバー名に変えること', () => {
    const cloud = toTrainingDataItem(normalizeOne(FIXTURE_ROW).data[0]);
    const local = toTrainingDataItem(normalizeOne({ ...FIXTURE_ROW, type: 'LOCAL' }).data[0]);

    expect(cloud.server).toBe('クラウド');
    expect(local.server).toBe('ローカル');
  });
});

describe('training-folder-form', () => {
  test('ローカルのときだけサービス ID を送ること', () => {
    const base = { name: 'n', fetchId: 'g', deleteId: 'd', learnId: 'a' };

    expect(buildIndexPayload({ ...base, server: 'LOCAL' }, ['g1'], ['e1'])).toEqual({
      name: 'n',
      type: 'LOCAL',
      get: 'g',
      delete: 'd',
      add: 'a',
      endpointIds: ['e1'],
      groupIds: ['g1'],
    });
    expect(buildIndexPayload({ ...base, server: 'SAAS_GLOBAL' }, [], ['v', 'm'])).not.toHaveProperty(
      'get',
    );
  });

  test('クラウドはどちらかの候補が空なら接続先を決めないこと', () => {
    const options = [{ value: 'a', label: 'A' }];

    expect(resolveSaasGlobalEndpointIds(options, options)).toEqual(['a', 'a']);
    expect(resolveSaasGlobalEndpointIds(options, [])).toBeNull();
  });
});
