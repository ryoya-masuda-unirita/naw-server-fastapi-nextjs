import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { request, type APIRequestContext } from '@playwright/test';
import { COMPOSE_PROJECT_NAME, FRONTEND_PORT, MODULE_ROOT, REPO_ROOT } from './env.ts';

/**
 * Waha!（生成AI連携・学習・検索。カテゴリ 20〜22）を、このリポジトリの Waha! エミュレーター（`waha-emulator/`）と
 * アダプタ（`generative-ai-adapter/`）で確かめるための環境。
 *
 * 項目書の 20〜22 は、Waha! のジョブ（Windows のファイルを入出力にする）を人が実行する項目。ここでは同じジョブを、エミュレーターの
 * servicerun API（`startsession` → `upload` → `execute` → `result` → `download`）で実行する。
 * - エミュレーター: ホストの子プロセス（`uv run uvicorn`）。ファイルの入出力はこのテスト専用の一時ディレクトリ
 * - ベクトル DB: `onprem/vector-db` のイメージ（pgvector + PGroonga + Apache AGE）の専用コンテナ。`E2E_SPEC_PROJECT` ごとに名前・ポートが分かれる
 * - Azure OpenAI: 実際の Azure には接続しない。同じ API の形で応える、このテスト専用の小さな HTTP サーバー
 */

export class WahaEnvError extends Error {}

const WAHA_API_BASE = '/WahaServer/servicerun/api';
const AUTH_KEY = 'spec-waha-authkey';
const EMULATOR_DIR = path.join(REPO_ROOT, 'waha-emulator');
const VECTOR_DB_INIT_DIR = path.join(REPO_ROOT, 'onprem', 'vector-db', 'init');
const VECTOR_DB_DOCKERFILE_DIR = path.join(REPO_ROOT, 'onprem', 'vector-db');
const VECTOR_DB_IMAGE = `${COMPOSE_PROJECT_NAME}-onprem-vector-db`;
const VECTOR_DB_USER = 'onprem_vector';
const VECTOR_DB_PASSWORD = 'onprem_vector_password';
const VECTOR_DB_NAME = 'onprem_vector';
export const VECTOR_TABLE = 'docs';
const READY_TIMEOUT_MS = 120_000;
const IMAGE_BUILD_TIMEOUT_MS = 900_000;
const POLL_MS = 500;

/** 同じマシンの他の環境と重ならないよう、画面のポートからの差で決める（先頭のポートは環境変数 E2E_SPEC_WAHA_PORT で上書きできる）。 */
const WAHA_BASE_PORT = Number(process.env.E2E_SPEC_WAHA_PORT ?? FRONTEND_PORT + 1);
/** カテゴリごとのエミュレーター・ベクトル DB のポート（カテゴリのテストファイルは別々のワーカーで並列に動くため、別のポートにする）。 */
export const WAHA_PORTS = {
  chatEmulator: WAHA_BASE_PORT,
  learnEmulator: WAHA_BASE_PORT + 1,
  learnVectorDb: WAHA_BASE_PORT + 2,
  searchEmulator: WAHA_BASE_PORT + 3,
  searchVectorDb: WAHA_BASE_PORT + 4,
} as const;

/** サービス（ワークフロー）の定義のうち、エミュレーターのファイルに書く部分。 */
export type ServiceDefinition = Record<string, unknown>;

export interface StartWahaOptions {
  /** カテゴリごとの名前（コンテナ名・一時ディレクトリ名に使う）。 */
  name: string;
  /** エミュレーターの待ち受けポート。 */
  port: number;
  /** サービス ID → 定義。`${VDB_URL}` のような環境変数の参照が使える。 */
  services: Record<string, ServiceDefinition>;
  /** 既定のサービス（サービス ID が空・未登録のとき）の定義。省略時は Echo のチャット。 */
  defaultService?: ServiceDefinition;
  /** エミュレーターの環境変数に足す値（Azure のモックの URL など）。 */
  env?: Record<string, string>;
  /** RAG Context JSON を読んでよいディレクトリ（`ragContextJson` の置き場）。 */
  ragContextDir?: string;
}

