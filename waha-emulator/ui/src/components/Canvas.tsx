import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react';

import type { NodeType } from '../api/types';
import {
  FLOW_NODE_TYPE,
  NODE_DESCRIPTIONS,
  NODE_LABELS,
  PALETTE_TYPES,
  type FlowNode,
} from '../editor/model';
import { WorkflowNode } from './WorkflowNode';

const NODE_TYPES = { [FLOW_NODE_TYPE]: WorkflowNode };
const DELETE_KEYS = ['Delete', 'Backspace'];

interface Props {
  graphId: string;
  nodes: FlowNode[];
  edges: Edge[];
  onNodesChange: OnNodesChange<FlowNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;
  onAddNode: (type: NodeType) => void;
}

export function Canvas({
  graphId,
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onAddNode,
}: Props) {
  return (
    <div className="relative h-full w-full bg-white">
      <div
        className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2"
        role="toolbar"
        aria-label="ノードを足す"
      >
        <span className="text-xs text-slate-500">ノードを足す:</span>
        {PALETTE_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onAddNode(type)}
            title={NODE_DESCRIPTIONS[type]}
            className="rounded border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm hover:bg-slate-50"
          >
            ＋ {NODE_LABELS[type]}
          </button>
        ))}
      </div>
      <ReactFlow
        key={graphId}
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        deleteKeyCode={DELETE_KEYS}
        fitView
        fitViewOptions={{ maxZoom: 1 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}
