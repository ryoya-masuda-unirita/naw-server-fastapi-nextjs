import { useRef } from 'react';
import type { Edge } from '@xyflow/react';

import {
  MASK,
  type NodeConfig,
  type Operator,
  type PropertyCandidate,
  type PropertyCatalog,
} from '../api/types';
import {
  NODE_DESCRIPTIONS,
  NODE_LABELS,
  OPERATOR_LABELS,
  availableVariables,
  insertVariable,
  upstreamRetrievalNodes,
  type FlowNode,
} from '../editor/model';

const OUTPUT_TYPE_CHAT = 0;
const OUTPUT_TYPE_RAG = 1;
const OUTPUT_TYPE_PLAIN = 2;
const OPERATORS: Operator[] = ['contains', 'equals', 'empty'];

interface Props {
  node: FlowNode | null;
  nodes: FlowNode[];
  edges: Edge[];
  catalog: PropertyCatalog | null;
  onLabelChange: (id: string, label: string) => void;
  onConfigChange: (id: string, patch: Partial<NodeConfig>) => void;
}

interface TemplateFieldProps {
  label: string;
  value: string;
  rows?: number;
  variables: { token: string; label: string }[];
  onChange: (value: string) => void;
}

/** `{{変数}}` を埋め込めるテキスト欄（使える変数を選んで、カーソルの位置に差し込める）。 */
function TemplateField({ label, value, rows = 5, variables, onChange }: TemplateFieldProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function insert(token: string) {
    if (!token) return;
    const area = ref.current;
    const start = area?.selectionStart ?? value.length;
    const stop = area?.selectionEnd ?? value.length;
    const { value: next, cursor } = insertVariable(value, start, stop, token);
    onChange(next);
    // 差し込んだあとに、カーソルを戻す（再描画のあとに設定する）
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <div className="space-y-1">
      <label className="block">
        {label}
        <textarea
          ref={ref}
          value={value}
          rows={rows}
          onChange={(event) => onChange(event.target.value)}
          className="mt-0.5 w-full rounded border px-2 py-1 font-mono text-xs"
        />
      </label>
      <select
        aria-label="変数を挿入"
        value=""
        onChange={(event) => insert(event.target.value)}
        className="w-full rounded border px-2 py-1 text-xs"
      >
        <option value="">＋ 変数を挿入（カーソルの位置に）</option>
        {variables.map((variable) => (
          <option key={variable.token} value={variable.token}>
            {`{{${variable.token}}} … ${variable.label}`}
          </option>
        ))}
      </select>
    </div>
  );
}

interface PropertiesEditorProps {
  properties: Record<string, string>;
  candidates: PropertyCandidate[];
  onChange: (properties: Record<string, string>) => void;
}

