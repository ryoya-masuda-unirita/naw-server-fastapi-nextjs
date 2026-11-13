import { formatCaseId, type SpecCategory } from './catalog.ts';

/**
 * テストの実行結果（項番ごと）と項目書を突き合わせて、カテゴリごとの OK / NG / 未実施を数える。
 * 項目書のサマリと同じ形（カテゴリごとの 項目数・OK・NG・未実施）にする。
 */

/** 1 つのテストの結果。テスト名の `[カテゴリ-項番]` が同じものは、項番ごとに 1 つにまとめる。 */
export type RecordStatus = 'OK' | 'NG' | 'SKIP';

export interface RunRecord {
  /** 例: "03-02" */
  id: string;
  status: RecordStatus;
  /** NG のときのエラー、SKIP のときの理由。 */
  reason?: string;
  testTitle: string;
  file: string;
}

/** 実行結果のファイル（results.json）の中身。 */
export interface RunResults {
  generatedAt: string;
  /** テストファイルに書かれている項番（今回の実行に含まれたかは問わない）。 */
  written: string[];
  records: RunRecord[];
}

/** 項番ごとの最終的な状態。 */
export type ItemStatus = 'OK' | 'NG' | 'SKIP' | 'NOT_RUN' | 'NOT_WRITTEN';

export interface ItemSummary {
  id: string;
  title: string;
  status: ItemStatus;
  /** NG のエラー・未実施の理由。 */
  reason?: string;
  testTitles: string[];
}

export interface CategorySummary {
  id: string;
  name: string;
  total: number;
  ok: number;
  ng: number;
  /** 未実施の合計（skip + 未実行 + 未作成）。 */
  skipped: number;
  /** 未実施のうち、理由つきで skip したもの。 */
  skippedWithReason: number;
  /** 未実施のうち、テストがまだ書かれていないもの。 */
  notWritten: number;
  /** 未実施のうち、テストはあるが今回の実行に含まれなかったもの。 */
  notRun: number;
  items: ItemSummary[];
}

export interface Summary {
  generatedAt: string;
  categories: CategorySummary[];
  totals: Omit<CategorySummary, 'id' | 'name' | 'items'>;
}

/** 同じ項番に複数のテストがあるときは、悪いほうを項番の結果にする。 */
const STATUS_SEVERITY: Record<RecordStatus, number> = { OK: 0, SKIP: 1, NG: 2 };

/**
 * 複数の実行結果（別々のワークツリー・実行回の results.json）を 1 つにまとめる。
 *
 * @param all まとめる実行結果
 * @returns 記録は全部連結、書かれた項番は和集合にした実行結果
 */
export function mergeRunResults(all: RunResults[]): RunResults {
  const written = new Set<string>();
  const records: RunRecord[] = [];
  for (const r of all) {
    r.written.forEach((id) => written.add(id));
    records.push(...r.records);
  }
  return { generatedAt: new Date().toISOString(), written: [...written].sort(), records };
}

function summarizeItem(id: string, title: string, records: RunRecord[], written: Set<string>): ItemSummary {
  if (records.length === 0) {
    return { id, title, status: written.has(id) ? 'NOT_RUN' : 'NOT_WRITTEN', testTitles: [] };
  }
  const worst = records.reduce((a, b) => (STATUS_SEVERITY[b.status] > STATUS_SEVERITY[a.status] ? b : a));
  return { id, title, status: worst.status, reason: worst.reason, testTitles: records.map((r) => r.testTitle) };
}

/**
 * 項目書と実行結果を突き合わせる。
 * テストが書かれていない項番は「未実施（未作成）」、書かれているが実行に含まれなかった項番は「未実施（未実行）」と数える。
 *
 * @param catalog 項目書のカテゴリ一覧
 * @param results 実行結果
 * @returns カテゴリごと・合計の集計
 */
