import { Handle, Position, type NodeProps } from '@xyflow/react';

import type { NodeType } from '../api/types';
import { NODE_LABELS, type FlowNode } from '../editor/model';

/** 本家の Designer に合わせて、データ（入力・出力）と処理を、アイコンと色で見分ける。 */
const STYLES: Record<NodeType, { icon: string; role: string; accent: string }> = {
  start: { icon: '▶', role: '入力', accent: 'border-emerald-500 bg-emerald-50' },
  retrieval: { icon: '🔎', role: '処理', accent: 'border-amber-500 bg-amber-50' },
  'generative-ai': { icon: '⚙', role: '処理', accent: 'border-amber-500 bg-amber-50' },
  end: { icon: '■', role: '出力', accent: 'border-violet-500 bg-violet-50' },
};

export function WorkflowNode({ data, selected }: NodeProps<FlowNode>) {
  const style = STYLES[data.nodeType];
  const ring = selected ? 'ring-2 ring-blue-500' : '';
  return (
    <div
      className={`min-w-36 rounded-md border-2 px-3 py-2 shadow-sm ${style.accent} ${ring}`}
      data-testid={`node-${data.nodeType}`}
    >
      {data.nodeType !== 'start' && <Handle type="target" position={Position.Left} />}
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-lg">
          {style.icon}
        </span>
        <div>
          <div className="text-sm font-semibold">{data.label}</div>
          <div className="text-xs text-slate-500">
            {style.role} / {NODE_LABELS[data.nodeType]}
          </div>
        </div>
      </div>
      {data.nodeType !== 'end' && <Handle type="source" position={Position.Right} />}
    </div>
  );
}
