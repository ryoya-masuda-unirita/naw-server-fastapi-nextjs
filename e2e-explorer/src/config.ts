import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 設定の読み込み・検証・担当範囲（シャード）の展開・安全策。 */

export const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_CONFIG_PATH = path.join(MODULE_ROOT, 'explorer.config.json');

/** tenants.id の列の長さ（backend/app/models/tenant.py の max_length=32）。 */
const TENANT_ID_MAX_LENGTH = 32;
const TENANT_HASH_LENGTH = 8;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export interface LoginConfig {
  path: string;
  tenantField: string;
  userField: string;
  passwordField: string;
  submit: string;
}

export interface Viewport {
  name: string;
  width: number;
  height: number;
}

export interface ExpectedHttpRule {
  description?: string;
  method?: string;
  /** API のパス（クエリを除く）に対する正規表現。 */
  path?: string;
  status: number[];
  /** 応答を受けたときの画面のパスがこの正規表現に合うときだけ想定内とする。 */
  pagePath?: string;
  /** 異常値を送信した操作の直後だけ想定内とする。 */
  onlyAfterAbnormalInput?: boolean;
}

export interface RoleConfig {
  description?: string;
  anonymous?: boolean;
  loginId?: string;
  password?: string;
  /** 写す元のテナント。tenants.perShard が false のときはこのテナントでそのままログインする。 */
  sourceTenantId?: string;
}

export interface GroupConfig {
  id: string;
  description?: string;
  startPath: string;
  include: string[];
  roles: string[];
}

export interface ExplorerConfig {
  target: { baseUrl: string; apiUrl: string; login: LoginConfig };
  workers: number;
  seed: number;
  limits: { maxDepth: number; maxActions: number; maxActionsPerState: number; maxMinutes: number };
  timing: { settleQuietMs: number; settleTimeoutMs: number; navigationTimeoutMs: number };
  oracle: {
    slowResponseMs: number;
    slowActionMs: number;
    axe: boolean;
    axeImpacts: string[];
    viewports: Viewport[];
    overflowTolerancePx: number;
    /** 画面の文字にこの文字列が含まれていたら、未移植の仮画面として扱う（疑いの判定を一部省く）。 */
    placeholderMarkers: string[];
    expectedHttp: ExpectedHttpRule[];
    ignoreConsole: string[];
  };
  crawl: {
    inputKinds: string[];
    defaultMaxLength: number;
    longLength: number;
    dialogs: 'accept' | 'dismiss';
    excludeSelectors: string[];
    sharedRegions: string[];
    sharedRegistryPerRole: boolean;
  };
  tenants: { perShard: boolean; prefix: string };
  roles: Record<string, RoleConfig>;
  groups: GroupConfig[];
  environment: { composeFile: string; projectName: string };
}

export interface Shard {
  id: string;
  groupId: string;
  description: string;
  role: string;
  roleConfig: RoleConfig;
  startPath: string;
  include: RegExp[];
  /** ログインに使うテナント。未ログインなら undefined。 */
  tenantId?: string;
}

export interface CliOverrides {
  workers?: number;
  seed?: number;
  maxDepth?: number;
  maxActions?: number;
  maxMinutes?: number;
}

export class ConfigError extends Error {}

export function loadConfig(configPath: string = DEFAULT_CONFIG_PATH, overrides: CliOverrides = {}): ExplorerConfig {
  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf-8');
  } catch (e) {
    throw new ConfigError(`設定ファイルを読めません: ${configPath} (${String(e)})`);
  }
  const config = JSON.parse(raw) as ExplorerConfig;
  return applyOverrides(config, overrides);
}

export function applyOverrides(config: ExplorerConfig, overrides: CliOverrides): ExplorerConfig {
  const next: ExplorerConfig = structuredClone(config);
  // 対象の URL は環境変数でも変えられる（ポートを変えた専用環境に向けるため）
  if (process.env.E2E_EXPLORER_BASE_URL) next.target.baseUrl = process.env.E2E_EXPLORER_BASE_URL;
  if (process.env.E2E_EXPLORER_API_URL) next.target.apiUrl = process.env.E2E_EXPLORER_API_URL;
  if (overrides.workers !== undefined) next.workers = overrides.workers;
  if (overrides.seed !== undefined) next.seed = overrides.seed;
  if (overrides.maxDepth !== undefined) next.limits.maxDepth = overrides.maxDepth;
  if (overrides.maxActions !== undefined) next.limits.maxActions = overrides.maxActions;
  if (overrides.maxMinutes !== undefined) next.limits.maxMinutes = overrides.maxMinutes;
  validateConfig(next);
  return next;
}