export interface JobResult {
  /** `/result` の応答（`SUCCESS` または `FAILURE: 理由`）。 */
  result: string;
  /** `outputfile` の中身。 */
  output: string;
}

/** servicerun API を呼ぶクライアント。 */
export class WahaClient {
  readonly api: APIRequestContext;

  constructor(api: APIRequestContext) {
    this.api = api;
  }

  /**
   * セッションを開く。
   *
   * @param authKey 認証キー（既定はこの環境のキー）
   * @returns セッション ID
   */
  async startSession(authKey: string = AUTH_KEY): Promise<string> {
    const res = await this.api.get(`${WAHA_API_BASE}/startsession`, { params: { authkey: authKey } });
    if (!res.ok()) throw new WahaEnvError(`startsession が失敗しました: ${res.status()} ${await res.text()}`);
    return (await res.text()).trim();
  }

  /**
   * 入力スロットにファイルを上げる。
   *
   * @param sessionId セッション ID
   * @param slot スロット名（`file`・`question`・`attachmentfile`・`history`・`textdata`）
   * @param content ファイルの中身
   * @param fileName ファイル名
   */
  async upload(sessionId: string, slot: string, content: string | Buffer, fileName = `${slot}.txt`): Promise<void> {
    const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
    const res = await this.api.post(`${WAHA_API_BASE}/upload/${slot}`, {
      params: { sessionid: sessionId },
      multipart: { file: { name: fileName, mimeType: 'application/octet-stream', buffer } },
    });
    if (!res.ok()) throw new WahaEnvError(`upload/${slot} が失敗しました: ${res.status()} ${await res.text()}`);
  }

  /**
   * サービスを実行し、完了まで待って結果と出力を返す。
   *
   * @param sessionId セッション ID
   * @param serviceId サービス ID
   * @param params execute に渡す追加のパラメータ（`streamfilepath`・`splitLength`・`filepath`・`start`・`end`）
   * @returns 結果と出力ファイルの中身
   */
  async execute(sessionId: string, serviceId: string, params: Record<string, string> = {}): Promise<JobResult> {
    const res = await this.api.get(`${WAHA_API_BASE}/execute/${serviceId}`, { params: { sessionid: sessionId, ...params }, timeout: 120_000 });
    if (!res.ok()) throw new WahaEnvError(`execute/${serviceId} が失敗しました: ${res.status()} ${await res.text()}`);
    const result = (await res.text()).trim();
    const output = await this.download(sessionId, 'outputfile');
    return { result, output };
  }

  /**
   * 出力スロットの中身を取る。
   *
   * @param sessionId セッション ID
   * @param slot スロット名
   * @returns 中身（出力がなければ空文字）
   */
  async download(sessionId: string, slot: string): Promise<string> {
    const res = await this.api.get(`${WAHA_API_BASE}/download/${slot}`, { params: { sessionid: sessionId } });
    return res.ok() ? await res.text() : '';
  }

  /**
   * セッションを閉じる。
   *
   * @param sessionId セッション ID
   */
  async endSession(sessionId: string): Promise<void> {
    await this.api.get(`${WAHA_API_BASE}/endsession`, { params: { sessionid: sessionId } });
  }

  /**
   * セッションを開いて 1 回ジョブを実行し、閉じる。
   *
   * @param serviceId サービス ID
   * @param options 入力スロットのファイルと execute のパラメータ
   * @returns 結果と出力ファイルの中身
   */
  async run(
    serviceId: string,
    options: { inputs?: Record<string, string | Buffer>; fileNames?: Record<string, string>; params?: Record<string, string> } = {}
  ): Promise<JobResult> {
    const sessionId = await this.startSession();
    try {
      for (const [slot, content] of Object.entries(options.inputs ?? {})) {
        await this.upload(sessionId, slot, content, options.fileNames?.[slot]);
      }
      return await this.execute(sessionId, serviceId, options.params);
    } finally {
      await this.endSession(sessionId);
    }
  }
}

export interface WahaEnv {
  client: WahaClient;
  /** このテスト専用の一時ディレクトリ（ストリームファイル・学習する元ファイルの置き場）。 */
  workDir: string;
  /** エミュレーターに渡したサービス定義のファイル。 */
  workflowsPath: string;
  stop: () => Promise<void>;
}

