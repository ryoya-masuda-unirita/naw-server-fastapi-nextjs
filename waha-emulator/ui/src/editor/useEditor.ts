import {
  addEdge,
  type Connection,
  type Edge,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import * as api from '../api/client';
import { ApiError } from '../api/client';
import {
  GRAPH_VERSION,
  LEGACY_VERSION,
  type GraphData,
  type LegacyGraphData,
  type NodeConfig,
  type NodeType,
  type PropertyCatalog,
  type WorkflowSummary,
} from '../api/types';
import {
  addNode,
  canAddNode,
  canConnect,
  convertLegacy,
  fromFlow,
  isDirty,
  newGraph,
  normalize,
  toFlow,
  type FlowNode,
} from './model';

export type Message = { kind: 'success' | 'error' | 'info'; text: string };
export type Busy = 'idle' | 'validating' | 'saving';

const SAVED_TEXT = '保存しました';
const VALID_TEXT = '検証しました。問題ありません';
const LEGACY_TEXT =
  'このワークフローは、版 1（鎖）の形式です。この画面は、版 2 に変換して開きました。保存すると、版 2 になります';
const UNSUPPORTED_VERSION_TEXT = (version: unknown) =>
  `対応していない形式（version: ${String(version)}）のワークフローです`;

function toMessage(error: unknown): Message {
  const text = error instanceof ApiError ? error.message : '予期しないエラーが起きました';
  return { kind: 'error', text };
}

/** 検索ノードが消えたとき、それを引用資料に使っていた生成AI の紐づけを外す（残すと保存が 400 になる）。 */
function dropDanglingRetrievalLinks(nodes: FlowNode[]): FlowNode[] {
  const ids = new Set(nodes.map((node) => node.id));
  return nodes.map((node) => {
    const link = node.data.config.retrieval;
    if (node.data.nodeType === 'llm' && link && !ids.has(link)) {
      return { ...node, data: { ...node.data, config: { ...node.data.config, retrieval: null } } };
    }
    return node;
  });
}

/** ワークフローの一覧と、開いている定義の編集状態。サーバーとのやり取りもここに集める。 */
export function useEditor() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [catalog, setCatalog] = useState<PropertyCatalog | null>(null);
  const [saved, setSaved] = useState<GraphData | null>(null);
  const [isNew, setIsNew] = useState(false);
  // 版 1 から変換して開いた（保存するまで、未保存として扱う）
  const [converted, setConverted] = useState(false);
  const [name, setName] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState<Busy>('idle');
  // 再描画の前に続けて呼ばれても、二重に送らないよう、state とは別に持つ
  const busyRef = useRef<Busy>('idle');

  const begin = useCallback((kind: Exclude<Busy, 'idle'>) => {
    if (busyRef.current !== 'idle') return false;
    busyRef.current = kind;
    setBusy(kind);
    return true;
  }, []);
  const end = useCallback(() => {
    busyRef.current = 'idle';
    setBusy('idle');
  }, []);

  const current = useMemo<GraphData | null>(
    () => (saved ? fromFlow({ id: saved.id, name, serviceIds }, nodes, edges) : null),
    [saved, name, serviceIds, nodes, edges],
  );
  const dirty =
    saved !== null && current !== null && (isNew || converted || isDirty(saved, current));
  const selectedNode = nodes.find((node) => node.selected) ?? null;

  const refreshList = useCallback(async () => {
    try {
      setWorkflows(await api.listWorkflows());
    } catch (error) {
      setMessage(toMessage(error));
    }
  }, []);

  // 起動時の取得。結果は、非同期の戻りで反映する（effect の中で同期的に状態を変えない）
  useEffect(() => {
    const fail = (error: unknown) => setMessage(toMessage(error));
    api.listWorkflows().then(setWorkflows).catch(fail);
    api.getPropertyCatalog().then(setCatalog).catch(fail);
  }, []);

  const apply = useCallback(
    (graph: GraphData, fresh: boolean, convertedFromLegacy = false, keepSelectedId?: string) => {
      const flow = toFlow(graph);
      setSaved(normalize(graph));
      setIsNew(fresh);
      setConverted(convertedFromLegacy);
      setName(graph.name);
      setServiceIds(graph.serviceIds);
      setNodes(flow.nodes.map((n) => ({ ...n, selected: n.id === keepSelectedId })));
      setEdges(flow.edges);
    },
    [],
  );

  const close = useCallback(() => {
    setSaved(null);
    setIsNew(false);
    setConverted(false);
    setNodes([]);
    setEdges([]);
  }, []);

  const open = useCallback(
    async (id: string) => {
      try {
        const loaded: GraphData | LegacyGraphData = await api.getWorkflow(id);
        if (loaded.version === GRAPH_VERSION) {
          apply(loaded as GraphData, false);
          setMessage(null);
        } else if (loaded.version === LEGACY_VERSION) {
          apply(convertLegacy(loaded as LegacyGraphData), false, true);
          setMessage({ kind: 'info', text: LEGACY_TEXT });
        } else {
          // 前に開いていたワークフローを、画面に残さない（別のものと取り違えて、編集・削除しないため）
          close();
          setMessage({ kind: 'error', text: UNSUPPORTED_VERSION_TEXT(loaded.version) });
        }
      } catch (error) {
        setMessage(toMessage(error));
      }
    },
    [apply, close],
  );

  const createNew = useCallback(
    (id: string, workflowName: string, ids: string[]) => {
      apply(newGraph(id, workflowName, ids), true);
      setMessage(null);
    },
    [apply],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await api.deleteWorkflow(id);
        if (saved?.id === id) {
          close();
        }
        await refreshList();
        setMessage(null);
      } catch (error) {
        setMessage(toMessage(error));
      }
    },
    [saved, close, refreshList],
  );

  const validate = useCallback(async () => {
    if (!current || !begin('validating')) return;
    try {
      await api.validateWorkflow(current);
      setMessage({ kind: 'success', text: VALID_TEXT });
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      end();
    }
  }, [current, begin, end]);

  const save = useCallback(async () => {
    if (!current || !saved || !begin('saving')) return;
    try {
      await api.validateWorkflow(current);
      const result = isNew
        ? await api.createWorkflow(current)
        : await api.updateWorkflow(saved.id, current);
      apply(result, false, false, selectedNode?.id);
      await refreshList();
      setMessage({ kind: 'success', text: SAVED_TEXT });
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      end();
    }
  }, [current, saved, isNew, selectedNode, apply, refreshList, begin, end]);

  const onNodesChange = useCallback<OnNodesChange<FlowNode>>(
    (changes) => setNodes((previous) => dropDanglingRetrievalLinks(changes.applyTo(previous))),
    [],
  );
  const onEdgesChange = useCallback<OnEdgesChange>(
    (changes) => setEdges((previous) => changes.applyTo(previous)),
    [],
  );

  const connect = useCallback(
    (connection: Connection) => {
      const check = canConnect(nodes, edges, connection);
      if (!check.ok) {
        setMessage({ kind: 'error', text: check.reason });
        return;
      }
      const handle = connection.sourceHandle;
      setEdges((previous) =>
        addEdge(
          {
            ...connection,
            id: `${connection.source}${handle ? `:${handle}` : ''}->${connection.target}`,
            ...(handle ? { label: handle === 'true' ? 'はい' : 'いいえ' } : {}),
          },
          previous,
        ),
      );
      setMessage(null);
    },
    [nodes, edges],
  );

  const addNodeOfType = useCallback((type: NodeType) => {
    const check = canAddNode(type);
    if (!check.ok) {
      setMessage({ kind: 'error', text: check.reason });
      return;
    }
    // 足したノードを選んで、右のパネルで、すぐ設定できるようにする
    setNodes((previous) => [
      ...previous.map((node) => ({ ...node, selected: false })),
      { ...addNode(previous, type), selected: true },
    ]);
    setMessage(null);
  }, []);

  const updateNodeLabel = useCallback((id: string, label: string) => {
    setNodes((previous) =>
      previous.map((node) => (node.id === id ? { ...node, data: { ...node.data, label } } : node)),
    );
  }, []);

  const updateNodeConfig = useCallback((id: string, patch: Partial<NodeConfig>) => {
    setNodes((previous) =>
      previous.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, config: { ...node.data.config, ...patch } } }
          : node,
      ),
    );
  }, []);

  return {
    workflows,
    catalog,
    openId: saved?.id ?? null,
    isNew,
    name,
    serviceIds,
    nodes,
    edges,
    selectedNode,
    message,
    busy,
    dirty,
    setName,
    setServiceIds,
    open,
    createNew,
    remove,
    validate,
    save,
    onNodesChange,
    onEdgesChange,
    connect,
    addNodeOfType,
    updateNodeLabel,
    updateNodeConfig,
  };
}

export type Editor = ReturnType<typeof useEditor>;