/** 接続の設定（プロパティ）の編集。名前は、アダプターの候補から選ぶ。 */
function PropertiesEditor({ properties, candidates, onChange }: PropertiesEditorProps) {
  const secretNames = new Set(candidates.filter((c) => c.secret).map((c) => c.name));
  const available = candidates.filter((c) => !(c.name in properties));
  const selectRef = useRef<HTMLSelectElement>(null);

  function setProperty(name: string, value: string) {
    onChange({ ...properties, [name]: value });
  }

  function removeProperty(name: string) {
    const next = { ...properties };
    delete next[name];
    onChange(next);
  }

  function addProperty() {
    const name = selectRef.current?.value;
    if (!name) return;
    setProperty(name, '');
    if (selectRef.current) selectRef.current.value = '';
  }

  return (
    <section aria-label="プロパティ一覧" className="space-y-2">
      <h3 className="font-semibold">接続の設定（プロパティ）</h3>
      {Object.entries(properties).map(([name, value]) => {
        const secret = secretNames.has(name);
        // 伏せ字かどうかは値だけで決める（「入れ直す」で値が空になれば、入力欄になる）
        const masked = value === MASK;
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
                  onClick={() => setProperty(name, '')}
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
          ref={selectRef}
          aria-label="追加するプロパティ"
          defaultValue=""
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
          className="rounded border px-2 py-1 hover:bg-slate-50"
        >
          追加
        </button>
      </div>
      <p className="text-xs text-slate-500">
        値には <code>{'${環境変数}'}</code> の参照を書けます。
      </p>
    </section>
  );
}

export function PropertyPanel({
  node,
  nodes,
  edges,
  catalog,
  onLabelChange,
  onConfigChange,
}: Props) {
  if (!node) {
    return (
      <aside aria-label="プロパティ" className="h-full border-l bg-white p-4 text-sm text-slate-500">
        ノードを選ぶと、ここで設定を編集できます。
      </aside>
    );
  }

  const { nodeType, config } = node.data;
  const variables = availableVariables(nodes, edges, node.id);
  const change = (patch: Partial<NodeConfig>) => onConfigChange(node.id, patch);
  const retrievalNodes = nodeType === 'llm' ? upstreamRetrievalNodes(nodes, edges, node.id) : [];
  const usesRetrieval = Boolean(config.retrieval);

  return (
    <aside
      aria-label="プロパティ"
      className="h-full space-y-4 overflow-y-auto border-l bg-white p-4 text-sm"
    >
      <div>
        <h2 className="font-semibold">{NODE_LABELS[nodeType]}ノード</h2>
        <p className="text-xs text-slate-500">{NODE_DESCRIPTIONS[nodeType]}</p>
      </div>
      <label className="block">
        名前
        <input
          value={node.data.label}
          onChange={(event) => onLabelChange(node.id, event.target.value)}
          className="mt-0.5 w-full rounded border px-2 py-1"
        />
      </label>

      {nodeType === 'llm' && (
        <>
          <TemplateField
            label="プロンプト"
            value={config.prompt ?? ''}
            variables={variables}
            onChange={(prompt) => change({ prompt })}
          />
          <label className="block">
            引用資料に使う検索
            <select
              value={config.retrieval ?? ''}
              onChange={(event) =>
                change({ retrieval: event.target.value === '' ? null : event.target.value })
              }
              className="mt-0.5 w-full rounded border px-2 py-1"
            >
              <option value="">使わない</option>
              {retrievalNodes.map((retrieval) => (
                <option key={retrieval.id} value={retrieval.id}>
                  {retrieval.data.label}
                </option>
              ))}
            </select>
            {retrievalNodes.length === 0 && (
              <span className="text-xs text-slate-500">
                前に検索ノードをつなぐと、選べます
              </span>
            )}
          </label>
          <label className="block">
            出力モード
            <select
              value={usesRetrieval ? OUTPUT_TYPE_RAG : (config.outputType ?? OUTPUT_TYPE_CHAT)}
              disabled={usesRetrieval}
              onChange={(event) => change({ outputType: Number(event.target.value) })}
              className="mt-0.5 w-full rounded border px-2 py-1 disabled:bg-slate-100"
            >
              {usesRetrieval ? (
                <option value={OUTPUT_TYPE_RAG}>1: RAG（検索あり）</option>
              ) : (
                <>
                  <option value={OUTPUT_TYPE_CHAT}>0: チャット用_回答（JSON）</option>
                  <option value={OUTPUT_TYPE_PLAIN}>2: 回答の本文だけ</option>
                </>
              )}
            </select>
            <span className="text-xs text-slate-500">
              途中のノードは「2」がおすすめ。最後に返すノードは、server-local が読める「0」か「1」
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.inheritContext ?? false}
              onChange={(event) => change({ inheritContext: event.target.checked })}
            />
            会話履歴・添付ファイルも渡す
          </label>
          <PropertiesEditor
            properties={config.properties ?? {}}
            candidates={catalog?.generativeAi ?? []}
            onChange={(properties) => change({ properties })}
          />
        </>
      )}

      {nodeType === 'retrieval' && (
        <>
          <TemplateField
            label="検索語"
            value={config.query ?? ''}
            rows={3}
            variables={variables}
            onChange={(query) => change({ query })}
          />
          <PropertiesEditor
            properties={config.properties ?? {}}
            candidates={catalog?.retrieval ?? []}
            onChange={(properties) => change({ properties })}
          />
        </>
      )}

      {nodeType === 'template' && (
        <TemplateField
          label="文字列"
          value={config.text ?? ''}
          variables={variables}
          onChange={(text) => change({ text })}
        />
      )}

      {nodeType === 'branch' && (
        <>
          <label className="block">
            調べる変数
            <select
              value={config.variable ?? ''}
              onChange={(event) => change({ variable: event.target.value })}
              className="mt-0.5 w-full rounded border px-2 py-1"
            >
              {!variables.some((v) => v.token === config.variable) && (
                <option value={config.variable ?? ''}>{config.variable || '（選んでください）'}</option>
              )}
              {variables.map((variable) => (
                <option key={variable.token} value={variable.token}>
                  {`${variable.token}（${variable.label}）`}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            条件
            <select
              value={config.operator ?? 'contains'}
              onChange={(event) => change({ operator: event.target.value as Operator })}
              className="mt-0.5 w-full rounded border px-2 py-1"
            >
              {OPERATORS.map((operator) => (
                <option key={operator} value={operator}>
                  {OPERATOR_LABELS[operator]}
                </option>
              ))}
            </select>
          </label>
          {config.operator !== 'empty' && (
            <label className="block">
              値
              <input
                value={config.value ?? ''}
                onChange={(event) => change({ value: event.target.value })}
                className="mt-0.5 w-full rounded border px-2 py-1"
              />
              <span className="text-xs text-slate-500">
                大文字小文字は区別しません。{'{{ }}'} は、展開されません
              </span>
            </label>
          )}
          <p className="text-xs text-slate-500">
            条件に合えば「はい」、合わなければ「いいえ」の出口から、先へ進みます。
          </p>
        </>
      )}

      {nodeType === 'end' && (
        <TemplateField
          label="回答にする文字列"
          value={config.output ?? ''}
          rows={3}
          variables={variables}
          onChange={(output) => change({ output })}
        />
      )}
    </aside>
  );
}
