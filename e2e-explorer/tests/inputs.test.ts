import { expect, test } from '@playwright/test';
import { expandShards, loadConfig } from '../src/config.ts';
import { INPUT_KINDS, valueFor } from '../src/inputs.ts';
import { createRng, deriveRng, shuffle } from '../src/rng.ts';
import { buildTenantSql, planTenants } from '../src/tenant-sql.ts';

/** 入力値・乱数・専用テナントの SQL の単体テスト。 */

const options = { defaultMaxLength: 255, longLength: 1000 };

test('generates boundary values from maxlength', () => {
  /** 最大は maxlength ちょうど、最大+1 は 1 文字多く、maxlength がなければ既定の長さを使うこと */
  const rng = createRng(1);
  const field = { inputType: 'text', maxLength: 32 };
  expect(valueFor('max', field, options, rng)).toHaveLength(32);
  expect(valueFor('maxPlus1', field, options, rng)).toHaveLength(33);
  expect(valueFor('max', { inputType: 'text', maxLength: null }, options, rng)).toHaveLength(255);
  expect(valueFor('long', field, options, rng)).toHaveLength(1000);
  expect(valueFor('empty', field, options, rng)).toBe('');
  expect(valueFor('date' as never, { inputType: 'date', maxLength: null }, options, rng)).toBeNull();
});

test('uses numeric values for number inputs', () => {
  /** 数の欄には、どの種類でも数として解釈できる文字列（または空）を入れること */
  const rng = createRng(1);
  for (const kind of INPUT_KINDS) {
    const value = valueFor(kind, { inputType: 'number', maxLength: null }, options, rng);
    expect(value === '' || Number.isFinite(Number(value)), `${kind}: ${value}`).toBe(true);
  }
  expect(valueFor('negative', { inputType: 'number', maxLength: null }, options, rng)).toBe('-1');
});

test('picks select options and mixes kinds deterministically', () => {
  /** 選択肢は種類に応じて先頭・末尾を選び、混合は同じ種なら同じ値になること */
  const select = { inputType: 'select', maxLength: null, options: ['a', 'b', 'c'] };
  expect(valueFor('empty', select, options, createRng(1))).toBe('a');
  expect(valueFor('max', select, options, createRng(1))).toBe('c');
  const text = { inputType: 'text', maxLength: 10 };
  expect(valueFor('mixed', text, options, deriveRng(3, 'x'))).toBe(valueFor('mixed', text, options, deriveRng(3, 'x')));
});

test('shuffles deterministically by seed', () => {
  /** 同じ種なら同じ並び、違う種なら違う並びになること */
  const items = Array.from({ length: 20 }, (_, i) => i);
  expect(shuffle(items, createRng(5))).toEqual(shuffle(items, createRng(5)));
  expect(shuffle(items, createRng(5))).not.toEqual(shuffle(items, createRng(6)));
  expect([...shuffle(items, createRng(5))].sort((a, b) => a - b)).toEqual(items);
});

test('builds idempotent tenant provisioning sql', () => {
  /** 担当範囲ごとにテナント・ユーザー・パスワード履歴を写す SQL ができ、再実行しても重複しない書き方であること */
  const config = loadConfig();
  const shards = expandShards(config);
  const plans = planTenants(config, shards);
  expect(plans.map((p) => p.tenantId)).toEqual([
    'e2e-dashboard-admin',
    'e2e-dashboard-user',
    'e2e-account-admin',
    'e2e-account-user',
  ]);
  expect(plans[0].loginIds).toEqual(['admin', 'user01']);
  const sql = buildTenantSql(plans);
  expect(sql).toContain("SELECT * FROM tenants WHERE id = 'test-tenant'");
  expect(sql).toContain('INSERT INTO tenants SELECT * FROM e2e_tenant ON CONFLICT (id) DO NOTHING;');
  expect(sql).toContain("md5('e2e-dashboard-admin:admin')::uuid");
  expect(sql.match(/ON CONFLICT \(login_id, tenant_id\) DO NOTHING/g)).toHaveLength(8);
  expect(sql.match(/AND NOT EXISTS \(SELECT 1 FROM password_histories/g)).toHaveLength(8);
  expect(sql.trim().endsWith('COMMIT;')).toBe(true);
});

test('skips tenant creation when shards reuse the source tenant', () => {
  /** tenants.perShard が false なら、写す元のテナントでそのままログインするため作らないこと */
  const config = loadConfig();
  config.tenants.perShard = false;
  expect(planTenants(config, expandShards(config))).toEqual([]);
});
