import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { REPORT_DIR, TESTS_DIR } from '../env.ts';
import { loadCatalog, parseCaseId } from './catalog.ts';
import { buildSummary, renderMarkdown, type RecordStatus, type RunRecord, type RunResults } from './summary.ts';

/**
 * Playwright のレポーター。テスト名の `[カテゴリ-項番]` ごとに OK / NG / 未実施（skip）を集め、
 * 項目書と同じ形のカテゴリ別集計を Markdown と JSON に出す。
 *
 * 出力（REPORT_DIR。既定 reports/latest/）:
 *   results.json  項番ごとの結果（他の実行結果とまとめるときの入力）
 *   summary.json  カテゴリ別の集計と項目ごとの状態
 *   summary.md    人が読む集計
 */

/** ANSI のエスケープ（色）を除く。 */
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;

const MAX_REASON_LENGTH = 1500;
/** 複数のエラーを 1 つの文字列にまとめるときの区切り。 */
const REASON_SEPARATOR = '\n---\n';

/**
 * tests/ 配下のテストファイルに書かれている項番を集める。
 * 一部のテストだけを実行したとき、書かれていない項番（未作成）と、書かれているが実行に含まれない項番（未実行）を区別するため。
 *
 * @param dir テストファイルのディレクトリ
 * @returns 書かれている項番の一覧
 */
export function scanWrittenIds(dir: string = TESTS_DIR): string[] {
  const ids = new Set<string>();
  const pattern = /\[(\d{2})-(\d{1,3})\]/g;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.spec.ts')) continue;
    for (const match of readFileSync(path.join(dir, file), 'utf-8').matchAll(pattern)) {
      const id = parseCaseId(match[0]);
      if (id) ids.add(id);
    }
  }
  return [...ids].sort();
}

function skipReason(test: TestCase): string | undefined {
  return test.annotations.find((a) => a.type === 'skip')?.description;
}

function toRecord(test: TestCase, result: TestResult): RunRecord | null {
  const id = parseCaseId(test.title);
  if (!id) return null;
  const outcome = test.outcome();
  let status: RecordStatus;
  let reason: string | undefined;
  if (outcome === 'skipped') {
    status = 'SKIP';
    reason = skipReason(test) ?? '（理由が書かれていません。test.skip の第 2 引数に書いてください）';
  } else if (outcome === 'unexpected') {
    status = 'NG';
    // expect.soft の失敗は複数ある。全部残す（区切りは REASON_SEPARATOR）
    const messages = result.errors.map((e) => (e.message ?? '').replace(ANSI, ''));
    reason = (messages.length > 0 ? messages.join(REASON_SEPARATOR) : result.status).slice(0, MAX_REASON_LENGTH);
  } else {
    // expected / flaky（再実行で通った）は OK
    status = 'OK';
  }
  return { id, status, reason, testTitle: test.title, file: path.relative(TESTS_DIR, test.location.file) };
}

export default class SpecReporter implements Reporter {
  private readonly records = new Map<TestCase, RunRecord>();

  printsToStdio(): boolean {
    return false;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    // 再実行（retry）では最後の結果を採る
    const record = toRecord(test, result);
    if (record) this.records.set(test, record);
  }

  onEnd(_result: FullResult): void {
    const results: RunResults = {
      generatedAt: new Date().toISOString(),
      written: scanWrittenIds(),
      records: [...this.records.values()],
    };
    writeReports(results, REPORT_DIR);
    console.log(`\n項目書に沿った集計を出力しました: ${path.join(REPORT_DIR, 'summary.md')}`);
  }
}

/**
 * 実行結果から results.json・summary.json・summary.md を書く。
 *
 * @param results 実行結果
 * @param dir 出力先
 */
export function writeReports(results: RunResults, dir: string): void {
  mkdirSync(dir, { recursive: true });
  const summary = buildSummary(loadCatalog(), results);
  writeFileSync(path.join(dir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(path.join(dir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(path.join(dir, 'summary.md'), renderMarkdown(summary));
}
