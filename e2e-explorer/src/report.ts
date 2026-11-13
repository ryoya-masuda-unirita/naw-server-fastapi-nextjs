import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RawFinding } from './oracle.ts';
import { KIND_TITLES } from './oracle.ts';
import type { FindingGroup, FindingKind, MergedReport, Severity, ShardReport } from './types.ts';

/** 担当範囲ごとの結果のまとめと、人・機械が読む形での出力。 */

export const SHARD_REPORT_FILE = 'shard-report.json';
const SEVERITY_ORDER: Severity[] = ['high', 'medium', 'low'];
const SEVERITY_LABELS: Record<Severity, string> = { high: '高', medium: '中', low: '低' };
const FINGERPRINT_TEXT_LENGTH = 200;

/** 指紋のために、ID・数字・クエリなど毎回変わる部分を消す。 */
export function normalizeForFingerprint(text: string): string {
  return text
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':uuid')
    .replace(/\?[^\s"')]*/g, '')
    .replace(/\d+/g, ':n')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FINGERPRINT_TEXT_LENGTH);
}

/** 同じ症状・同じ場所を同じ指紋にする。権限・担当範囲は含めない（まとめて発生回数を数えるため）。 */
export function fingerprintOf(finding: Pick<RawFinding, 'kind' | 'location' | 'message'>): string {
  const source = [finding.kind, normalizeForFingerprint(finding.location), normalizeForFingerprint(finding.message)].join(
    '|'
  );
  return createHash('sha1').update(source).digest('hex').slice(0, 16);
}

export function mergeReports(reports: ShardReport[], seed: number): MergedReport {
  const groups = new Map<string, FindingGroup>();
  for (const report of reports) {
    for (const finding of report.findings) {
      const existing = groups.get(finding.fingerprint);
      if (existing) {
        existing.occurrences++;
        if (!existing.shards.includes(finding.shardId)) existing.shards.push(finding.shardId);
        if (!existing.roles.includes(finding.role)) existing.roles.push(finding.role);
        // スクリーンショットのある例を優先する（担当範囲内で最初の 1 件にだけ撮るため）
        if (!existing.example.screenshot && finding.screenshot) existing.example = finding;
        continue;
      }
      groups.set(finding.fingerprint, {
        fingerprint: finding.fingerprint,
        kind: finding.kind,
        severity: finding.severity,
        title: finding.title,
        location: finding.location,
        message: finding.message,
        occurrences: 1,
        shards: [finding.shardId],
        roles: [finding.role],
        example: finding,
      });
    }
  }

  const sorted = [...groups.values()].sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      a.kind.localeCompare(b.kind) ||
      a.location.localeCompare(b.location) ||
      a.fingerprint.localeCompare(b.fingerprint)
  );

  const bySeverity: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  const byKind: Partial<Record<FindingKind, number>> = {};
  for (const group of sorted) {
    bySeverity[group.severity]++;
    byKind[group.kind] = (byKind[group.kind] ?? 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    seed,
    shards: reports.map((r) => ({
      shardId: r.shardId,
      groupId: r.groupId,
      role: r.role,
      tenantId: r.tenantId,
      seed: r.seed,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      durationMs: r.durationMs,
      stats: r.stats,
      outOfScope: r.outOfScope,
      replayFailures: r.replayFailures,
      error: r.error,
    })),
    totals: {
      groups: sorted.length,
      occurrences: sorted.reduce((sum, g) => sum + g.occurrences, 0),
      bySeverity,
      byKind,
    },
    groups: sorted,
  };
}

export async function writeShardReport(shardDir: string, report: ShardReport): Promise<string> {
  await mkdir(shardDir, { recursive: true });
  const file = path.join(shardDir, SHARD_REPORT_FILE);
  await writeFile(file, JSON.stringify(report, null, 2));
  return file;
}

