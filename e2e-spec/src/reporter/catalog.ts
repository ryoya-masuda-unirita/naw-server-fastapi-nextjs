import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SPEC_BOOK_DIR } from '../env.ts';

/**
 * 結合テスト項目書（25DA61_結合テスト項目書_md/）の読み込み。
 * カテゴリ 1 ファイルにつき 1 つの表があり、先頭の列が項番。項番は "20.0" のように小数で書かれていることがある。
 */

export interface SpecItem {
  /** 項番（整数）。 */
  no: number;
  /** 小項目。 */
  title: string;
  /** テスト方法。 */
  method: string;
  /** 確認内容。 */
  expected: string;
  /** 備考（移植元の実際の挙動が書かれていることがある）。 */
  note: string;
}

export interface SpecCategory {
  /** 2 桁のカテゴリ番号（ファイル名の先頭）。例: "03" */
  id: string;
  /** カテゴリ名。例: "ログイン" */
  name: string;
  items: SpecItem[];
}

/** 項目の表を持つカテゴリのファイル（00_表紙・01_管理情報・02_サマリは対象外）。 */
const CATEGORY_FILE = /^(\d{2})_(.+)\.md$/;
const FIRST_CATEGORY_NO = 3;
/** 表の列の位置（項番・小項目・テスト方法・確認内容・担当者・1〜3回目・備考）。 */
const COLUMN = { no: 0, title: 1, method: 2, expected: 3, note: 8 } as const;

/**
 * 項番とカテゴリ番号から、テスト名に付ける ID を作る。
 *
 * @param categoryId 2 桁のカテゴリ番号
 * @param no 項番
 * @returns 例: "03-02"
 */
export function formatCaseId(categoryId: string, no: number): string {
  return `${categoryId}-${String(no).padStart(2, '0')}`;
}

/**
 * テスト名の先頭の `[カテゴリ-項番]` を読む。
 *
 * @param title テスト名
 * @returns 正規化した ID（例: "03-02"）。付いていなければ null
 */
export function parseCaseId(title: string): string | null {
  const match = /^\[(\d{2})-(\d{1,3})\]/.exec(title);
  if (!match) return null;
  return formatCaseId(match[1], Number(match[2]));
}

function cleanCell(cell: string): string {
  return cell.replace(/<br\s*\/?>/g, '\n').trim();
}

/** Markdown の表の 1 行をセルに分ける。 */
function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cleanCell);
}

function parseCategory(id: string, name: string, markdown: string): SpecCategory {
  const items: SpecItem[] = [];
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = splitRow(line);
    const no = Number(cells[COLUMN.no]);
    // ヘッダー行（項番）と区切り行（---）は数値にならないので読み飛ばす
    if (!Number.isFinite(no) || cells[COLUMN.no] === '') continue;
    items.push({
      no: Math.trunc(no),
      title: cells[COLUMN.title] ?? '',
      method: cells[COLUMN.method] ?? '',
      expected: cells[COLUMN.expected] ?? '',
      note: cells[COLUMN.note] ?? '',
    });
  }
  return { id, name, items };
}

/**
 * 項目書のすべてのカテゴリを読む。
 *
 * @param dir 項目書のディレクトリ
 * @returns カテゴリ番号順のカテゴリ一覧
 */
export function loadCatalog(dir: string = SPEC_BOOK_DIR): SpecCategory[] {
  const files = readdirSync(dir).sort();
  const categories: SpecCategory[] = [];
  for (const file of files) {
    const match = CATEGORY_FILE.exec(file);
    if (!match || Number(match[1]) < FIRST_CATEGORY_NO) continue;
    categories.push(parseCategory(match[1], match[2], readFileSync(path.join(dir, file), 'utf-8')));
  }
  return categories;
}
