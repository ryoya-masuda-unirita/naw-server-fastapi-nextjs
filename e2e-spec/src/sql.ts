import { spawnSync } from 'node:child_process';
import { COMPOSE_PROJECT_NAME } from './env.ts';

/**
 * 専用環境の PostgreSQL に SQL を流すヘルパー。API では作れない・変えられないテストデータ
 * （プランの上限・トークン使用量など）を用意するときだけ使う。
 * 接続先は専用環境のコンテナ（`<プロジェクト名>-postgres-1`）に固定で、ほかの環境には触れない。
 */

export class SqlError extends Error {}

/**
 * SQL を実行する。
 *
 * @param sql 実行する SQL（複数の文を `;` で続けてよい）
 * @returns 標準出力（`psql -t -A` の形式。行は改行区切り、列は `|` 区切り）
 * @throws SqlError 実行に失敗したとき
 */
export function runSql(sql: string): string {
  const result = spawnSync(
    'docker',
    ['exec', '-i', `${COMPOSE_PROJECT_NAME}-postgres-1`, 'psql', '-U', 'root', '-d', 'postgres', '-t', '-A', '-q', '-v', 'ON_ERROR_STOP=1'],
    { input: sql, encoding: 'utf-8' }
  );
  if (result.error) throw new SqlError(`docker を実行できません: ${result.error.message}`);
  if (result.status !== 0) throw new SqlError(`SQL の実行に失敗しました: ${result.stderr}`);
  return result.stdout.trim();
}