export function validateConfig(config: ExplorerConfig): void {
  if (!Number.isInteger(config.workers) || config.workers < 1) {
    throw new ConfigError(`workers は 1 以上の整数にしてください: ${config.workers}`);
  }
  if (!Number.isInteger(config.seed)) {
    throw new ConfigError(`seed は整数にしてください: ${config.seed}`);
  }
  for (const [key, value] of Object.entries(config.limits)) {
    if (typeof value !== 'number' || value < 0) {
      throw new ConfigError(`limits.${key} は 0 以上の数にしてください: ${value}`);
    }
  }
  const groupIds = new Set<string>();
  for (const group of config.groups) {
    if (groupIds.has(group.id)) throw new ConfigError(`groups の id が重複しています: ${group.id}`);
    groupIds.add(group.id);
    for (const role of group.roles) {
      if (!config.roles[role]) {
        throw new ConfigError(`groups[${group.id}].roles に未定義の権限があります: ${role}`);
      }
    }
    for (const pattern of group.include) {
      try {
        new RegExp(pattern);
      } catch (e) {
        throw new ConfigError(`groups[${group.id}].include の正規表現が不正です: ${pattern} (${String(e)})`);
      }
    }
  }
  for (const [name, role] of Object.entries(config.roles)) {
    if (!role.anonymous && (!role.loginId || !role.password || !role.sourceTenantId)) {
      throw new ConfigError(`roles.${name} には loginId・password・sourceTenantId が必要です（未ログインなら anonymous: true）`);
    }
  }
}

/** テナント ID を tenants.id の長さ（32 文字）に収める。長いときは末尾をハッシュにする。 */
export function tenantIdFor(shardId: string, prefix: string): string {
  const candidate = `${prefix}${shardId}`;
  if (candidate.length <= TENANT_ID_MAX_LENGTH) return candidate;
  const hash = createHash('sha1').update(shardId).digest('hex').slice(0, TENANT_HASH_LENGTH);
  const head = candidate.slice(0, TENANT_ID_MAX_LENGTH - TENANT_HASH_LENGTH - 1);
  return `${head}-${hash}`;
}

/** 画面のまとまり × 権限を担当範囲に展開する。並びは設定ファイルの順（再現性のため）。 */
export function expandShards(config: ExplorerConfig): Shard[] {
  const shards: Shard[] = [];
  for (const group of config.groups) {
    for (const role of group.roles) {
      const roleConfig = config.roles[role];
      const id = `${group.id}-${role}`;
      let tenantId: string | undefined;
      if (!roleConfig.anonymous) {
        tenantId = config.tenants.perShard ? tenantIdFor(id, config.tenants.prefix) : roleConfig.sourceTenantId;
      }
      shards.push({
        id,
        groupId: group.id,
        description: group.description ?? '',
        role,
        roleConfig,
        startPath: group.startPath,
        include: group.include.map((p) => new RegExp(p)),
        tenantId,
      });
    }
  }
  const ids = new Set<string>();
  for (const shard of shards) {
    if (ids.has(shard.id)) throw new ConfigError(`担当範囲の ID が重複しています: ${shard.id}`);
    ids.add(shard.id);
  }
  return shards;
}

export function selectShards(shards: Shard[], ids: string[]): Shard[] {
  if (ids.length === 0) return shards;
  const known = new Map(shards.map((s) => [s.id, s]));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new ConfigError(
      `未定義の担当範囲です: ${unknown.join(', ')}（定義済み: ${shards.map((s) => s.id).join(', ')}）`
    );
  }
  // 指定の順ではなく設定の順にそろえる（同じ指定なら同じ順で巡回するため）
  return shards.filter((s) => ids.includes(s.id));
}

/**
 * 対象がローカル以外なら止める。巡回は削除・権限変更も実行するため、
 * dev や本番の環境に誤って向けないようにする。
 */
export function assertSafeTarget(config: ExplorerConfig, allowNonLocal: boolean): void {
  for (const url of [config.target.baseUrl, config.target.apiUrl]) {
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      throw new ConfigError(`対象の URL が不正です: ${url}`);
    }
    if (!LOCAL_HOSTS.has(host) && !allowNonLocal) {
      throw new ConfigError(
        `対象 ${url} はローカルではありません。巡回は削除・権限変更も実行するため、専用環境以外には向けません。` +
          '本当に向ける場合だけ --allow-non-local-target を付けてください。'
      );
    }
  }
}

/** URL のパスが担当範囲に入るか。 */
export function isInScope(shard: Shard, pathname: string): boolean {
  return shard.include.some((re) => re.test(pathname));
}