export function buildSummary(catalog: SpecCategory[], results: RunResults): Summary {
  const written = new Set(results.written);
  const byId = new Map<string, RunRecord[]>();
  for (const record of results.records) {
    byId.set(record.id, [...(byId.get(record.id) ?? []), record]);
  }

  const categories = catalog.map((category): CategorySummary => {
    const items = category.items.map((item) => {
      const id = formatCaseId(category.id, item.no);
      return summarizeItem(id, item.title, byId.get(id) ?? [], written);
    });
    const count = (status: ItemStatus): number => items.filter((i) => i.status === status).length;
    const notWritten = count('NOT_WRITTEN');
    const notRun = count('NOT_RUN');
    const skippedWithReason = count('SKIP');
    return {
      id: category.id,
      name: category.name,
      total: items.length,
      ok: count('OK'),
      ng: count('NG'),
      skipped: notWritten + notRun + skippedWithReason,
      skippedWithReason,
      notWritten,
      notRun,
      items,
    };
  });

  const sum = (pick: (c: CategorySummary) => number): number => categories.reduce((n, c) => n + pick(c), 0);
  return {
    generatedAt: results.generatedAt,
    categories,
    totals: {
      total: sum((c) => c.total),
      ok: sum((c) => c.ok),
      ng: sum((c) => c.ng),
      skipped: sum((c) => c.skipped),
      skippedWithReason: sum((c) => c.skippedWithReason),
      notWritten: sum((c) => c.notWritten),
      notRun: sum((c) => c.notRun),
    },
  };
}

/** エラーの文字列（複数ある場合は `\n---\n` 区切り）を、表の 1 セルに収まる短さにする。 */
function briefReason(text: string): string {
  return text
    .split('\n---\n')
    .map((part) =>
      part
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== '')
        .slice(0, 3)
        .join(' / ')
    )
    .join(' ; ')
    .replace(/\|/g, '\\|');
}

/**
 * 集計を Markdown にする。先頭の表は項目書のサマリと同じ形（項目数・OK・NG・未実施）。
 *
 * @param summary 集計
 * @returns Markdown
 */
export function renderMarkdown(summary: Summary): string {
  const rows = summary.categories.map(
    (c) => `| ${c.id}_${c.name} | ${c.total} | ${c.ok} | ${c.ng} | ${c.skipped} | ${c.skippedWithReason} | ${c.notRun} | ${c.notWritten} |`
  );
  const t = summary.totals;
  const lines = [
    '# 結合テスト項目書に沿った E2E の結果',
    '',
    `生成: ${summary.generatedAt}`,
    '',
    '| テストカテゴリ | 項目数 | OK | NG | 未実施 | うち skip（理由あり） | うち未実行 | うち未作成 |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
    `| 合計 | ${t.total} | ${t.ok} | ${t.ng} | ${t.skipped} | ${t.skippedWithReason} | ${t.notRun} | ${t.notWritten} |`,
    '',
    '未実施 = skip（理由あり）+ 未実行（テストはあるが今回の実行に含まれない）+ 未作成（テストがない）。',
  ];

  const ng = summary.categories.flatMap((c) => c.items.filter((i) => i.status === 'NG'));
  lines.push('', '## NG', '');
  if (ng.length === 0) lines.push('なし');
  else {
    lines.push('| 項番 | 小項目 | エラー |', '|---|---|---|');
    for (const i of ng) lines.push(`| ${i.id} | ${i.title} | ${briefReason(i.reason ?? '')} |`);
  }

  const skipped = summary.categories.flatMap((c) => c.items.filter((i) => i.status === 'SKIP'));
  lines.push('', '## 未実施（skip・理由あり）', '');
  if (skipped.length === 0) lines.push('なし');
  else {
    lines.push('| 項番 | 小項目 | 理由 |', '|---|---|---|');
    for (const i of skipped) lines.push(`| ${i.id} | ${i.title} | ${briefReason(i.reason ?? '')} |`);
  }
  return `${lines.join('\n')}\n`;
}
