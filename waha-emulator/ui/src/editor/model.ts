import type { Edge, Node } from '@xyflow/react';

import {
  GRAPH_VERSION,
  type GraphData,
  type GraphNodeData,
  type NodeType,
} from '../api/types';

/** キャンバスのノードが持つデータ。 */
export interface FlowNodeData extends Record<string, unknown> {
  nodeType: NodeType;
  label: string;
  properties: Record<string, string>;
  outputType?: number;
}

export type FlowNode = Node<FlowNodeData, 'workflow'>;

export const FLOW_NODE_TYPE = 'workflow';
export const NODE_LABELS: Record<NodeType, string> = {
  start: '開始',
  retrieval: '検索',
  'generative-ai': '生成AI',
  end: '終了',
};
/** 画面から足せるのは検索だけ（開始・終了・生成AI は 1 つずつで固定）。 */
const ADDABLE_TYPES: readonly NodeType[] = ['retrieval'];
const DELETABLE_TYPES: readonly NodeType[] = ['retrieval'];
/** 引いてよい線（出力元 → 入力先）。開始 →（検索 →）生成AI → 終了。 */
const ALLOWED_LINKS: readonly (readonly [NodeType, NodeType])[] = [
  ['start', 'retrieval'],
  ['start', 'generative-ai'],
  ['retrieval', 'generative-ai'],
  ['generative-ai', 'end'],
];
const NEW_NODE_POSITION = { x: 200, y: 160 };
/** 検索ノードを入れるとき、生成AI と終了を右へずらす幅（ノードが重ならない幅）。 */
const RETRIEVAL_SHIFT_X = 280;

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

function edgeId(source: string, target: string): string {
  return `${source}->${target}`;
}

export function toFlow(graph: GraphData): { nodes: FlowNode[]; edges: Edge[] } {
  const nodes: FlowNode[] = graph.nodes.map((node) => ({
    id: node.id,
    type: FLOW_NODE_TYPE,
    position: { x: node.position.x, y: node.position.y },
    deletable: DELETABLE_TYPES.includes(node.type),
    data: {
      nodeType: node.type,
      label: node.name ?? node.id,
      properties: { ...(node.properties ?? {}) },
      ...(node.outputType === undefined ? {} : { outputType: node.outputType }),
    },
  }));
  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edgeId(edge.source, edge.target),
    source: edge.source,
    target: edge.target,
  }));
  return { nodes, edges };
}

export function fromFlow(
  base: Pick<GraphData, 'id' | 'name' | 'serviceIds'>,
  nodes: FlowNode[],
  edges: Edge[],
): GraphData {
  // 検索ノードがあるときの出力モードは RAG で固定のため、サーバーには送らない（送ると 400 になる）
  const retrievalPresent = hasRetrieval(nodes);
  return {
    version: GRAPH_VERSION,
    id: base.id,
    name: base.name,
    serviceIds: [...base.serviceIds],
    nodes: nodes.map((node): GraphNodeData => {
      const { nodeType, label, properties, outputType } = node.data;
      const hasProperties = nodeType === 'retrieval' || nodeType === 'generative-ai';
      return {
        id: node.id,
        type: nodeType,
        name: label,
        // 動かしたときの小数で、未保存の判定が揺れないよう、整数にそろえる
        position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
        ...(hasProperties ? { properties: { ...properties } } : {}),
        ...(nodeType === 'generative-ai' && outputType !== undefined && !retrievalPresent
          ? { outputType }
          : {}),
      };
    }),
    edges: edges.map((edge) => ({ source: edge.source, target: edge.target })),
  };
}

/** サーバーから読んだ定義を、画面が保存するときと同じ形にそろえる（未保存の判定の基準にする）。 */
export function normalize(graph: GraphData): GraphData {
  const { nodes, edges } = toFlow(graph);
  return fromFlow(graph, nodes, edges);
}

