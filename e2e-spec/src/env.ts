import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 実行環境の URL・パス・compose のプロジェクト名。環境変数で上書きできる。 */

export const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(MODULE_ROOT, '..');

/** 結合テスト項目書（Markdown）のディレクトリ。 */
export const SPEC_BOOK_DIR = path.join(REPO_ROOT, '25DA61_結合テスト項目書_md');

/** 既存の naw-demo（5173/8001）や e2e-explorer（55173/58000）と重ならないポート。 */
const DEFAULT_FRONTEND_PORT = 55273;
const DEFAULT_BACKEND_PORT = 58100;

export const FRONTEND_PORT = Number(process.env.E2E_SPEC_FRONTEND_PORT ?? DEFAULT_FRONTEND_PORT);
export const BACKEND_PORT = Number(process.env.E2E_SPEC_BACKEND_PORT ?? DEFAULT_BACKEND_PORT);

export const BASE_URL = process.env.E2E_SPEC_BASE_URL ?? `http://localhost:${FRONTEND_PORT}`;
export const API_URL = process.env.E2E_SPEC_API_URL ?? `http://localhost:${BACKEND_PORT}`;

export const COMPOSE_PROJECT_NAME = 'naw-e2e-spec';
export const COMPOSE_FILE = path.join(REPO_ROOT, 'docker-compose.demo.yml');
/** demo のイメージ名（naw-demo-backend）を上書きして、既存の demo 環境のイメージに触れないようにする。 */
export const COMPOSE_OVERRIDE_FILE = path.join(MODULE_ROOT, 'docker', 'compose.override.yml');
/** demo の seed にないユーザー（システム管理者）を足す SQL。 */
export const SPEC_SEED_SQL = path.join(MODULE_ROOT, 'docker', 'spec-seed.sql');

/** 結果の集計の出力先（既定）。 */
export const DEFAULT_REPORT_DIR = path.join(MODULE_ROOT, 'reports', 'latest');
export const REPORT_DIR = process.env.E2E_SPEC_REPORT_DIR
  ? path.resolve(MODULE_ROOT, process.env.E2E_SPEC_REPORT_DIR)
  : DEFAULT_REPORT_DIR;

export const TESTS_DIR = path.join(MODULE_ROOT, 'tests');
