/** サーバー（waha-emulator の管理用 API）とやり取りする JSON の型。 */

/** 版 2（自由なつなぎ方）。この画面が、保存する形式。 */
export const GRAPH_VERSION = 2;
/** 版 1（鎖に固定）。開くと、版 2 に変換する（保存すると、版 2 になる）。 */
export const LEGACY_VERSION = 1;
/** サーバーが秘密情報の代わりに返す伏せ字。送り返すと、保存済みの値を引き継ぐ。 */
export const MASK = '********';

export type NodeType = 'start' | 'llm' | 'template' | 'retrieval' | 'branch' | 'end';
/** 条件分岐の出口。 */
export type Handle = 'true' | 'false';
export type Operator = 'contains' | 'equals' | 'empty';

export interface Position {
  x: number;
  y: number;
}

/** ノードの設定（種類ごとに、使う項目が違う。使わない項目は、保存のときに落とす）。 */
export interface NodeConfig {
  /** 生成AI: プロンプト（`{{変数}}` を埋め込める）。 */
  prompt?: string;
  /** 生成AI・検索: アダプターの接続（プロパティ名 → 値）。 */
  properties?: Record<string, string>;
  /** 生成AI: 出力モード（0: チャット用_回答、2: 回答の本文だけ）。検索を使うときは、書けない。 */
  outputType?: number;
  /** 生成AI: 会話履歴・添付ファイルも渡すか。 */
  inheritContext?: boolean;
  /** 生成AI: 引用資料に使う検索ノードの ID。 */
  retrieval?: string | null;
  /** 検索: 検索語のテンプレート。 */
  query?: string;
  /** テンプレート: 文字列。 */
  text?: string;
  /** 条件分岐: 調べる変数・演算子・値。 */
  variable?: string;
  operator?: Operator;
  value?: string;
  /** 終了: 回答にする文字列。 */
  output?: string;
}

export interface GraphNodeData {
  id: string;
  type: NodeType;
  name?: string;
  position: Position;
  config?: NodeConfig;
}

export interface GraphEdgeData {
  source: string;
  target: string;
  sourceHandle?: Handle;
}

export interface GraphData {
  version: number;
  id: string;
  name: string;
  serviceIds: string[];
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
}

/** 版 1 のノード（`generative-ai` は、版 2 の `llm` に当たる）。 */
export interface LegacyNodeData {
  id: string;
  type: 'start' | 'retrieval' | 'generative-ai' | 'end';
  name?: string;
  position: Position;
  properties?: Record<string, string>;
  outputType?: number;
}

export interface LegacyGraphData {
  version: number;
  id: string;
  name: string;
  serviceIds: string[];
  nodes: LegacyNodeData[];
  edges: { source: string; target: string }[];
}

export interface WorkflowSummary {
  id: string;
  name: string;
  serviceIds: string[];
}

export interface PropertyCandidate {
  name: string;
  secret: boolean;
}

export interface PropertyCatalog {
  generativeAi: PropertyCandidate[];
  retrieval: PropertyCandidate[];
}