/** 出力先の shards/<ID>/shard-report.json をすべて読む。並びは担当範囲の ID 順。 */
export async function readShardReports(outDir: string): Promise<ShardReport[]> {
  const shardsDir = path.join(outDir, 'shards');
  let names: string[];
  try {
    names = (await readdir(shardsDir)).sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  const reports: ShardReport[] = [];
  for (const name of names) {
    try {
      reports.push(JSON.parse(await readFile(path.join(shardsDir, name, SHARD_REPORT_FILE), 'utf-8')) as ShardReport);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw e;
    }
  }
  return reports;
}

export interface WrittenReport {
  json: string;
  markdown: string;
  html: string;
}

export async function writeMergedReport(outDir: string, merged: MergedReport): Promise<WrittenReport> {
  await mkdir(outDir, { recursive: true });
  const files = {
    json: path.join(outDir, 'report.json'),
    markdown: path.join(outDir, 'report.md'),
    html: path.join(outDir, 'report.html'),
  };
  await writeFile(files.json, JSON.stringify(merged, null, 2));
  await writeFile(files.markdown, renderMarkdown(merged));
  await writeFile(files.html, renderHtml(merged));
  return files;
}

function mdCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function renderMarkdown(merged: MergedReport): string {
  const lines: string[] = [];
  lines.push('# E2E 探索レポート', '');
  lines.push(`- 生成: ${merged.generatedAt}`);
  lines.push(`- 乱数の種: ${merged.seed}`);
  lines.push(
    `- 疑い: ${merged.totals.groups} 件（発生 ${merged.totals.occurrences} 回）` +
      ` / 高 ${merged.totals.bySeverity.high}・中 ${merged.totals.bySeverity.medium}・低 ${merged.totals.bySeverity.low}`,
    ''
  );

  lines.push('## 担当範囲', '');
  lines.push('| 担当範囲 | 権限 | テナント | 状態 | 仮画面 | 操作 | 共有で飛ばした | 担当外 | 再生失敗 | 時間 | 終了理由 |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const s of merged.shards) {
    lines.push(
      `| ${s.shardId} | ${s.role} | ${s.tenantId ?? '-'} | ${s.stats.states} | ${s.stats.placeholderStates ?? 0} | ${s.stats.actions} | ${s.stats.skippedShared} | ` +
        `${s.outOfScope.length} | ${s.stats.replayFailures} | ${Math.round(s.durationMs / 1000)}s | ${s.stats.stoppedBy}` +
        `${s.error ? `（${mdCell(s.error)}）` : ''} |`
    );
  }
  lines.push('');

  lines.push('## 疑いの一覧', '');
  if (merged.groups.length === 0) lines.push('疑いは見つかりませんでした。', '');
  else {
    lines.push('| # | 重大度 | 種類 | 場所 | 症状 | 回数 | 担当範囲 |');
    lines.push('|---|---|---|---|---|---|---|');
    merged.groups.forEach((g, i) => {
      lines.push(
        `| ${i + 1} | ${SEVERITY_LABELS[g.severity]} | ${KIND_TITLES[g.kind]} | ${mdCell(g.location)} | ${mdCell(g.message)} | ` +
          `${g.occurrences} | ${g.shards.join(', ')} |`
      );
    });
    lines.push('');
  }

  lines.push('## 詳細', '');
  merged.groups.forEach((g, i) => {
    const ex = g.example;
    lines.push(`### ${i + 1}. [${SEVERITY_LABELS[g.severity]}] ${KIND_TITLES[g.kind]}: ${g.location}`, '');
    lines.push(`- 症状: ${g.message}`);
    lines.push(`- 指紋: \`${g.fingerprint}\``);
    lines.push(`- 発生: ${g.occurrences} 回（担当範囲: ${g.shards.join(', ')} / 権限: ${g.roles.join(', ')}）`);
    lines.push(`- 画面: ${ex.pageUrl}`);
    if (ex.screenshot) lines.push(`- スクリーンショット: [${ex.screenshot}](${ex.screenshot})`);
    if (ex.trace) lines.push(`- trace: \`npx playwright show-trace ${ex.trace}\``);
    if (ex.details && Object.keys(ex.details).length > 0) {
      lines.push('- 詳細:', '', '```json', JSON.stringify(ex.details, null, 2), '```');
    }
    lines.push('', '再現手順:', '');
    ex.steps.forEach((step, n) => lines.push(`${n + 1}. ${step.description}`));
    lines.push('');
  });

  const outOfScope = merged.shards.flatMap((s) => s.outOfScope.map((o) => ({ shard: s.shardId, ...o })));
  if (outOfScope.length > 0) {
    lines.push('## 担当外への遷移（掘っていない）', '');
    lines.push('| 担当範囲 | 元の画面 | 操作 | 遷移先 |');
    lines.push('|---|---|---|---|');
    for (const o of outOfScope) lines.push(`| ${o.shard} | ${o.fromPath} | ${mdCell(o.action)} | ${mdCell(o.toUrl)} |`);
    lines.push('');
  }
  return lines.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderHtml(merged: MergedReport): string {
  const rows = merged.groups
    .map((g, i) => {
      const ex = g.example;
      const steps = ex.steps.map((s) => `<li>${escapeHtml(s.description)}</li>`).join('');
      const shot = ex.screenshot
        ? `<a href="${escapeHtml(ex.screenshot)}"><img src="${escapeHtml(ex.screenshot)}" alt="スクリーンショット ${i + 1}" loading="lazy"></a>`
        : '';
      const trace = ex.trace ? `<p>trace: <code>npx playwright show-trace ${escapeHtml(ex.trace)}</code></p>` : '';
      const details =
        ex.details && Object.keys(ex.details).length > 0
          ? `<pre>${escapeHtml(JSON.stringify(ex.details, null, 2))}</pre>`
          : '';
      return `<details class="sev-${g.severity}">
<summary><span class="badge">${SEVERITY_LABELS[g.severity]}</span> ${i + 1}. ${escapeHtml(KIND_TITLES[g.kind])} — ${escapeHtml(g.location)} <small>(${g.occurrences} 回 / ${escapeHtml(g.shards.join(', '))})</small></summary>
<p>症状: ${escapeHtml(g.message)}</p>
<p>画面: ${escapeHtml(ex.pageUrl)} / 権限: ${escapeHtml(g.roles.join(', '))} / 指紋: <code>${escapeHtml(g.fingerprint)}</code></p>
<ol>${steps}</ol>${details}${trace}${shot}
</details>`;
    })
    .join('\n');
  const shardRows = merged.shards
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.shardId)}</td><td>${escapeHtml(s.role)}</td><td>${escapeHtml(s.tenantId ?? '-')}</td>` +
        `<td>${s.stats.states}</td><td>${s.stats.actions}</td><td>${s.stats.skippedShared}</td><td>${s.outOfScope.length}</td>` +
        `<td>${Math.round(s.durationMs / 1000)}s</td><td>${escapeHtml(s.stats.stoppedBy)}${s.error ? ` (${escapeHtml(s.error)})` : ''}</td></tr>`
    )
    .join('');
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>E2E 探索レポート</title>
<style>
body { font-family: system-ui, sans-serif; margin: 16px; color: #1f2933; background: #fff; }
table { border-collapse: collapse; margin-bottom: 16px; }
td, th { border: 1px solid #cbd2d9; padding: 4px 8px; font-size: 13px; }
details { border: 1px solid #cbd2d9; border-radius: 6px; padding: 8px; margin-bottom: 8px; }
summary { cursor: pointer; }
.badge { display: inline-block; min-width: 1.5em; text-align: center; border-radius: 4px; color: #fff; padding: 0 4px; }
.sev-high .badge { background: #c62828; }
.sev-medium .badge { background: #ef6c00; }
.sev-low .badge { background: #546e7a; }
img { max-width: 100%; border: 1px solid #cbd2d9; margin-top: 8px; }
pre { background: #f5f7fa; padding: 8px; overflow-x: auto; }
</style>
</head>
<body>
<h1>E2E 探索レポート</h1>
<p>生成: ${escapeHtml(merged.generatedAt)} / 乱数の種: ${merged.seed} / 疑い: ${merged.totals.groups} 件（発生 ${merged.totals.occurrences} 回）
 / 高 ${merged.totals.bySeverity.high}・中 ${merged.totals.bySeverity.medium}・低 ${merged.totals.bySeverity.low}</p>
<h2>担当範囲</h2>
<table><tr><th>担当範囲</th><th>権限</th><th>テナント</th><th>状態</th><th>操作</th><th>共有で飛ばした</th><th>担当外</th><th>時間</th><th>終了理由</th></tr>${shardRows}</table>
<h2>疑い</h2>
${rows || '<p>疑いは見つかりませんでした。</p>'}
</body>
</html>
`;
}
