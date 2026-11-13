import { expect, test, type Page } from '@playwright/test';
import { installOracleHooks, Oracle, type AfterActionInfo, type RawFinding } from '../src/oracle.ts';
import type { ExplorerConfig } from '../src/config.ts';
import { installTestSite, SITE_ORIGIN, testConfig } from './fixtures/test-site.ts';

/**
 * 判定役の単体テスト。テスト用サイトの画面を開き、begin → 操作 → end の間に
 * 起きた症状が、種類ごとに正しく「バグの疑い」になるかを見る。
 */

async function openPage(page: Page, config: ExplorerConfig, pathname: string): Promise<Oracle> {
  await installTestSite(page.context());
  await installOracleHooks(page.context());
  const oracle = new Oracle(config, page);
  await page.goto(`${SITE_ORIGIN}${pathname}`);
  await oracle.waitForSettle();
  return oracle;
}

async function act(
  page: Page,
  oracle: Oracle,
  operation: () => Promise<unknown>,
  { actionKind = 'click', abnormalInput = false, nativeInvalid = false }: Partial<AfterActionInfo> & { abnormalInput?: boolean } = {}
): Promise<RawFinding[]> {
  const urlBefore = page.url();
  await oracle.begin({ abnormalInput });
  await oracle.armChangeWatcher();
  const started = Date.now();
  await operation();
  await oracle.waitForSettle();
  const { findings } = await oracle.end({ actionKind, nativeInvalid, urlBefore }, Date.now() - started);
  return findings;
}

const kinds = (findings: RawFinding[]) => findings.map((f) => f.kind);

test('detects 5xx responses as high severity', async ({ page }) => {
  /** API が 500 を返したら、重大度「高」の HTTP 5xx として記録されること */
  const oracle = await openPage(page, testConfig(), '/server-error');
  const findings = await act(page, oracle, () => page.getByRole('button', { name: '読み込む' }).click());
  const http = findings.filter((f) => f.kind === 'http-5xx');
  expect(http).toHaveLength(1);
  expect(http[0].severity).toBe('high');
  expect(http[0].location).toBe('GET /api/boom');
});

test('detects unexpected 4xx separately from 5xx', async ({ page }) => {
  /** 想定外の 4xx は 5xx と区別して HTTP 4xx として記録されること */
  const oracle = await openPage(page, testConfig(), '/not-found-api');
  const findings = await act(page, oracle, () => page.getByRole('button', { name: '探す' }).click());
  expect(kinds(findings)).toContain('http-4xx');
  expect(kinds(findings)).not.toContain('http-5xx');
  expect(findings.find((f) => f.kind === 'http-4xx')?.severity).toBe('medium');
});

test('ignores 4xx declared as expected', async ({ page }) => {
  /** 設定で想定内とした 4xx は疑いにならないこと */
  const config = testConfig();
  config.oracle.expectedHttp = [{ method: 'GET', path: '^/api/missing$', status: [404] }];
  const oracle = await openPage(page, config, '/not-found-api');
  const findings = await act(page, oracle, () => page.getByRole('button', { name: '探す' }).click());
  expect(kinds(findings)).not.toContain('http-4xx');
});

test('treats 4xx right after abnormal input as expected', async ({ page }) => {
  /** onlyAfterAbnormalInput の規則は、異常値を送信した直後の 4xx だけを想定内とすること */
  const config = testConfig();
  config.oracle.expectedHttp = [{ status: [404], onlyAfterAbnormalInput: true }];
  const oracle = await openPage(page, config, '/not-found-api');
  const normal = await act(page, oracle, () => page.getByRole('button', { name: '探す' }).click());
  expect(kinds(normal)).toContain('http-4xx');
  const abnormal = await act(page, oracle, () => page.getByRole('button', { name: '探す' }).click(), { abnormalInput: true });
  expect(kinds(abnormal)).not.toContain('http-4xx');
});

test('detects console errors, uncaught exceptions and unhandled rejections', async ({ page }) => {
  /** コンソールのエラー・未処理の例外・未処理の reject がそれぞれ記録されること */
  const oracle = await openPage(page, testConfig(), '/console');
  const logged = await act(page, oracle, () => page.getByRole('button', { name: 'ログ' }).click());
  expect(kinds(logged)).toContain('console-error');
  expect(logged.find((f) => f.kind === 'console-error')?.message).toContain('わざとのエラー');

  const thrown = await act(page, oracle, () => page.getByRole('button', { name: '投げる' }).click());
  expect(kinds(thrown)).toContain('uncaught-exception');
  expect(thrown.find((f) => f.kind === 'uncaught-exception')?.severity).toBe('high');

  const rejected = await act(page, oracle, () => page.getByRole('button', { name: '拒否' }).click());
  const rejection = rejected.filter((f) => f.kind === 'unhandled-rejection' || f.kind === 'uncaught-exception');
  // Chromium は reject を pageerror でも通知するため、どちらか 1 件にまとまっていればよい
  expect(rejection).toHaveLength(1);
  expect(rejection[0].message).toContain('わざとの拒否');
});

