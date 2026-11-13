import { spawnSync } from 'node:child_process';
import { COMPOSE_PROJECT_NAME } from './env.ts';

/**
 * 専用環境の PostgreSQL を直接読む・書くヘルパー（カテゴリ 18・19 用）。
 *
 * API の応答を「正」にすると、backend の不具合が期待値に混ざってしまう。一覧の件数・並び順の期待値は、
 * 画面や API を介さず DB から取り、画面と突き合わせる。また、チャットの回答にフィードバックを付けるには LLM が要るため、
 * 件数の多いテストデータ（ルーム・メッセージ・フィードバック）は SQL で入れる。
 * 接続先は E2E_SPEC_PROJECT のコンテナ（`<プロジェクト名>-postgres-1`）だけ。
 */

export class SqlError extends Error {}

const FIELD_SEPARATOR = '\t';
const DB_USER = 'root';
const DB_NAME = 'postgres';

/**
 * SQL を実行して、結果の行（列は文字列）を返す。
 *
 * @param statement 実行する SQL（複数文も可。結果は最後の SELECT）
 * @returns 行の配列。NULL は空文字
 * @throws SqlError psql が失敗したとき
 */
export function sql(statement: string): string[][] {
  const result = spawnSync(
    'docker',
    ['exec', '-i', `${COMPOSE_PROJECT_NAME}-postgres-1`, 'psql', '-U', DB_USER, '-d', DB_NAME, '-At', '-F', FIELD_SEPARATOR, '-v', 'ON_ERROR_STOP=1', '-q'],
    { input: statement, encoding: 'utf-8' }
  );
  if (result.error) throw new SqlError(`docker を実行できません: ${result.error.message}`);
  if (result.status !== 0) throw new SqlError(`SQL が失敗しました: ${result.stderr}\n${statement}`);
  // 空文字だけの行（NULL・空文字の 1 列）も行として数える。末尾の改行だけ落とす
  const lines = result.stdout.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines.map((line) => line.split(FIELD_SEPARATOR));
}

/**
 * 1 行 1 列の SELECT の値を数値で返す（件数の取得用）。
 *
 * @param statement SELECT count(*) など
 * @returns 数値
 */
export function sqlNumber(statement: string): number {
  const rows = sql(statement);
  return Number(rows[0]?.[0] ?? Number.NaN);
}

/**
 * SQL の文字列リテラルにする（シングルクォートを重ねる）。
 *
 * @param value 値
 * @returns 引用符つきの SQL 文字列
 */
export function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