export function newGraph(id: string, name: string, serviceIds: string[]): GraphData {
  return {
    version: GRAPH_VERSION,
    id,
    name,
    serviceIds,
    nodes: [
      { id: 'start', type: 'start', name: NODE_LABELS.start, position: { x: 0, y: 80 } },
      {
        id: 'gen',
        type: 'generative-ai',
        name: NODE_LABELS['generative-ai'],
        position: { x: 280, y: 80 },
        properties: { ...ECHO_PROPERTIES },
      },
      { id: 'end', type: 'end', name: NODE_LABELS.end, position: { x: 560, y: 80 } },
    ],
    edges: [
      { source: 'start', target: 'gen' },
      { source: 'gen', target: 'end' },
    ],
  };
}

function sortedForCompare(graph: GraphData): GraphData {
  return {
    ...graph,
    nodes: [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...graph.edges].sort((a, b) =>
      edgeId(a.source, a.target).localeCompare(edgeId(b.source, b.target)),
    ),
  };
}

export function isDirty(saved: GraphData, current: GraphData): boolean {
  return (
    JSON.stringify(sortedForCompare(saved)) !== JSON.stringify(sortedForCompare(current))
  );
}

export function isDeletable(nodeType: NodeType): boolean {
  return DELETABLE_TYPES.includes(nodeType);
}

export function canAddNode(nodes: FlowNode[], type: NodeType): Check {
  if (!ADDABLE_TYPES.includes(type)) {
    return { ok: false, reason: `${NODE_LABELS[type]}ノードは足せません` };
  }
  if (nodes.some((node) => node.data.nodeType === type)) {
    return { ok: false, reason: `${NODE_LABELS[type]}ノードは 1 つまでです` };
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
    deletable: isDeletable(type),
    data: {
      nodeType: type,
      label: NODE_LABELS[type],
      properties: type === 'retrieval' ? { ...DEFAULT_RETRIEVAL_PROPERTIES } : {},
    },
  };
}

export function canConnect(
  nodes: FlowNode[],
  edges: Edge[],
  link: { source: string | null; target: string | null },
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
  if (edges.some((edge) => edge.source === source.id)) {
    return { ok: false, reason: '1 つのノードから複数の線は出せません（先に今の線を消してください）' };
  }
  if (edges.some((edge) => edge.target === target.id)) {
    return { ok: false, reason: '1 つのノードに複数の線は入れません（先に今の線を消してください）' };
  }
  const allowed = ALLOWED_LINKS.some(
    ([from, to]) => from === source.data.nodeType && to === target.data.nodeType,
  );
  if (!allowed) {
    return {
      ok: false,
      reason: '開始 →（検索 →）生成AI → 終了 の順につないでください',
    };
  }
  const skipsRetrieval =
    source.data.nodeType === 'start' &&
    target.data.nodeType === 'generative-ai' &&
    nodes.some((node) => node.data.nodeType === 'retrieval');
  if (skipsRetrieval) {
    return {
      ok: false,
      reason: '検索ノードがあるときは、開始 → 検索 → 生成AI の順につないでください',
    };
  }
  return { ok: true };
}

export function hasRetrieval(nodes: FlowNode[]): boolean {
  return nodes.some((node) => node.data.nodeType === 'retrieval');
}

/**
 * 検索ノードを、生成AI の位置に入れ、生成AI とそれより右のノードを右へずらす。
 * 開始 → 検索 → 生成AI → 終了 が、左から右へ重ならずに並ぶ。
 */
export function insertRetrieval(nodes: FlowNode[]): FlowNode[] {
  const generative = nodes.find((node) => node.data.nodeType === 'generative-ai');
  const added = addNode(nodes, 'retrieval');
  if (!generative) {
    return [...nodes, added];
  }
  const { x, y } = generative.position;
  const shifted = nodes.map((node) =>
    node.position.x >= x
      ? { ...node, position: { x: node.position.x + RETRIEVAL_SHIFT_X, y: node.position.y } }
      : node,
  );
  return [...shifted, { ...added, position: { x, y } }];
}