test('detects horizontal overflow and protruding elements', async ({ page }) => {
  /** 画面幅より広い要素があると、横スクロールとはみ出しが記録されること */
  const oracle = await openPage(page, testConfig(), '/overflow');
  const findings = await oracle.inspectState();
  expect(kinds(findings)).toContain('horizontal-scroll');
  expect(kinds(findings)).toContain('element-overflow');
  expect(findings.find((f) => f.kind === 'element-overflow')?.location).toBe('/overflow @desktop');
});

test('reports no layout issue on a normal page', async ({ page }) => {
  /** 普通の画面では表示崩れの疑いが出ないこと */
  const oracle = await openPage(page, testConfig(), '/normal');
  const findings = await oracle.inspectState();
  expect(kinds(findings)).not.toContain('horizontal-scroll');
  expect(kinds(findings)).not.toContain('element-overflow');
});

test('detects blank screen', async ({ page }) => {
  /** 操作の後に本文が消えたら「真っ白」として記録されること */
  const oracle = await openPage(page, testConfig(), '/blank');
  const findings = await act(page, oracle, () => page.getByRole('button', { name: '消す' }).click());
  expect(kinds(findings)).toContain('blank-screen');
  expect(kinds(findings)).not.toContain('dead-end');
});

test('detects actions with no effect', async ({ page }) => {
  /** 押しても画面の変化・遷移・通信のどれもないボタンは「何も起きない」として記録されること */
  const oracle = await openPage(page, testConfig(), '/noop');
  const findings = await act(page, oracle, () => page.getByRole('button', { name: '押しても何もない' }).click());
  expect(kinds(findings)).toContain('no-effect');

  const oracle2 = await openPage(page, testConfig(), '/normal');
  const effective = await act(page, oracle2, () => page.getByRole('button', { name: '押す' }).click());
  expect(kinds(effective)).not.toContain('no-effect');
});

test('ignores focus-only style changes when judging no effect', async ({ page }) => {
  /** フォーカスが外れたときの見た目の切り替えだけでは「何か起きた」とみなさず、空白だけの送信を「何も起きない」と判定すること */
  const oracle = await openPage(page, testConfig(), '/focus-style');
  await page.getByRole('textbox', { name: '検索' }).fill('   ');
  const findings = await act(page, oracle, () => page.getByRole('button', { name: '検索する' }).click(), {
    actionKind: 'fill-submit',
    abnormalInput: true,
  });
  expect(kinds(findings)).toContain('no-effect');
});

test('does not judge placeholder screens as no effect', async ({ page }) => {
  /** 未移植の仮画面では「何も起きない」を疑いにせず、表示崩れは場所を 1 つにまとめて記録すること */
  const oracle = await openPage(page, testConfig(), '/placeholder');
  expect(await oracle.isPlaceholder()).toBe(true);
  const findings = await act(page, oracle, () => page.getByRole('button', { name: '何もしない' }).click());
  expect(kinds(findings)).not.toContain('no-effect');
  const layout = await oracle.inspectState();
  expect(layout.length).toBeGreaterThan(0);
  expect(layout.every((f) => f.location.startsWith('[未移植の仮画面]'))).toBe(true);
  // 仮画面の文字のはみ出しは見ない
  expect(layout.some((f) => f.message.includes('文字が枠からはみ出す'))).toBe(false);
});

test('does not flag submits blocked by native validation', async ({ page }) => {
  /** ブラウザの入力チェックで送信が止まった場合は「何も起きない」にならないこと */
  const oracle = await openPage(page, testConfig(), '/required');
  const findings = await act(page, oracle, () => page.getByRole('button', { name: '送る' }).click(), {
    actionKind: 'fill-submit',
    nativeInvalid: true,
    abnormalInput: true,
  });
  expect(kinds(findings)).not.toContain('no-effect');
});

test('detects slow responses', async ({ page }) => {
  /** しきい値より遅い API の応答が「遅い応答」として記録されること */
  const oracle = await openPage(page, testConfig(), '/slow');
  const findings = await act(page, oracle, () => page.getByRole('button', { name: '遅い API' }).click());
  const slow = findings.find((f) => f.kind === 'slow-response');
  expect(slow?.location).toBe('GET /api/slow');
});

test('detects accessibility violations with axe', async ({ page }) => {
  /** ラベルのない入力欄・代替テキストのない画像が axe の違反として記録されること */
  const oracle = await openPage(page, testConfig({ axe: true }), '/a11y');
  const findings = await oracle.inspectState();
  const rules = findings.filter((f) => f.kind === 'a11y').map((f) => f.details?.rule);
  expect(rules).toEqual(expect.arrayContaining(['label', 'image-alt']));
});

test('detects dead ends', async ({ page }) => {
  /** 操作できる要素がない画面に行き着いたら「戻れない」として記録されること */
  const oracle = await openPage(page, testConfig(), '/dead-end-start');
  const findings = await act(page, oracle, () => page.getByRole('link', { name: '行き止まりへ' }).click());
  const deadEnd = findings.find((f) => f.kind === 'dead-end');
  expect(deadEnd?.message).toContain('エラー表示');
});
