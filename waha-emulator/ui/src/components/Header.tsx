import { useState, type KeyboardEvent } from 'react';

import type { Busy, Message } from '../editor/useEditor';

const MESSAGE_COLORS = {
  error: 'text-red-600',
  success: 'text-emerald-700',
  info: 'text-sky-700',
} as const;

interface Props {
  name: string;
  serviceIds: string[];
  dirty: boolean;
  busy: Busy;
  message: Message | null;
  onNameChange: (name: string) => void;
  onServiceIdsChange: (serviceIds: string[]) => void;
  onValidate: () => void;
  onSave: () => void;
}

export function Header({
  name,
  serviceIds,
  dirty,
  busy,
  message,
  onNameChange,
  onServiceIdsChange,
  onValidate,
  onSave,
}: Props) {
  const [draft, setDraft] = useState('');
  const working = busy !== 'idle';

  function addServiceId() {
    const value = draft.trim();
    if (value && !serviceIds.includes(value)) {
      onServiceIdsChange([...serviceIds, value]);
    }
    setDraft('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      addServiceId();
    }
  }

  return (
    <header className="space-y-1 border-b bg-white px-4 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          名前
          <input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            className="w-56 rounded border px-2 py-1"
          />
        </label>
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <span>サービス ID</span>
          {serviceIds.map((id) => (
            <span key={id} className="flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5">
              {id}
              <button
                type="button"
                aria-label={`サービス ID ${id}を削除`}
                onClick={() => onServiceIdsChange(serviceIds.filter((value) => value !== id))}
                className="text-slate-400 hover:text-red-600"
              >
                ✕
              </button>
            </span>
          ))}
          <input
            aria-label="サービス ID を追加"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={addServiceId}
            placeholder="追加"
            className="w-24 rounded border px-2 py-0.5"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-sm text-amber-600">● 未保存</span>}
          <button
            type="button"
            onClick={onValidate}
            disabled={working}
            className="rounded border px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            検証
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={working}
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy === 'saving' ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`text-sm ${MESSAGE_COLORS[message.kind]}`}
        >
          {message.text}
        </p>
      )}
    </header>
  );
}
