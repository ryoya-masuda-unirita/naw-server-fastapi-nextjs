import type { BrowserContext } from '@playwright/test';
import { applyOverrides, DEFAULT_CONFIG_PATH, type ExplorerConfig, type GroupConfig } from '../../src/config.ts';
import { readFileSync } from 'node:fs';

/**
 * 判定役・巡回役の単体テスト用の小さなサイト。
 * 実際のサーバーは立てず、ブラウザの通信を route で横取りして HTML と API の応答を返す。
 * ホストを 127.0.0.1 にしているのは、ハーネスの安全策（ローカル以外を拒否）に掛からないようにするため。
 */

export const SITE_ORIGIN = 'http://127.0.0.1:65530';
export const SLOW_API_DELAY_MS = 700;

export interface SiteLog {
  /** POST /api/echo が受け取った本文。 */
  echoBodies: Record<string, string>[];
  /** 共通領域の「サイド」ボタンが押された回数。 */
  sideClicks: number;
  /** 除外指定のボタンが押された回数。 */
  excludedClicks: number;
  /** 呼ばれた API のパス。 */
  apiCalls: string[];
}

export function newSiteLog(): SiteLog {
  return { echoBodies: [], sideClicks: 0, excludedClicks: 0, apiCalls: [] };
}

function page(title: string, body: string, { withAside = true } = {}): string {
  const aside = withAside
    ? `<aside><button type="button" onclick="fetch('/api/side')">サイド</button></aside>`
    : '';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${title}</title>
<style>body{margin:0;font-family:sans-serif}main{padding:8px}</style></head>
<body>${aside}<main><h1>${title}</h1>${body}</main></body></html>`;
}

const PAGES: Record<string, string> = {
  '/': page(
    'トップ',
    `<nav aria-label="一覧"><ul>
<li><a href="/server-error">サーバーエラー</a></li>
<li><a href="/console">コンソール</a></li>
<li><a href="/overflow">はみ出し</a></li>
<li><a href="/form">フォーム</a></li>
<li><a href="/noop">何もしない</a></li>
<li><a href="/blank">真っ白</a></li>
<li><a href="/">トップ（自分自身）</a></li>
<li><a href="https://example.com/">外部</a></li>
<li><a href="/outside">担当外</a></li>
</ul></nav>
<button type="button" data-e2e-explorer-skip onclick="fetch('/api/excluded')">除外</button>`
  ),
  '/server-error': page('サーバーエラー', `<button type="button" onclick="fetch('/api/boom')">読み込む</button>`),
  '/not-found-api': page('404', `<button type="button" onclick="fetch('/api/missing')">探す</button>`),
  '/console': page(
    'コンソール',
    `<button type="button" onclick="console.error('わざとのエラー')">ログ</button>
<button type="button" onclick="setTimeout(() => { throw new Error('わざとの例外'); })">投げる</button>
<button type="button" onclick="Promise.reject(new Error('わざとの拒否'))">拒否</button>`
  ),
  '/overflow': page('はみ出し', `<div style="width:3000px;height:20px;background:#ccc">幅の広い帯</div>`),
  '/normal': page('普通', `<p>普通の画面です。</p><button type="button" onclick="document.querySelector('p').textContent='押しました'">押す</button>`),
  '/form': page(
    'フォーム',
    `<form id="f" aria-label="登録">
<label>名前 <input name="name" maxlength="10"></label>
<label>数 <input name="count" type="number"></label>
<button type="submit">送信</button>
</form>
<script>
document.getElementById('f').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  fetch('/api/echo', { method: 'POST', body: JSON.stringify(data) });
});
</script>`
  ),
  '/required': page(
    '必須',
    `<form aria-label="必須" onsubmit="event.preventDefault(); fetch('/api/echo', {method:'POST', body:'{}'})">
<label>必須の欄 <input name="must" required></label><button type="submit">送る</button></form>`
  ),
  '/placeholder': page(
    '仮画面',
    `<p>未移植: SampleComponent（#999）</p><div style="width:3000px;height:20px;background:#ccc">枠の不具合</div>
<button type="button">何もしない</button>`
  ),
  '/noop': page('何もしない', `<button type="button">押しても何もない</button>`),
  '/focus-style': page(
    'フォーカスで見た目が変わる',
    `<form aria-label="空白チェック" onsubmit="event.preventDefault(); if (!this.q.value.trim()) return; fetch('/api/echo', {method:'POST', body:'{}'})">
<input name="q" aria-label="検索" onfocus="this.className='focused'" onblur="this.className='blurred'">
<button type="submit">検索する</button></form>`
  ),
  '/break-form': page(
    '入力で壊れるフォーム',
    `<form aria-label="壊れる"><input name="q" aria-label="入力"
oninput="fetch('/api/boom'); this.form.remove()"><button type="submit">送る</button></form>`
  ),
  '/polling': page(
    '定期的な問い合わせ',
    `<p id="t">待機中</p><button type="button" onclick="document.getElementById('t').textContent='押しました'">押す</button>
<script>setInterval(() => fetch('/api/ok'), 100);</script>`
  ),
  '/blank': page('真っ白', `<button type="button" onclick="document.body.innerHTML=''">消す</button>`),
  '/slow': page('遅い', `<button type="button" onclick="fetch('/api/slow')">遅い API</button>`),
  '/a11y': page('アクセシビリティ', `<input type="text"><img src="/missing.png">`),
  '/dead-end-start': page('入口', `<a href="/dead-end">行き止まりへ</a>`, { withAside: false }),
  '/dead-end': page('行き止まり', `<p role="alert">エラーが起きました</p>`, { withAside: false }),
  '/outside': page('担当外', `<p>ここは担当外です。</p>`),
  '/login': page(
    'ログイン',
    `<form aria-label="ログイン">