/**
 * エミュレーターを起動し、servicerun API が応えるまで待つ。
 *
 * @param options サービス定義・ポートなど
 * @returns クライアントと後片付け
 * @throws WahaEnvError 起動できないとき
 */
export async function startWaha(options: StartWahaOptions): Promise<WahaEnv> {
  ensureEmulatorEnvironment();
  const workDir = mkdtempSync(path.join(tmpdir(), `${COMPOSE_PROJECT_NAME}-${options.name}-`));
  const streamDir = path.join(workDir, 'stream');
  const sourceDir = path.join(workDir, 'source');
  mkdirSync(streamDir);
  mkdirSync(sourceDir);
  const workflowsPath = path.join(workDir, 'workflows.json');
  writeFileSync(workflowsPath, JSON.stringify({ default: options.defaultService ?? ECHO_CHAT, services: options.services }, null, 2));

  const child = spawn(
    path.join(EMULATOR_DIR, '.venv', 'bin', 'uvicorn'),
    ['waha_emulator.main:app_factory', '--factory', '--host', '127.0.0.1', '--port', String(options.port), '--no-access-log'],
    {
      cwd: EMULATOR_DIR,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        WAHA_AUTHKEY: AUTH_KEY,
        WAHA_WORKFLOWS_FILE: workflowsPath,
        STREAM_ALLOWED_DIR: streamDir,
        SOURCE_ALLOWED_DIR: sourceDir,
        LOG_LEVEL: 'INFO',
        ...(options.ragContextDir ? { RAG_CONTEXT_JSON_ALLOW_ROOT: options.ragContextDir } : {}),
        ...options.env,
      },
    }
  );
  let logs = '';
  child.stdout?.on('data', (chunk: Buffer) => (logs += chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => (logs += chunk.toString()));
  const api = await request.newContext({ baseURL: `http://127.0.0.1:${options.port}` });
  const client = new WahaClient(api);
  try {
    await waitUntil(async () => (await api.get(`${WAHA_API_BASE}/startsession`, { params: { authkey: AUTH_KEY } })).ok(), '', () => logs, child);
  } catch (error) {
    killTree(child);
    await api.dispose();
    throw error;
  }
  return {
    client,
    workDir,
    workflowsPath,
    stop: async () => {
      await api.dispose();
      killTree(child);
      rmSync(workDir, { recursive: true, force: true });
    },
  };
}

const RETRIEVAL_SCRIPT = path.join(MODULE_ROOT, 'scripts', 'retrieval_context.py');

/**
 * 検索アダプタ（RAG の前段）だけを動かし、書き出される RAG Context JSON（項目書の context.json）を取る。
 * エミュレーターは検索の結果をそのまま生成AIアダプタに渡して消すため、同じ検索の呼び出しを Python のスクリプトで再現する。
 *
 * @param env エミュレーター
 * @param serviceId `retrieval` を持つサービス ID
 * @param question 検索文字列
 * @returns RAG Context JSON
 * @throws WahaEnvError 検索に失敗したとき
 */
export function readRetrievalContext(env: WahaEnv, serviceId: string, question: string): RagContextJson {
  const result = spawnSync(path.join(EMULATOR_DIR, '.venv', 'bin', 'python'), [RETRIEVAL_SCRIPT, env.workflowsPath, serviceId, question], {
    cwd: EMULATOR_DIR,
    encoding: 'utf-8',
    // スクリプトは e2e-spec/scripts にあるため、waha_emulator のパッケージの場所を教える
    env: { ...process.env, PYTHONPATH: EMULATOR_DIR },
  });
  if (result.status !== 0) throw new WahaEnvError(`検索アダプタの実行に失敗しました: ${result.stderr}`);
  return JSON.parse(result.stdout) as RagContextJson;
}

/** 検索アダプタが書く RAG Context JSON（`RAG_CONTEXT_JSON_V1`）。 */
export interface RagContextJson {
  schemaVersion: number;
  generatedAt: string;
  contexts: {
    sourceFilePath: string;
    sourceRef: string;
    chunkId: string;
    content: string;
    score: number;
    retrievalSignals: { pgroonga: boolean; graph: boolean; vector: boolean };
    graphEvidence?: unknown[];
  }[];
}

