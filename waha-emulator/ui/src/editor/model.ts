import type { Edge, Node } from '@xyflow/react';

import {
  GRAPH_VERSION,
  type GraphData,
  type GraphNodeData,
  type Handle,
  type LegacyGraphData,
  type NodeConfig,
  type NodeType,
  type Operator,
} from '../api/types';

/** キャンバスのノードが持つデータ。 */
export interface FlowNodeData extends Record<string, unknown> {
  nodeType: NodeType;
  label: string;
  config: NodeConfig;
}

export type FlowNode = Node<FlowNodeData, 'workflow'>;

export const FLOW_NODE_TYPE = 'workflow';
export const NODE_LABELS: Record<NodeType, string> = {
  start: '開始',
  llm: '生成AI',
  template: 'テンプレート',
  retrieval: '検索',
  branch: '条件分岐',
  end: '終了',
};
/** パレットの説明（何をするノードか）。 */
export const NODE_DESCRIPTIONS: Record<NodeType, string> = {
  start: '質問・会話履歴を受け取る（1 つだけ）',
  llm: 'プロンプトを埋めて、生成AI を 1 回呼ぶ',
  template: '変数を埋めた文字列を作る（固定の文にも使う）',
  retrieval: '質問で社内文書を検索し、引用資料にする',
  branch: '変数を調べて、「はい」「いいえ」の線に分ける',
  end: '回答にする文字列を決める（複数置ける）',
};
/** パレットから足せるノード（開始は 1 つで固定）。 */
export const PALETTE_TYPES: readonly NodeType[] = [
  'llm',
  'retrieval',
  'branch',
  'template',
  'end',
];
export const OPERATOR_LABELS: Record<Operator, string> = {
  contains: '含む',
  equals: '等しい',
  empty: '空',
};
const HANDLES: readonly Handle[] = ['true', 'false'];
/** ノードが出す変数の名前（`ノードID.変数名` で、あとのノードから使える）。 */
const OUTPUT_VARIABLES: Partial<Record<NodeType, string>> = {
  llm: 'text',
  template: 'text',
  retrieval: 'contexts_text',
};
export const VARIABLE_QUESTION = 'question';
export const VARIABLE_HISTORY = 'history';
const START_VARIABLES = [VARIABLE_QUESTION, VARIABLE_HISTORY];
const NEW_NODE_POSITION = { x: 200, y: 200 };

const ECHO_PROPERTIES: Record<string, string> = {
  VENDOR: 'Echo',
  URL: 'http://echo.invalid',
  API_KEY: 'echo',
  MODEL_NAME: 'echo',
};
/** 検索ノードを足したときの初期値。接続先は、書き換える前提の仮の値。 */
const DEFAULT_RETRIEVAL_PROPERTIES: Record<string, string> = {
  ...ECHO_PROPERTIES,
  VDB_VENDOR: 'PostgreSQL(PGVector)',
  VDB_URL: 'db.invalid:5432',
  VDB_USER_NAME: 'user',
  VDB_PASSWORD: 'password',
  VDB_DATABASE_NAME: 'appdb',
  VDB_TABLE_NAME: 'vectors',
};

export type Check = { ok: true } | { ok: false; reason: string };

function edgeId(source: string, target: string, handle?: string | null): string {
  return `${source}${handle ? `:${handle}` : ''}->${target}`;
}

/** ノードの種類ごとの、初期の設定。 */
export function defaultConfig(type: NodeType): NodeConfig {
  switch (type) {
    case 'llm':
      return {
        prompt: '{{question}}',
        properties: { ...ECHO_PROPERTIES },
        outputType: 0,
        inheritContext: false,
        retrieval: null,
      };
    case 'retrieval':
      return { query: '{{question}}', properties: { ...DEFAULT_RETRIEVAL_PROPERTIES } };
    case 'template':
      return { text: '{{question}}' };
    case 'branch':
      return { variable: VARIABLE_QUESTION, operator: 'contains', value: 'OK' };
    case 'end':
      return { output: '{{question}}' };
    default:
      return {};
  }
}

