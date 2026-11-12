import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { MODULE_ROOT, type ExplorerConfig, type Shard } from './config.ts';
import { buildTenantSql, planTenants } from './tenant-sql.ts';

/**
 * 専用環境（docker compose）の起動・破棄と、担当範囲ごとのテナントの作成。
 * 既存のローカル環境に触れないよう、compose のプロジェクト名・ファイルは設定の値だけを使う。
 */

export class EnvironmentError extends Error {}

const READY_TIMEOUT_MS = 120_000;
const READY_POLL_MS = 1_000;

function composeArgs(config: ExplorerConfig, args: string[]): string[] {
  const file = path.resolve(MODULE_ROOT, config.environment.composeFile);
  return ['compose', '-p', config.environment.projectName, '-f', file, ...args];
}

function compose(config: ExplorerConfig, args: string[], input?: string): void {
  const result = spawnSync('docker', composeArgs(config, args), {
    cwd: MODULE_ROOT,
    stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
    input,
  });
  if (result.error) throw new EnvironmentError(`docker を実行できません: ${result.error.message}`);
  if (result.status !== 0) {
    throw new EnvironmentError(`docker ${composeArgs(config, args).join(' ')} が失敗しました（終了コード ${result.status}）`);
  }
}

export async function envUp(config: ExplorerConfig, shards: Shard[], log: (m: string) => void): Promise<void> {
  log('専用環境を起動します（PostgreSQL・Redis・マイグレーション・seed・backend・frontend）');
  compose(config, ['up', '-d', '--build', '--wait', 'backend', 'frontend']);
  await waitUntilReady(config, log);
  provisionTenants(config, shards, log);
}

export function provisionTenants(config: ExplorerConfig, shards: Shard[], log: (m: string) => void): void {
  const plans = planTenants(config, shards);
  if (plans.length === 0) {
    log('作る専用テナントはありません');
    return;
  }
  log(`担当範囲ごとのテナントを作ります: ${plans.map((p) => p.tenantId).join(', ')}`);
  compose(config, ['exec', '-T', 'postgres', 'psql', '-U', 'root', '-d', 'postgres', '-q'], buildTenantSql(plans));
}

export function envDown(config: ExplorerConfig, log: (m: string) => void): void {
  log('専用環境を破棄します（データごと）');
  compose(config, ['down', '-v', '--remove-orphans']);
}

/** compose の healthcheck に加えて、ホストのブラウザから見える URL で応答を確かめる。 */
async function waitUntilReady(config: ExplorerConfig, log: (m: string) => void): Promise<void> {
  const targets = [new URL('/health', config.target.apiUrl).toString(), config.target.baseUrl];
  const started = Date.now();
  for (const url of targets) {
    for (;;) {
      try {
        const res = await fetch(url);
        if (res.ok) break;
      } catch {
        // 起動途中は接続を拒否されるので待つ
      }
      if (Date.now() - started > READY_TIMEOUT_MS) {
        throw new EnvironmentError(`${url} が ${READY_TIMEOUT_MS / 1000} 秒以内に応答しませんでした`);
      }
      await new Promise((r) => setTimeout(r, READY_POLL_MS));
    }
    log(`応答あり: ${url}`);
  }
}