/** 既定のサービス: Echo（キー不要。質問をそのまま回答にする）の通常チャット。 */
export const ECHO_PROPERTIES = { VENDOR: 'Echo', URL: 'http://echo.invalid', API_KEY: 'echo', MODEL_NAME: 'echo' } as const;
export const ECHO_CHAT: ServiceDefinition = { outputType: 0, properties: ECHO_PROPERTIES };

function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // すでに終了している
  }
}

function ensureEmulatorEnvironment(): void {
  if (existsSync(path.join(EMULATOR_DIR, '.venv', 'bin', 'uvicorn'))) return;
  // 初回だけ依存を入れる（uv.lock のとおり）。並列のワーカーが同時に入れないよう、ロックのディレクトリで 1 つに絞る
  const lock = path.join(tmpdir(), `${COMPOSE_PROJECT_NAME}-waha-uv-sync.lock`);
  try {
    mkdirSync(lock);
  } catch {
    const started = Date.now();
    while (!existsSync(path.join(EMULATOR_DIR, '.venv', 'bin', 'uvicorn'))) {
      if (Date.now() - started > READY_TIMEOUT_MS) throw new WahaEnvError('エミュレーターの依存のインストールが終わりません');
      spawnSync('sleep', ['1']);
    }
    return;
  }
  try {
    const result = spawnSync('uv', ['sync', '--frozen'], { cwd: EMULATOR_DIR, encoding: 'utf-8' });
    if (result.status !== 0) throw new WahaEnvError(`uv sync が失敗しました: ${result.stderr}`);
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

async function waitUntil(check: () => Promise<boolean>, label: string, logs: () => string, child?: ChildProcess): Promise<void> {
  const started = Date.now();
  for (;;) {
    if (child && child.exitCode !== null) throw new WahaEnvError(`${label || 'エミュレーター'}が終了しました:\n${logs()}`);
    try {
      if (await check()) return;
    } catch {
      // 起動途中は接続を拒否される
    }
    if (Date.now() - started > READY_TIMEOUT_MS) throw new WahaEnvError(`${label || 'エミュレーター'}が ${READY_TIMEOUT_MS / 1000} 秒以内に起動しませんでした:\n${logs()}`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

/** ベクトル DB（専用コンテナ）。 */
export interface VectorDb {
  port: number;
  /** ベクトル DB に SQL を流し、行（列は文字列）を返す。 */
  sql: (statement: string) => string[][];
  stop: () => void;
}

function docker(args: string[], input?: string): ReturnType<typeof spawnSync> {
  return spawnSync('docker', args, { encoding: 'utf-8', input });
}

function imageExists(): boolean {
  return docker(['image', 'inspect', VECTOR_DB_IMAGE]).status === 0;
}

/**
 * ベクトル DB の専用コンテナ（pgvector + PGroonga + Apache AGE）を起動する。イメージがなければ `onprem/vector-db` からビルドする（初回は数分）。
 *
 * @param name コンテナ名の末尾（カテゴリごとに分ける）
 * @param port ホストに公開するポート
 * @returns SQL を流すヘルパーと後片付け
 * @throws WahaEnvError ビルド・起動に失敗したとき
 */
export async function startVectorDb(name: string, port: number): Promise<VectorDb> {
  if (!imageExists()) {
    const build = spawnSync('docker', ['build', '-t', VECTOR_DB_IMAGE, VECTOR_DB_DOCKERFILE_DIR], { encoding: 'utf-8', timeout: IMAGE_BUILD_TIMEOUT_MS });
    if (build.status !== 0) throw new WahaEnvError(`ベクトル DB のイメージをビルドできません: ${build.stderr.slice(-2000)}`);
  }
  const container = `${COMPOSE_PROJECT_NAME}-${name}-vdb`;
  docker(['rm', '-f', container]);
  const run = docker([
    'run', '-d', '--rm', '--name', container,
    '-e', `POSTGRES_DB=${VECTOR_DB_NAME}`, '-e', `POSTGRES_USER=${VECTOR_DB_USER}`, '-e', `POSTGRES_PASSWORD=${VECTOR_DB_PASSWORD}`,
    '-p', `127.0.0.1:${port}:5432`,
    '-v', `${VECTOR_DB_INIT_DIR}:/docker-entrypoint-initdb.d:ro`,
    VECTOR_DB_IMAGE,
  ]);
  if (run.status !== 0) throw new WahaEnvError(`ベクトル DB を起動できません: ${run.stderr}`);
  const sql = (statement: string): string[][] => {
    const result = docker(['exec', '-i', container, 'psql', '-U', VECTOR_DB_USER, '-d', VECTOR_DB_NAME, '-At', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-q'], statement);
    if (result.status !== 0) throw new WahaEnvError(`ベクトル DB の SQL が失敗しました: ${result.stderr}\n${statement}`);
    const lines = String(result.stdout).split('\n');
    if (lines.at(-1) === '') lines.pop();
    return lines.map((line) => line.split('\t'));
  };
  const stop = (): void => {
    docker(['rm', '-f', container]);
  };
  try {
    // 初回の初期化（拡張の追加）が終わり、本番の起動に切り替わるまで待つ
    // 初期化中の一時サーバーは TCP を受けない。TCP（-h 127.0.0.1）で応えるのは、初期化後の本番の起動
    await waitUntil(
      async () => docker(['exec', container, 'psql', '-h', '127.0.0.1', '-U', VECTOR_DB_USER, '-d', VECTOR_DB_NAME, '-Atc', `SELECT count(*) FROM pg_extension WHERE extname = 'age'`]).stdout?.toString().trim() === '1',
      'ベクトル DB', () => String(docker(['logs', container]).stdout));
  } catch (error) {
    stop();
    throw error;
  }
  return { port, sql, stop };
}

export interface AzureMock {
  /** `http://127.0.0.1:<port>`（エミュレーターの AZURE_OPENAI_ENDPOINT に渡す）。 */
  url: string;
  /** 受けたリクエスト（パス・api-key ヘッダー・本文）。 */
  requests: { path: string; apiKey: string | undefined; body: string }[];
  stop: () => Promise<void>;
}

/**
 * Azure OpenAI の chat completions と同じ形で応える HTTP サーバーを起動する（実際の Azure には接続しない）。
 *
 * @param answer 応答にする文章
 * @returns URL・受けたリクエスト・停止
 */
export async function startAzureMock(answer: string): Promise<AzureMock> {
  const requests: AzureMock['requests'] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8');
      requests.push({ path: req.url ?? '', apiKey: req.headers['api-key'] as string | undefined, body });
      // RAG の回答は、固定の契約（JSON）で返す必要がある（id は、プロンプトの「File ID」。1 件目のコンテキストを根拠にする）。契約文が入っていれば JSON で、検証の依頼なら検証の JSON で応える
      let content = answer;
      if (body.includes('You are a validator')) content = JSON.stringify({ answer: true, reason: 'ok' });
      else if (body.includes('Your response MUST be a single, valid JSON object')) {
        content = JSON.stringify({ question: 'q', answer, id: [1], title: 't', could_not_answer: false });
      }
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          id: 'chatcmpl-spec',
          object: 'chat.completion',
          created: 0,
          model: 'spec-deployment',
          choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        })
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/**
 * ベクトル DB を使う埋め込み・検索のプロパティ。
 *
 * @param vdbPort ベクトル DB のポート
 * @returns Echo の埋め込み（キー不要）と、専用のベクトル DB への接続
 */
export function vectorDbProperties(vdbPort: number): Record<string, string> {
  return {
    ...ECHO_PROPERTIES,
    TENANT_ID: 'tenant-default',
    VDB_VENDOR: 'PostgreSQL(PGVector)',
    VDB_URL: `127.0.0.1:${vdbPort}`,
    VDB_USER_NAME: VECTOR_DB_USER,
    VDB_PASSWORD: VECTOR_DB_PASSWORD,
    VDB_DATABASE_NAME: VECTOR_DB_NAME,
    VDB_TABLE_NAME: VECTOR_TABLE,
  };
}
