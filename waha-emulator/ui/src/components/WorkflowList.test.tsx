import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowSummary } from '../api/types';
import { WorkflowList } from './WorkflowList';

const WORKFLOWS: WorkflowSummary[] = [
  { id: 'a', name: '社内QA', serviceIds: ['assistant-1', 'assistant-2'] },
  { id: 'b', name: '検索なし', serviceIds: ['plain'] },
];

function setup(workflows = WORKFLOWS, openId: string | null = null) {
  const handlers = { onSelect: vi.fn(), onCreate: vi.fn(), onDelete: vi.fn() };
  render(<WorkflowList workflows={workflows} openId={openId} {...handlers} />);
  return handlers;
}

afterEach(() => vi.restoreAllMocks());

describe('WorkflowList', () => {
  it('名前とサービス ID を一覧にする', () => {
    setup();

    expect(screen.getByText('社内QA')).toBeInTheDocument();
    expect(screen.getByText('assistant-1, assistant-2')).toBeInTheDocument();
  });

  it('ワークフローがないときは、その旨を出す', () => {
    setup([]);

    expect(screen.getByText('ワークフローがありません')).toBeInTheDocument();
  });

  it('選ぶと ID で通知し、開いているものを示す', async () => {
    const { onSelect } = setup(WORKFLOWS, 'a');

    await userEvent.click(screen.getByRole('button', { name: /^検索なし\s*plain$/ }));

    expect(onSelect).toHaveBeenCalledWith('b');
    expect(screen.getByRole('button', { name: /^社内QA\s*assistant-1/ })).toHaveAttribute('aria-current', 'true');
  });

  it('新規作成で、ID・名前・サービス ID を通知する', async () => {
    const { onCreate } = setup();

    await userEvent.click(screen.getByRole('button', { name: '＋ 新規' }));
    await userEvent.type(screen.getByLabelText('ID'), 'wf-new');
    await userEvent.type(screen.getByLabelText('名前'), '新しい');
    await userEvent.type(screen.getByLabelText('サービス ID'), 'svc-new');
    await userEvent.click(screen.getByRole('button', { name: '作成' }));

    expect(onCreate).toHaveBeenCalledWith('wf-new', '新しい', ['svc-new']);
    expect(screen.queryByRole('button', { name: '作成' })).not.toBeInTheDocument();
  });

  it('ID の形が不正だと、作成せずに理由を出す', async () => {
    const { onCreate } = setup();

    await userEvent.click(screen.getByRole('button', { name: '＋ 新規' }));
    await userEvent.type(screen.getByLabelText('ID'), 'Bad ID');
    await userEvent.type(screen.getByLabelText('名前'), 'x');
    await userEvent.type(screen.getByLabelText('サービス ID'), 'y');
    await userEvent.click(screen.getByRole('button', { name: '作成' }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('ID は英小文字');
  });

  it('名前かサービス ID が空だと、作成しない', async () => {
    const { onCreate } = setup();

    await userEvent.click(screen.getByRole('button', { name: '＋ 新規' }));
    await userEvent.type(screen.getByLabelText('ID'), 'wf-new');
    await userEvent.click(screen.getByRole('button', { name: '作成' }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('名前とサービス ID');
  });

  it('削除は、確認で許可したときだけ通知する', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { onDelete } = setup();
    const button = screen.getByRole('button', { name: '社内QAを削除' });

    await userEvent.click(button);
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(button);

    expect(confirm).toHaveBeenCalledTimes(2);
    expect(onDelete).toHaveBeenCalledWith('a');
  });
});
