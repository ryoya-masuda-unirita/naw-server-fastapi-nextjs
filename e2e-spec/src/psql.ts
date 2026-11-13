import { spawnSync } from 'node:child_process';
import { COMPOSE_PROJECT_NAME } from './env.ts';

/**
 * 専用環境の PostgreSQL に SQL を流すヘルパー。API では作れないデータ
 * （テナントのパスワードポリシー・過去のメッセージ内容など）の準備と後片付けに使う。
 * 接続先は専用環境（compose のプロジェクト名 `E2E_SPEC_PROJECT`）の postgres コンテナだけ。
 */

export class PsqlError extends Error {}

/** compose が付けるコンテナ名（`<プロジェクト名>-postgres-1`）。 */
const postgresContainer = (): string => `${COMPOSE_PROJECT_NAME}-postgres-1`;

/**
 * SQL を実行する。失敗したら例外にする。
 *
 * @param sql 実行する SQL（複数文可）
 * @returns 標準出力（`-t -A` なので、SELECT の結果は区切り `|` の行）
 * @throws PsqlError psql の実行に失敗したとき
 */
export function psql(sql: string): string {
  const result = spawnSync(
    'docker',
    ['exec', '-i', postgresContainer(), 'psql', '-U', 'root', '-d', 'postgres', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'],
    { input: sql, encoding: 'utf-8' }
  );
  if (result.error) throw new PsqlError(`docker を実行できません: ${result.error.message}`);
  if (result.status !== 0) throw new PsqlError(`psql が失敗しました: ${result.stderr}`);
  return result.stdout.trim();
}

/**
 * SQL 文字列リテラル用にシングルクォートをエスケープする。
 *
 * @param value 埋め込む文字列
 * @returns クォート済みのリテラル
 */
export function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