<input id="tenantId" name="tenantId" required aria-label="テナント ID">
<input id="username" name="username" required aria-label="ユーザー ID">
<input id="password" name="password" type="password" required aria-label="パスワード">
<button type="submit">ログイン</button></form>
<script>
document.querySelector('form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (document.getElementById('password').value !== 'secret') return;
  sessionStorage.setItem('TENANT_ID', document.getElementById('tenantId').value);
  document.cookie = 'sid=1; path=/';
  location.href = '/home';
});
</script>`,
    { withAside: false }
  ),
  '/home': page(
    'ホーム',
    `<p id="who"></p><button type="button" id="who-btn">テナント表示</button>
<button type="button" onclick="document.getElementById('more').hidden = !document.getElementById('more').hidden">詳細</button>
<div id="more" hidden><button type="button">詳細の中のボタン</button></div>
<button type="button" onclick="document.cookie = 'sid=; path=/; max-age=0'; location.href = '/login'">ログアウト</button>
<script>
// Cookie（サーバーのセッションの代わり）が消えていたら、sessionStorage があってもログイン画面へ戻す
if (!sessionStorage.getItem('TENANT_ID') || !document.cookie.includes('sid=1')) location.href = '/login';
document.getElementById('who-btn').addEventListener('click', async () => {
  const res = await fetch('/api/whoami', { headers: { 'X-Tenant-ID': sessionStorage.getItem('TENANT_ID') ?? '' } });
  document.getElementById('who').textContent = await res.text();
});
</script>`,
    { withAside: false }
  ),
};

export async function installTestSite(context: BrowserContext, log: SiteLog = newSiteLog()): Promise<SiteLog> {
  await context.route('https://example.com/**', (route) => route.fulfill({ status: 200, body: 'external' }));
  await context.route(`${SITE_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    if (pathname.startsWith('/api/')) {
      log.apiCalls.push(pathname);
      switch (pathname) {
        case '/api/boom':
          return route.fulfill({ status: 500, body: 'boom' });
        case '/api/missing':
          return route.fulfill({ status: 404, body: 'missing' });
        case '/api/slow':
          await new Promise((r) => setTimeout(r, SLOW_API_DELAY_MS));
          return route.fulfill({ status: 200, body: 'slow' });
        case '/api/side':
          log.sideClicks++;
          return route.fulfill({ status: 200, body: 'side' });
        case '/api/excluded':
          log.excludedClicks++;
          return route.fulfill({ status: 200, body: 'excluded' });
        case '/api/echo':
          log.echoBodies.push(JSON.parse(route.request().postData() || '{}') as Record<string, string>);
          return route.fulfill({ status: 200, body: 'ok' });
        case '/api/whoami': {
          const tenant = route.request().headers()['x-tenant-id'];
          return tenant ? route.fulfill({ status: 200, body: tenant }) : route.fulfill({ status: 401, body: 'no tenant' });
        }
        default:
          return route.fulfill({ status: 200, body: 'ok' });
      }
    }
    if (pathname === '/missing.png') return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' });
    const html = PAGES[pathname];
    if (!html) return route.fulfill({ status: 404, contentType: 'text/html', body: page('見つかりません', '<p>404</p>') });
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
  });
  return log;
}

export interface TestConfigOptions {
  groups?: GroupConfig[];
  axe?: boolean;
  maxDepth?: number;
  maxActions?: number;
  seed?: number;
}

/** 既定の設定を、テスト用サイトに向けて速く回るように書き換える。 */
export function testConfig(options: TestConfigOptions = {}): ExplorerConfig {
  const base = JSON.parse(readFileSync(DEFAULT_CONFIG_PATH, 'utf-8')) as ExplorerConfig;
  base.target.baseUrl = SITE_ORIGIN;
  base.target.apiUrl = SITE_ORIGIN;
  base.target.login = {
    path: '/login',
    tenantField: '#tenantId',
    userField: '#username',
    passwordField: '#password',
    submit: 'form button[type=submit]',
  };
  base.timing = { settleQuietMs: 150, settleTimeoutMs: 3000, navigationTimeoutMs: 5000 };
  base.oracle.slowResponseMs = 400;
  base.oracle.slowActionMs = 2000;
  base.oracle.axe = options.axe ?? false;
  base.oracle.viewports = [{ name: 'desktop', width: 1024, height: 700 }];
  base.crawl.inputKinds = ['empty', 'max', 'maxPlus1', 'symbols', 'emoji', 'negative', 'long'];
  base.crawl.longLength = 300;
  base.limits = { maxDepth: options.maxDepth ?? 2, maxActions: options.maxActions ?? 200, maxActionsPerState: 40, maxMinutes: 5 };
  base.seed = options.seed ?? 1;
  base.tenants = { perShard: false, prefix: 'e2e-' };
  base.roles = {
    anonymous: { description: '未ログイン', anonymous: true },
    tester: { description: 'テスト用', loginId: 'tester', password: 'secret', sourceTenantId: 'test-tenant' },
  };
  base.groups = options.groups ?? [
    { id: 'site', description: 'テスト用サイト', startPath: '/', include: ['^/(?!outside)'], roles: ['anonymous'] },
  ];
  return applyOverrides(base, {});
}