/** 保存する設定を、種類ごとに、使う項目だけにする（サーバーは、余分な項目を弾く）。 */
function cleanConfig(type: NodeType, config: NodeConfig): NodeConfig {
  switch (type) {
    case 'llm':
      return {
        prompt: config.prompt ?? '',
        properties: { ...(config.properties ?? {}) },
        inheritContext: config.inheritContext ?? false,
        // 検索を使うときは、出力モードをサーバーが RAG で固定する（書くと 400 になる）
        ...(config.retrieval ? { retrieval: config.retrieval } : { outputType: config.outputType ?? 0 }),
      };
    case 'retrieval':
      return { query: config.query ?? '', properties: { ...(config.properties ?? {}) } };
    case 'template':
      return { text: config.text ?? '' };
    case 'branch': {
      const operator = config.operator ?? 'contains';
      return {
        variable: config.variable ?? '',
        operator,
        ...(operator === 'empty' ? {} : { value: config.value ?? '' }),
      };
    }
    case 'end':
      return { output: config.output ?? '' };
    default:
      return {};
  }
}

export function toFlow(graph: GraphData): { nodes: FlowNode[]; edges: Edge[] } {
  const nodes: FlowNode[] = graph.nodes.map((node) => ({
    id: node.id,
    type: FLOW_NODE_TYPE,
    position: { x: node.position.x, y: node.position.y },
    deletable: node.type !== 'start',
    data: {
      nodeType: node.type,
      label: node.name ?? node.id,
      config: withDefaults(node.type, structuredClone(node.config ?? {})),
    },
  }));
  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edgeId(edge.source, edge.target, edge.sourceHandle),
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    ...(edge.sourceHandle ? { label: edge.sourceHandle === 'true' ? 'はい' : 'いいえ' } : {}),
  }));
  return { nodes, edges };
}

/** 保存済みの設定で、省略された項目に、種類ごとの既定値を入れる（サーバーは、書かれた形のまま返す）。 */
function withDefaults(type: NodeType, config: NodeConfig): NodeConfig {
  switch (type) {
    case 'llm':
      return {
        prompt: '',
        properties: {},
        outputType: 0,
        inheritContext: false,
        retrieval: null,
        ...config,
      };
    case 'retrieval':
      return { query: '{{question}}', properties: {}, ...config };
    case 'branch':
      return { variable: '', operator: 'contains', value: '', ...config };
    default:
      return { ...config };
  }
}

export function fromFlow(
  base: Pick<GraphData, 'id' | 'name' | 'serviceIds'>,
  nodes: FlowNode[],
  edges: Edge[],
): GraphData {
  return {
    version: GRAPH_VERSION,
    id: base.id,
    name: base.name,
    serviceIds: [...base.serviceIds],
    nodes: nodes.map((node): GraphNodeData => {
      const { nodeType, label, config } = node.data;
      return {
        id: node.id,
        type: nodeType,
        name: label,
        // 動かしたときの小数で、未保存の判定が揺れないよう、整数にそろえる
        position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
        config: cleanConfig(nodeType, config),
      };
    }),
    edges: edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      ...(edge.sourceHandle === 'true' || edge.sourceHandle === 'false'
        ? { sourceHandle: edge.sourceHandle }
        : {}),
    })),
  };
}

/** サーバーから読んだ定義を、画面が保存するときと同じ形にそろえる（未保存の判定の基準にする）。 */
export function normalize(graph: GraphData): GraphData {
  const { nodes, edges } = toFlow(graph);
  return fromFlow(graph, nodes, edges);
}

