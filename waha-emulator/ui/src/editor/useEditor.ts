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
  type GraphData,
  type NodeType,
  type PropertyCatalog,
  type WorkflowSummary,
} from '../api/types';
import {
  canAddNode,
  canConnect,
  fromFlow,
  insertRetrieval,
  isDirty,
  newGraph,
  normalize,
  toFlow,
  type FlowNode,
  type FlowNodeData,
} from './model';

export type Message = { kind: 'success' | 'error'; text: string };
export type Busy = 'idle' | 'validating' | 'saving';

const SAVED_TEXT = '保存しました';
const VALID_TEXT = '検証しました。問題ありません';
const UNSUPPORTED_VERSION_TEXT =
  'このワークフローは、版 2 の形式です。この画面は、まだ版 2 に対応していないため、開けません（API で編集してください）';

function toMessage(error: unknown): Message {
  const text = error instanceof ApiError ? error.message : '予期しないエラーが起きました';
  return { kind: 'error', text };
}

/** ワークフローの一覧と、開いている定義の編集状態。サーバーとのやり取りもここに集める。 */
export function useEditor() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [catalog, setCatalog] = useState<PropertyCatalog | null>(null);
  const [saved, setSaved] = useState<GraphData | null>(null);
  const [isNew, setIsNew] = useState(false);
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
  const dirty = saved !== null && current !== null && (isNew || isDirty(saved, current));
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

  const apply = useCallback((graph: GraphData, fresh: boolean, keepSelectedId?: string) => {
    const flow = toFlow(graph);
    setSaved(normalize(graph));
    setIsNew(fresh);
    setName(graph.name);
    setServiceIds(graph.serviceIds);
    setNodes(flow.nodes.map((n) => ({ ...n, selected: n.id === keepSelectedId })));
    setEdges(flow.edges);
  }, []);

  const close = useCallback(() => {
    setSaved(null);
    setIsNew(false);
    setNodes([]);
    setEdges([]);
  }, []);

  const open = useCallback(
    async (id: string) => {
      try {
        const graph = await api.getWorkflow(id);
        // 画面は、まだ版 1（鎖）だけに対応している。版 2 は、開かずに、理由を出す
        if (graph.version !== GRAPH_VERSION) {
          // 前に開いていたワークフローを、画面に残さない（別のものと取り違えて、編集・削除しないため）
          close();
          setMessage({ kind: 'error', text: UNSUPPORTED_VERSION_TEXT });
          return;
        }
        apply(graph, false);
        setMessage(null);
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
      apply(result, false, selectedNode?.id);
      await refreshList();
      setMessage({ kind: 'success', text: SAVED_TEXT });
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      end();
    }
  }, [current, saved, isNew, selectedNode, apply, refreshList, begin, end]);

  const onNodesChange = useCallback<OnNodesChange<FlowNode>>(
    (changes) => setNodes((previous) => changes.applyTo(previous)),
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
      setEdges((previous) =>
        addEdge({ ...connection, id: `${connection.source}->${connection.target}` }, previous),
      );
      setMessage(null);
    },
    [nodes, edges],
  );

  const addNodeOfType = useCallback(
    (type: NodeType) => {
      const check = canAddNode(nodes, type);
      if (!check.ok) {
        setMessage({ kind: 'error', text: check.reason });
        return;
      }
      setNodes((previous) => insertRetrieval(previous));
      setMessage(null);
    },
    [nodes],
  );

  const updateNodeData = useCallback((id: string, patch: Partial<FlowNodeData>) => {
    setNodes((previous) =>
      previous.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...patch } } : node,
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
    updateNodeData,
  };
}

export type Editor = ReturnType<typeof useEditor>;
