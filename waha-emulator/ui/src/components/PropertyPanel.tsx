import { useState } from 'react';

import { MASK, type PropertyCandidate, type PropertyCatalog } from '../api/types';
import { NODE_LABELS, type FlowNode, type FlowNodeData } from '../editor/model';

const OUTPUT_TYPE_CHAT = 0;
const OUTPUT_TYPE_PLAIN = 2;

interface Props {
  node: FlowNode | null;
  catalog: PropertyCatalog | null;
  /** 検索ノードがあるときは、RAG で固定になり、出力モードを選べない。 */
  hasRetrieval: boolean;
  onChange: (id: string, patch: Partial<FlowNodeData>) => void;
}

function candidatesFor(node: FlowNode, catalog: PropertyCatalog | null): PropertyCandidate[] {
  if (!catalog) return [];
  if (node.data.nodeType === 'retrieval') return catalog.retrieval;
  if (node.data.nodeType === 'generative-ai') return catalog.generativeAi;
  return [];
}

export function PropertyPanel({ node, catalog, hasRetrieval, onChange }: Props) {
  const [toAdd, setToAdd] = useState('');
  // 伏せた値を「入れ直す」と選んだ項目（保存済みの値を使わず、新しい値を入れる）
  const [reentering, setReentering] = useState<Set<string>>(new Set());

  if (!node) {
    return (
      <aside aria-label="プロパティ" className="h-full border-l bg-white p-4 text-sm text-slate-500">
        ノードを選ぶと、ここで設定を編集できます。
      </aside>
    );
  }

  const { nodeType, properties } = node.data;
  const candidates = candidatesFor(node, catalog);
  const secretNames = new Set(candidates.filter((c) => c.secret).map((c) => c.name));
  const available = candidates.filter((c) => !(c.name in properties));
  const hasProperties = nodeType === 'retrieval' || nodeType === 'generative-ai';

  function setProperty(name: string, value: string) {
    onChange(node!.id, { properties: { ...properties, [name]: value } });
  }

  function removeProperty(name: string) {
    const next = { ...properties };
    delete next[name];
    onChange(node!.id, { properties: next });
  }

  function addProperty() {
    if (!toAdd) return;
    setProperty(toAdd, '');
    setToAdd('');
  }

  return (
    <aside aria-label="プロパティ" className="h-full space-y-4 overflow-y-auto border-l bg-white p-4 text-sm">
      <h2 className="font-semibold">{NODE_LABELS[nodeType]}ノード</h2>
      <label className="block">
        名前
        <input
          value={node.data.label}
          onChange={(event) => onChange(node.id, { label: event.target.value })}
          className="mt-0.5 w-full rounded border px-2 py-1"
        />
      </label>

      {nodeType === 'generative-ai' && (
        <label className="block">
          出力モード
          <select
            value={hasRetrieval ? 1 : (node.data.outputType ?? OUTPUT_TYPE_CHAT)}
            disabled={hasRetrieval}
            onChange={(event) => onChange(node.id, { outputType: Number(event.target.value) })}
            className="mt-0.5 w-full rounded border px-2 py-1 disabled:bg-slate-100"
          >
            <option value={OUTPUT_TYPE_CHAT}>0: チャット用_回答</option>
            <option value={1}>1: RAG（検索あり）</option>
            <option value={OUTPUT_TYPE_PLAIN}>2: 回答の本文だけ</option>
          </select>
          {hasRetrieval && (
            <span className="text-xs text-slate-500">検索ノードがあるため、RAG で固定です</span>
          )}
        </label>
      )}

      {hasProperties && (
        <section aria-label="プロパティ一覧" className="space-y-2">
          <h3 className="font-semibold">プロパティ</h3>
          {Object.entries(properties).map(([name, value]) => {
            const secret = secretNames.has(name);
            const masked = value === MASK && !reentering.has(name);
            return (
              <div key={name} className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs">{name}</span>
                  <button
                    type="button"
                    onClick={() => removeProperty(name)}
                    aria-label={`${name}を削除`}
                    className="text-slate-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
                {masked ? (
                  <div className="flex items-center gap-2 rounded border bg-slate-50 px-2 py-1">
                    <span className="flex-1 text-slate-500">保存済みの値を使います</span>
                    <button
                      type="button"
                      onClick={() => {
                        setReentering(new Set(reentering).add(name));
                        setProperty(name, '');
                      }}
                      className="text-blue-600"
                    >
                      入れ直す
                    </button>
                  </div>
                ) : (
                  <input
                    aria-label={`${name}の値`}
                    type={secret ? 'password' : 'text'}
                    autoComplete="off"
                    value={value}
                    onChange={(event) => setProperty(name, event.target.value)}
                    className="w-full rounded border px-2 py-1"
                  />
                )}
              </div>
            );
          })}
          <div className="flex gap-2 pt-1">
            <select
              aria-label="追加するプロパティ"
              value={toAdd}
              onChange={(event) => setToAdd(event.target.value)}
              className="min-w-0 flex-1 rounded border px-2 py-1"
            >
              <option value="">プロパティを選ぶ</option>
              {available.map((candidate) => (
                <option key={candidate.name} value={candidate.name}>
                  {candidate.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addProperty}
              disabled={!toAdd}
              className="rounded border px-2 py-1 hover:bg-slate-50 disabled:opacity-50"
            >
              追加
            </button>
          </div>
          <p className="text-xs text-slate-500">
            値には <code>{'${環境変数}'}</code> の参照を書けます。
          </p>
        </section>
      )}
    </aside>
  );
}
