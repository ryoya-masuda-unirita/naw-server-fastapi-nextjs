import {
  addEdge,
  type Connection,
  type Edge,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import * as api from '../api/client';
import { ApiError } from '../api/client';
import type {
  GraphData,
  NodeType,
  PropertyCatalog,
  WorkflowSummary,
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

  const open = useCallback(
    async (id: string) => {
      try {
        apply(await api.getWorkflow(id), false);
        setMessage(null);
      } catch (error) {
        setMessage(toMessage(error));
      }
    },
    [apply],
  );

  const createNew = useCallback(
    (id: string, workflowName: string, ids: string[]) => {
      apply(newGraph(id, workflowName, ids), true);
      setMessage(null);
    },
    [apply],
  );

  const close = useCallback(() => {
    setSaved(null);
    setIsNew(false);
    setNodes([]);
    setEdges([]);
  }, []);

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
    if (!current) return;
    setBusy('validating');
    try {
      await api.validateWorkflow(current);
      setMessage({ kind: 'success', text: VALID_TEXT });
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy('idle');
    }
  }, [current]);

  const save = useCallback(async () => {
    if (!current || !saved) return;
    setBusy('saving');
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
      setBusy('idle');
    }
  }, [current, saved, isNew, selectedNode, apply, refreshList]);

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
