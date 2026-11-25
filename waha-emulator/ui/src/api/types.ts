/** サーバー（waha-emulator の管理用 API）とやり取りする JSON の型。保存形式は版 1。 */

export const GRAPH_VERSION = 1;
/** サーバーが秘密情報の代わりに返す伏せ字。送り返すと、保存済みの値を引き継ぐ。 */
export const MASK = '********';

export type NodeType = 'start' | 'retrieval' | 'generative-ai' | 'end';

export interface Position {
  x: number;
  y: number;
}

export interface GraphNodeData {
  id: string;
  type: NodeType;
  name?: string;
  position: Position;
  properties?: Record<string, string>;
  outputType?: number;
}

export interface GraphEdgeData {
  source: string;
  target: string;
}

export interface GraphData {
  version: number;
  id: string;
  name: string;
  serviceIds: string[];
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
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
