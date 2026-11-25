import { useState, type FormEvent } from 'react';

import type { WorkflowSummary } from '../api/types';

const ID_PATTERN = /^[a-z0-9_-]{1,64}$/;

interface Props {
  workflows: WorkflowSummary[];
  openId: string | null;
  onSelect: (id: string) => void;
  onCreate: (id: string, name: string, serviceIds: string[]) => void;
  onDelete: (id: string) => void;
}

export function WorkflowList({ workflows, openId, onSelect, onCreate, onDelete }: Props) {
  const [creating, setCreating] = useState(false);
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ID_PATTERN.test(id)) {
      setError('ID は英小文字・数字・-・_ の 1〜64 文字にしてください');
      return;
    }
    if (!name.trim() || !serviceId.trim()) {
      setError('名前とサービス ID を入れてください');
      return;
    }
    onCreate(id, name.trim(), [serviceId.trim()]);
    setCreating(false);
    setId('');
    setName('');
    setServiceId('');
    setError(null);
  }

  function remove(target: WorkflowSummary) {
    if (window.confirm(`ワークフロー「${target.name}」を削除しますか？`)) {
      onDelete(target.id);
    }
  }

  return (
    <nav aria-label="ワークフロー一覧" className="flex h-full flex-col border-r bg-white">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-semibold">ワークフロー</h2>
        <button
          type="button"
          onClick={() => setCreating((value) => !value)}
          className="rounded border border-slate-300 px-2 py-0.5 text-sm hover:bg-slate-50"
        >
          ＋ 新規
        </button>
      </div>
      {creating && (
        <form onSubmit={submit} className="space-y-2 border-b bg-slate-50 p-3 text-sm">
          <label className="block">
            ID
            <input
              value={id}
              onChange={(event) => setId(event.target.value)}
              className="mt-0.5 w-full rounded border px-2 py-1"
            />
          </label>
          <label className="block">
            名前
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-0.5 w-full rounded border px-2 py-1"
            />
          </label>
          <label className="block">
            サービス ID
            <input
              value={serviceId}
              onChange={(event) => setServiceId(event.target.value)}
              className="mt-0.5 w-full rounded border px-2 py-1"
            />
          </label>
          {error && (
            <p role="alert" className="text-red-600">
              {error}
            </p>
          )}
          <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-white">
            作成
          </button>
        </form>
      )}
      <ul className="flex-1 overflow-y-auto">
        {workflows.length === 0 && (
          <li className="px-3 py-4 text-sm text-slate-500">ワークフローがありません</li>
        )}
        {workflows.map((workflow) => (
          <li
            key={workflow.id}
            className={`group flex items-center border-b ${
              workflow.id === openId ? 'bg-blue-50' : ''
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(workflow.id)}
              aria-current={workflow.id === openId ? 'true' : undefined}
              className="flex-1 px-3 py-2 text-left hover:bg-slate-50"
            >
              <div className="text-sm font-medium">{workflow.name}</div>
              <div className="text-xs text-slate-500">{workflow.serviceIds.join(', ')}</div>
            </button>
            <button
              type="button"
              onClick={() => remove(workflow)}
              aria-label={`${workflow.name}を削除`}
              className="px-2 text-slate-400 hover:text-red-600"
            >
              🗑
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
