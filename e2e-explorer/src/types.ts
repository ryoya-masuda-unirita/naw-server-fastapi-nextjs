/** ハーネス全体で使う型。 */

export type Severity = 'high' | 'medium' | 'low';

export type FindingKind =
  | 'http-5xx'
  | 'http-4xx'
  | 'network-failure'
  | 'console-error'
  | 'uncaught-exception'
  | 'unhandled-rejection'
  | 'blank-screen'
  | 'no-effect'
  | 'dead-end'
  | 'horizontal-scroll'
  | 'element-overflow'
  | 'a11y'
  | 'slow-response'
  | 'slow-action';

/** 再生のたびに要素を探し直すための識別子。署名が同じ要素が複数あるときは順番で区別する。 */
export interface ElementRef {
  signature: string;
  occurrence: number;
}

export interface FieldValue {
  target: ElementRef;
  /** 入力欄の種類（text・number・select など）。値の入れ方を変えるために持つ。 */
  inputType: string;
  value: string;
}

export type ActionKind = 'click' | 'fill-submit' | 'fill-enter' | 'select' | 'toggle';

export interface ActionDescriptor {
  kind: ActionKind;
  /** クリック・選択・切り替えの対象。フォームの送信ではフォーム自体。 */
  target: ElementRef;
  /** 共通領域の中の要素なら、その領域のセレクター。 */
  region?: string;
  /** 入力して送信する値（fill-submit・fill-enter・select）。 */
  values?: FieldValue[];
  /** 入れた値の種類（empty・max など）。 */
  inputKind?: string;
  /** 人が読む操作の説明。 */
  label: string;
}

export interface Step {
  description: string;
  action?: ActionDescriptor;
}

export interface Finding {
  kind: FindingKind;
  severity: Severity;
  title: string;
  /** 場所。API なら `GET /api/xxx`、画面なら正規化したパス。 */
  location: string;
  message: string;
  fingerprint: string;
  shardId: string;
  role: string;
  /** 再現手順（起点の画面から、この症状が出た操作まで）。 */
  steps: Step[];
  pageUrl: string;
  screenshot?: string;
  trace?: string;
  details?: Record<string, unknown>;
}

export interface OutOfScopeRecord {
  fromPath: string;
  toUrl: string;
  action: string;
}

export interface ShardStats {
  states: number;
  actions: number;
  replays: number;
  skippedShared: number;
  claimedShared: number;
  replayFailures: number;
  /** 未移植の仮画面（placeholderMarkers に合う画面）に着いた状態の数。疑いの判定を一部省いている。 */
  placeholderStates: number;
  relogins: number;
  stoppedBy: 'queue-empty' | 'max-actions' | 'max-minutes' | 'error';
}

export interface ShardReport {
  shardId: string;
  groupId: string;
  role: string;
  tenantId?: string;
  seed: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  stats: ShardStats;
  /** 実行した操作の順番（再現性の確認用）。 */
  actionLog: string[];
  states: string[];
  outOfScope: OutOfScopeRecord[];
  replayFailures: { path: string[]; reason: string }[];
  findings: Finding[];
  error?: string;
}

export interface FindingGroup {
  fingerprint: string;
  kind: FindingKind;
  severity: Severity;
  title: string;
  location: string;
  message: string;
  occurrences: number;
  shards: string[];
  roles: string[];
  /** 最初に見つかった例（再現手順・スクリーンショット・trace はこれを使う）。 */
  example: Finding;
}

export interface MergedReport {
  generatedAt: string;
  seed: number;
  shards: Omit<ShardReport, 'findings' | 'actionLog' | 'states'>[];
  totals: {
    groups: number;
    occurrences: number;
    bySeverity: Record<Severity, number>;
    byKind: Partial<Record<FindingKind, number>>;
  };
  groups: FindingGroup[];
}
