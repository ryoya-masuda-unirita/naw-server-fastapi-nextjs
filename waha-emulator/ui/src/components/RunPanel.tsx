import { useState } from 'react';

import { ApiError, runWorkflow } from '../api/client';
import { answerOf } from '../editor/answer';

const MAX_QUESTION_LENGTH = 4000;

interface Props {
  graphId: string;
  /** 未保存の変更があるとき（動かすのは、保存済みのもの）。 */
  dirty: boolean;
}

/** 保存したワークフローに質問を送り、回答を見る（試し実行）。 */
export function RunPanel({ graphId, dirty }: Props) {
  const [question, setQuestion] = useState('');
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setOutput(null);
    try {
      const result = await runWorkflow(graphId, question);
      setOutput(result.output);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '試し実行に失敗しました');
    } finally {
      setRunning(false);
    }
  }

  const disabled = dirty || running || question.trim() === '';

  return (
    <section aria-label="試し実行" className="space-y-2 border-t bg-white p-3 text-sm">
      <div className="flex items-start gap-2">
        <textarea
          aria-label="試し実行の質問"
          value={question}
          maxLength={MAX_QUESTION_LENGTH}
          rows={2}
          placeholder="質問を入れて、「試し実行」を押す（保存したワークフローが動きます）"
          onChange={(event) => setQuestion(event.target.value)}
          className="min-w-0 flex-1 rounded border px-2 py-1"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => void run()}
          className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50"
        >
          {running ? '実行中…' : '試し実行'}
        </button>
      </div>
      {dirty && (
        <p className="text-xs text-amber-700">
          未保存の変更があります。保存してから、試し実行してください。
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {output !== null && (
        <div>
          <p aria-label="回答" className="whitespace-pre-wrap rounded border bg-slate-50 p-2">
            {answerOf(output)}
          </p>
          <details className="mt-1 text-xs text-slate-500">
            <summary>出力のすべて</summary>
            <pre className="whitespace-pre-wrap">{output}</pre>
          </details>
        </div>
      )}
    </section>
  );
}
