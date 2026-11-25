import type {
  GraphData,
  PropertyCatalog,
  WorkflowSummary,
} from './types';

const BASE_PATH = '/admin/workflows';
const CATALOG_PATH = '/admin/property-catalog';
const NO_CONTENT = 204;
/** 通信そのものに失敗したときの status。 */
export const NETWORK_ERROR_STATUS = 0;
export const CONNECTION_ERROR_MESSAGE = 'エミュレーターに接続できません';

/** 管理用 API の失敗。サーバーの理由（detail）か、通信の失敗を持つ。 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'detail' in body &&
      typeof body.detail === 'string'
    ) {
      return body.detail;
    }
  } catch {
    // 本文が JSON でないときは、ステータスだけで伝える
  }
  return `エミュレーターがエラーを返しました（HTTP ${response.status}）`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError(NETWORK_ERROR_STATUS, CONNECTION_ERROR_MESSAGE);
  }
  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response));
  }
  if (response.status === NO_CONTENT) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function listWorkflows(): Promise<WorkflowSummary[]> {
  return request(BASE_PATH);
}

export function getWorkflow(id: string): Promise<GraphData> {
  return request(`${BASE_PATH}/${encodeURIComponent(id)}`);
}

export function createWorkflow(graph: GraphData): Promise<GraphData> {
  return request(BASE_PATH, jsonInit('POST', graph));
}

export function updateWorkflow(id: string, graph: GraphData): Promise<GraphData> {
  return request(`${BASE_PATH}/${encodeURIComponent(id)}`, jsonInit('PUT', graph));
}

export function deleteWorkflow(id: string): Promise<void> {
  return request(`${BASE_PATH}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function validateWorkflow(graph: GraphData): Promise<{ ok: boolean }> {
  return request(`${BASE_PATH}/validate`, jsonInit('POST', graph));
}

export function getPropertyCatalog(): Promise<PropertyCatalog> {
  return request(CATALOG_PATH);
}
