import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  API_URL,
  BACKEND_IMAGE_NAME,
  BACKEND_PORT,
  BASE_URL,
  COMPOSE_FILE,
  COMPOSE_OVERRIDE_FILE,
  COMPOSE_PROJECT_NAME,
  FRONTEND_PORT,
  REPO_ROOT,
  SPEC_SEED_SQL,
} from './env.ts';

/**
 * 専用環境（ルートの docker-compose.demo.yml をプロジェクト名 naw-e2e-spec・別ポートで起動したもの）の起動・破棄。
 * 既存の naw-demo・naw-e2e-explorer・開発用のコンテナとは、プロジェクト名・ポート・イメージ名・ボリュームが別で、触れない。
 */

export class EnvironmentError extends Error {}

const READY_TIMEOUT_MS = 180_000;
const READY_POLL_MS = 1_000;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** compose に渡す環境変数。demo の compose はポートを DEMO_*_PORT で受ける。 */
function composeEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DEMO_FRONTEND_PORT: String(FRONTEND_PORT),
    DEMO_BACKEND_PORT: String(BACKEND_PORT),
    E2E_SPEC_BACKEND_IMAGE: BACKEND_IMAGE_NAME,
  };
}

function composeArgs(args: string[]): string[] {
  return [
    'compose',
    '-p',
    COMPOSE_PROJECT_NAME,
    '--project-directory',
    REPO_ROOT,
    '-f',
    COMPOSE_FILE,
    '-f',
    COMPOSE_OVERRIDE_FILE,
    ...args,
  ];
}

function compose(args: string[], input?: string): void {
  const result = spawnSync('docker', composeArgs(args), {
    cwd: REPO_ROOT,
    env: composeEnv(),
    stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
    input,
  });
  if (result.error) throw new EnvironmentError(`docker を実行できません: ${result.error.message}`);
  if (result.status !== 0) {
    throw new EnvironmentError(`docker ${composeArgs(args).join(' ')} が失敗しました（終了コード ${result.status}）`);
  }
}

/**
 * 実行先がローカルであることを確かめる。dev・本番の環境に向けてデータを壊さないための安全策。
 *
 * @throws EnvironmentError ローカル以外の URL のとき
 */
export function assertLocalTarget(): void {
  for (const url of [BASE_URL, API_URL]) {
    const host = new URL(url).hostname;
    if (!LOCAL_HOSTS.has(host)) {
      throw new EnvironmentError(
        `${url} はローカルではありません。このテストはデータを作成・削除するため、ローカルの専用環境にだけ向けてください`
      );
    }
  }
}

/** 専用環境を起動し、追加の seed を入れて、画面と API が応答するまで待つ。 */
export async function envUp(log: (message: string) => void): Promise<void> {
  assertLocalTarget();
  log(`専用環境を起動します（プロジェクト名 ${COMPOSE_PROJECT_NAME}・画面 :${FRONTEND_PORT}・API :${BACKEND_PORT}）`);
  compose(['up', '-d', '--build', '--wait', 'backend', 'frontend']);
  log('追加の seed（システム管理者）を入れます');
  compose(
    ['exec', '-T', 'postgres', 'psql', '-U', 'root', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1'],
    readFileSync(SPEC_SEED_SQL, 'utf-8')
  );
  await waitUntilReady(log);
}

/** 専用環境を破棄する（ボリュームごと）。 */
export function envDown(log: (message: string) => void): void {
  log('専用環境を破棄します（データごと）');
  compose(['down', '-v', '--remove-orphans']);
}

/** compose の healthcheck に加えて、ホストから見える URL で応答を確かめる。 */
async function waitUntilReady(log: (message: string) => void): Promise<void> {
  const targets = [new URL('/health', API_URL).toString(), BASE_URL];
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
      await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
    }
    log(`応答あり: ${url}`);
  }
}