/** 版 1（鎖に固定）を、版 2 に変換する。保存すると、版 2 になる。 */
export function convertLegacy(legacy: LegacyGraphData): GraphData {
  const retrievalId = legacy.nodes.find((n) => n.type === 'retrieval')?.id ?? null;
  const generativeId = legacy.nodes.find((n) => n.type === 'generative-ai')?.id ?? 'answer';
  const nodes: GraphNodeData[] = legacy.nodes.map((node) => {
    const common = { id: node.id, name: node.name, position: node.position };
    switch (node.type) {
      case 'generative-ai':
        return {
          ...common,
          type: 'llm',
          config: {
            prompt: '{{question}}',
            properties: { ...(node.properties ?? {}) },
            inheritContext: true,
            ...(retrievalId ? { retrieval: retrievalId } : { outputType: node.outputType ?? 0 }),
          },
        };
      case 'retrieval':
        return {
          ...common,
          type: 'retrieval',
          config: { query: '{{question}}', properties: { ...(node.properties ?? {}) } },
        };
      case 'end':
        return { ...common, type: 'end', config: { output: `{{${generativeId}.text}}` } };
      default:
        return { ...common, type: 'start', config: {} };
    }
  });
  return {
    version: GRAPH_VERSION,
    id: legacy.id,
    name: legacy.name,
    serviceIds: [...legacy.serviceIds],
    nodes,
    edges: legacy.edges.map((e) => ({ source: e.source, target: e.target })),
  };
}

/** 新しいワークフロー（開始 → 生成AI → 終了）。 */
export function newGraph(id: string, name: string, serviceIds: string[]): GraphData {
  return {
    version: GRAPH_VERSION,
    id,
    name,
    serviceIds,
    nodes: [
      { id: 'start', type: 'start', name: NODE_LABELS.start, position: { x: 0, y: 80 }, config: {} },
      {
        id: 'answer',
        type: 'llm',
        name: NODE_LABELS.llm,
        position: { x: 280, y: 80 },
        config: defaultConfig('llm'),
      },
      {
        id: 'end',
        type: 'end',
        name: NODE_LABELS.end,
        position: { x: 560, y: 80 },
        config: { output: '{{answer.text}}' },
      },
    ],
    edges: [
      { source: 'start', target: 'answer' },
      { source: 'answer', target: 'end' },
    ],
  };
}

function sortedForCompare(graph: GraphData): GraphData {
  return {
    ...graph,
    nodes: [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...graph.edges].sort((a, b) =>
      edgeId(a.source, a.target, a.sourceHandle).localeCompare(
        edgeId(b.source, b.target, b.sourceHandle),
      ),
    ),
  };
}

export function isDirty(saved: GraphData, current: GraphData): boolean {
  return (
    JSON.stringify(sortedForCompare(saved)) !== JSON.stringify(sortedForCompare(current))
  );
}

/** ノードを足す。開始は 1 つで固定のため、足せない。 */
export function canAddNode(type: NodeType): Check {
  if (!PALETTE_TYPES.includes(type)) {
    return { ok: false, reason: `${NODE_LABELS[type]}ノードは足せません` };
  }
  return { ok: true };
}

export function addNode(nodes: FlowNode[], type: NodeType): FlowNode {
  const taken = new Set(nodes.map((node) => node.id));
  let id: string = type;
  for (let n = 2; taken.has(id); n += 1) {
    id = `${type}-${n}`;
  }
  return {
    id,
    type: FLOW_NODE_TYPE,
    position: { ...NEW_NODE_POSITION },
    deletable: true,
    data: { nodeType: type, label: NODE_LABELS[type], config: defaultConfig(type) },
  };
}

/** あるノードから、線をたどって着けるノードの ID。 */
function reachableFrom(start: string, edges: Edge[]): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const edge of edges) {
      if (edge.source === current && !seen.has(edge.target)) {
        seen.add(edge.target);
        stack.push(edge.target);
      }
    }
  }
  return seen;
}

