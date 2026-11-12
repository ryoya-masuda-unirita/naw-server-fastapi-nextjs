// CloudFront Functionの単体テスト。AWSに接続せずに書き換えロジックを確認する。
// 実行: cd infra && node --test cloudfront_functions/functions.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// 関数ファイルはCloudFront Functionsの形式(トップレベルのhandler、exportなし)のため、
// Terraformがアップロードするファイルをそのまま評価してhandlerを取り出す
const loadHandler = (fileName) => {
  const code = readFileSync(new URL(`./${fileName}`, import.meta.url), 'utf8');
  return runInNewContext(`${code}\nhandler;`, {});
};

const buildEvent = (uri, overrides = {}) => ({
  request: { method: 'GET', uri, querystring: {}, headers: {}, cookies: {}, ...overrides },
});

const spaFallback = loadHandler('spa_fallback.js');
const stripBackendPrefix = loadHandler('strip_backend_prefix.js');

test('spa_fallback: 画面パス(拡張子なし)はindex.htmlに書き換えること', () => {
  const screenPaths = ['/', '/dashboard', '/auth', '/auth/login', '/auth/pw-reset', '/dashboard/'];
  for (const uri of screenPaths) {
    assert.equal(spaFallback(buildEvent(uri)).uri, '/index.html', uri);
  }
});

test('spa_fallback: 静的ファイル(拡張子あり)は書き換えないこと', () => {
  const assetPaths = [
    '/index.html',
    '/assets/index-abc123.js',
    '/assets/index-abc123.css',
    '/i18n/ja.json',
    '/favicon.ico',
    '/assets/fonts/noto/sans.woff2',
  ];
  for (const uri of assetPaths) {
    assert.equal(spaFallback(buildEvent(uri)).uri, uri, uri);
  }
});

test('spa_fallback: クエリ文字列は変えないこと', () => {
  const querystring = { page: { value: '1' } };

  const request = spaFallback(buildEvent('/dashboard', { querystring }));

  assert.equal(request.uri, '/index.html');
  assert.deepEqual(request.querystring, { page: { value: '1' } });
});

test('strip_backend_prefix: 認証APIのパスから/backendを外すこと', () => {
  const cases = [
    ['/backend/auth/login', '/auth/login'],
    ['/backend/auth/login-key', '/auth/login-key'],
    ['/backend/auth/logout', '/auth/logout'],
    ['/backend/auth/password/reset', '/auth/password/reset'],
  ];
  for (const [uri, expected] of cases) {
    assert.equal(stripBackendPrefix(buildEvent(uri)).uri, expected, uri);
  }
});

test('strip_backend_prefix: uri以外(メソッド・ヘッダー・クエリ文字列)は変えないこと', () => {
  const headers = { 'x-tenant-id': { value: 'tenant-a' } };
  const querystring = { lang: { value: 'ja' } };

  const request = stripBackendPrefix(
    buildEvent('/backend/auth/login', { method: 'POST', headers, querystring })
  );

  assert.equal(request.uri, '/auth/login');
  assert.equal(request.method, 'POST');
  assert.deepEqual(request.headers, { 'x-tenant-id': { value: 'tenant-a' } });
  assert.deepEqual(request.querystring, { lang: { value: 'ja' } });
});

test('strip_backend_prefix: /backend/で始まらないパスは書き換えないこと', () => {
  const paths = ['/backendx/auth/login', '/api/auth', '/auth/login'];
  for (const uri of paths) {
    assert.equal(stripBackendPrefix(buildEvent(uri)).uri, uri, uri);
  }
});
