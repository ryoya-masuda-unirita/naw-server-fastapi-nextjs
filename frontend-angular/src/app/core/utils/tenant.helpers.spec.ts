/**
 * NAW-965: `resolveTenantId` の単体テスト。
 *
 * sessionStorage の TENANT_ID を優先し、無ければ hostname の先頭ラベルをテナント ID とする。
 * `hostname` は jsdom 上で `vi.spyOn` しにくいため、`window.location` を一時的に差し替える。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '@core/constants';
import { resolveTenantId } from '@core/utils/tenant.helpers';

const ORIGINAL_WINDOW_LOCATION: Location = window.location;

function stubLocationHostname(hostname: string): void {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: {
      ancestorOrigins: {} as DOMStringList,
      assign: () => undefined,
      hash: '',
      host: hostname,
      hostname,
      href: `http://${hostname}/`,
      origin: `http://${hostname}`,
      pathname: '/',
      port: '',
      protocol: 'http:',
      reload: () => undefined,
      replace: () => undefined,
      search: '',
      toString: () => `http://${hostname}/`,
    } as unknown as Location,
  });
}

function restoreWindowLocation(): void {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: ORIGINAL_WINDOW_LOCATION,
  });
}

describe('resolveTenantId（テナント ID 解決）', () => {
  // 各 it の直前: 前テストの location を戻し、sessionStorage を空にする
  beforeEach(() => {
    restoreWindowLocation();
    sessionStorage.clear();
  });

  // 各 it の直後にも復元する。復元しないと、モックした window.location が
  // 後続のテストファイルへ漏れ（vmThreads は同一ワーカー内でグローバルを共有しうる）、
  // history.replaceState 依存のテスト（例: login-key.initializer）を壊すため。
  afterEach(() => {
    restoreWindowLocation();
  });

  // 本実装: sessionStorage に TENANT_ID があれば hostname を見ずにその値を返す
  it('ブラウザに保存済みのテナントIDがあるときは、その値を使う', () => {
    // Arrange
    sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, 'stored-tenant');
    stubLocationHostname('ignored.example.com');

    // Act
    const result = resolveTenantId();

    // Assert
    expect(result).toBe('stored-tenant');
  });

  // 本実装: sessionStorage があれば hostname が単一ラベル（サブドメインなし）でもその値を返す
  it('サブドメインがなくsessionStorageにテナントIDがあるときはその値を使う', () => {
    // Arrange
    sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, 'stored-tenant');
    stubLocationHostname('localhost');

    // Act
    const result = resolveTenantId();

    // Assert
    expect(result).toBe('stored-tenant');
  });

  // 本実装: ストレージに無いとき hostname を '.' で分割し、2要素以上なら先頭ラベルを返す
  it('保存がないときはURLのサブドメイン（例: acme.example.com → acme）からテナントを判定する', () => {
    // Arrange
    stubLocationHostname('acme.example.com');

    // Act
    const result = resolveTenantId();

    // Assert
    expect(result).toBe('acme');
  });

  // 本実装: hostname が単一ラベル（例: localhost）のとき parts.length <= 1 となり空文字を返す
  it('localhost のようにサブドメインがないURLではテナントを判定しない', () => {
    // Arrange
    stubLocationHostname('localhost');

    // Act
    const result = resolveTenantId();

    // Assert
    expect(result).toBe('');
  });
});