/** あるノードより前に動くノード（線を逆にたどって着くノード）の ID。 */
export function upstreamOf(nodeId: string, edges: Edge[]): Set<string> {
  const seen = new Set<string>();
  const stack = [nodeId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const edge of edges) {
      if (edge.target === current && !seen.has(edge.source)) {
        seen.add(edge.source);
        stack.push(edge.source);
      }
    }
  }
  return seen;
}

export function canConnect(
  nodes: FlowNode[],
  edges: Edge[],
  link: { source: string | null; target: string | null; sourceHandle?: string | null },
): Check {
  const source = nodes.find((node) => node.id === link.source);
  const target = nodes.find((node) => node.id === link.target);
  if (!source || !target) {
    return { ok: false, reason: '存在しないノードには線を引けません' };
  }
  if (source.id === target.id) {
    return { ok: false, reason: '自分自身には線を引けません' };
  }
  if (source.data.nodeType === 'end') {
    return { ok: false, reason: '終了ノードから線は出せません' };
  }
  if (target.data.nodeType === 'start') {
    return { ok: false, reason: '開始ノードへ線は入れません' };
  }
  if (edges.some((edge) => edge.target === target.id)) {
    return {
      ok: false,
      reason: '1 つのノードに複数の線は入れません（合流は、まだ作れません）',
    };
  }
  const handle = link.sourceHandle ?? null;
  if (source.data.nodeType === 'branch') {
    if (handle !== 'true' && handle !== 'false') {
      return { ok: false, reason: '条件分岐は、「はい」か「いいえ」の出口から線を引いてください' };
    }
    if (edges.some((edge) => edge.source === source.id && edge.sourceHandle === handle)) {
      return { ok: false, reason: 'その出口には、すでに線があります（先に今の線を消してください）' };
    }
  } else {
    if (handle !== null) {
      return { ok: false, reason: '条件分岐ではないノードに、「はい」「いいえ」の出口はありません' };
    }
    if (edges.some((edge) => edge.source === source.id)) {
      return {
        ok: false,
        reason: '1 つのノードから複数の線は出せません（先に今の線を消してください）',
      };
    }
  }
  if (reachableFrom(target.id, edges).has(source.id)) {
    return { ok: false, reason: '線が輪（ループ）になります' };
  }
  return { ok: true };
}

export interface AvailableVariable {
  /** `{{...}}` の中に書く名前。 */
  token: string;
  /** 画面に出す説明。 */
  label: string;
}

/** あるノードのテンプレートで使える変数（質問・会話履歴と、前に動くノードの出力）。 */
export function availableVariables(
  nodes: FlowNode[],
  edges: Edge[],
  nodeId: string,
): AvailableVariable[] {
  const upstream = upstreamOf(nodeId, edges);
  const variables: AvailableVariable[] = [
    { token: VARIABLE_QUESTION, label: '質問' },
    { token: VARIABLE_HISTORY, label: '会話履歴' },
  ];
  for (const node of nodes) {
    const output = OUTPUT_VARIABLES[node.data.nodeType];
    if (output && upstream.has(node.id)) {
      variables.push({
        token: `${node.id}.${output}`,
        label: `${node.data.label}の出力`,
      });
    }
  }
  return variables;
}

/** あるノードより前にある、検索ノード（生成AI が引用資料にできるもの）。 */
export function upstreamRetrievalNodes(
  nodes: FlowNode[],
  edges: Edge[],
  nodeId: string,
): FlowNode[] {
  const upstream = upstreamOf(nodeId, edges);
  return nodes.filter((node) => node.data.nodeType === 'retrieval' && upstream.has(node.id));
}

/** テキストの、選択している位置に、`{{変数}}` を差し込む。 */
export function insertVariable(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  token: string,
): { value: string; cursor: number } {
  const inserted = `{{${token}}}`;
  return {
    value: text.slice(0, selectionStart) + inserted + text.slice(selectionEnd),
    cursor: selectionStart + inserted.length,
  };
}

export function isStartVariable(token: string): boolean {
  return START_VARIABLES.includes(token);
}

export const BRANCH_HANDLES = HANDLES;
