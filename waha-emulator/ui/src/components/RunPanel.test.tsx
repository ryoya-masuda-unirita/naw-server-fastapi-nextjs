import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as api from '../api/client';
import { answerOf } from '../editor/answer';
import { RunPanel } from './RunPanel';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, runWorkflow: vi.fn() };
});

afterEach(() => vi.clearAllMocks());

describe('answerOf', () => {
  it('回答の JSON なら本文を取り出す', () => {
    expect(answerOf('{"answer":"こんにちは","references":[]}')).toBe('こんにちは');
  });

  it('JSON でなければ、そのまま返す', () => {
    expect(answerOf('本文だけ')).toBe('本文だけ');
  });
});

describe('RunPanel', () => {
  it('質問が空のあいだは押せない', () => {
    render(<RunPanel graphId="wf" dirty={false} />);

    expect(screen.getByRole('button', { name: '試し実行' })).toBeDisabled();
  });

  it('未保存の変更があるときは押せず、理由を出す', async () => {
    render(<RunPanel graphId="wf" dirty />);
    await userEvent.type(screen.getByLabelText('試し実行の質問'), 'x');

    expect(screen.getByRole('button', { name: '試し実行' })).toBeDisabled();
    expect(screen.getByText(/保存してから/)).toBeInTheDocument();
  });

  it('質問を送り、回答を出す', async () => {
    vi.mocked(api.runWorkflow).mockResolvedValue({ output: '{"answer":"回答です"}' });
    render(<RunPanel graphId="wf" dirty={false} />);

    await userEvent.type(screen.getByLabelText('試し実行の質問'), '旅費は？');
    await userEvent.click(screen.getByRole('button', { name: '試し実行' }));

    expect(await screen.findByLabelText('回答')).toHaveTextContent('回答です');
    expect(api.runWorkflow).toHaveBeenCalledWith('wf', '旅費は？');
  });

  it('失敗したら、理由を出す', async () => {
    vi.mocked(api.runWorkflow).mockRejectedValue(new api.ApiError(502, '生成AIが失敗しました'));
    render(<RunPanel graphId="wf" dirty={false} />);

    await userEvent.type(screen.getByLabelText('試し実行の質問'), 'x');
    await userEvent.click(screen.getByRole('button', { name: '試し実行' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('生成AIが失敗しました');
  });
});
