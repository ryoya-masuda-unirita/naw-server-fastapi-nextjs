import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
import * as api from './api/client';
import { newGraph } from './editor/model';

vi.mock('./api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/client')>();
  return {
    ...actual,
    listWorkflows: vi.fn(),
    getWorkflow: vi.fn(),
    createWorkflow: vi.fn(),
    updateWorkflow: vi.fn(),
    deleteWorkflow: vi.fn(),
    validateWorkflow: vi.fn(),
    getPropertyCatalog: vi.fn(),
  };
});

const mocked = vi.mocked(api);
const SAVED = newGraph('wf-1', '社内QA', ['assistant-1']);

beforeEach(() => {
  mocked.listWorkflows.mockResolvedValue([
    { id: 'wf-1', name: '社内QA', serviceIds: ['assistant-1'] },
    { id: 'wf-2', name: '別', serviceIds: ['other'] },
  ]);
  mocked.getWorkflow.mockResolvedValue(structuredClone(SAVED));
  mocked.getPropertyCatalog.mockResolvedValue({ generativeAi: [], retrieval: [] });
  mocked.validateWorkflow.mockResolvedValue({ ok: true });
  mocked.updateWorkflow.mockImplementation((_id, graph) => Promise.resolve(graph));
  mocked.createWorkflow.mockImplementation((graph) => Promise.resolve(graph));
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

async function openFirst() {
  await userEvent.click(await screen.findByRole('button', { name: /^社内QA\s*assistant-1/ }));
  await screen.findByLabelText('名前');
}

describe('App', () => {
  it('起動すると一覧を出し、ワークフローを選ぶと開く', async () => {
    render(<App />);

    await openFirst();

    expect(mocked.getWorkflow).toHaveBeenCalledWith('wf-1');
    expect(screen.getByLabelText('名前')).toHaveValue('社内QA');
    expect(screen.getByText('assistant-1', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByText('● 未保存')).not.toBeInTheDocument();
  });

  it('名前を変えると未保存になり、保存で、検証してから更新する', async () => {
    render(<App />);
    await openFirst();

    await userEvent.type(screen.getByLabelText('名前'), '（改）');
    expect(screen.getByText('● 未保存')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    await screen.findByText('保存しました');
    expect(mocked.validateWorkflow).toHaveBeenCalledOnce();
    expect(mocked.updateWorkflow).toHaveBeenCalledWith(
      'wf-1',
      expect.objectContaining({ id: 'wf-1', name: '社内QA（改）' }),
    );
    expect(mocked.createWorkflow).not.toHaveBeenCalled();
    expect(screen.queryByText('● 未保存')).not.toBeInTheDocument();
  });

  it('Ctrl+S を続けて押しても、保存の要求は 1 回だけ送る', async () => {
    let finish: (graph: typeof SAVED) => void = () => {};
    mocked.updateWorkflow.mockImplementation(
      () => new Promise((resolve) => (finish = resolve as typeof finish)),
    );
    render(<App />);
    await openFirst();
    await userEvent.type(screen.getByLabelText('名前'), 'x');

    await userEvent.keyboard('{Control>}s{/Control}');
    await userEvent.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(mocked.updateWorkflow).toHaveBeenCalledTimes(1));
    finish({ ...SAVED, name: '社内QAx' });

    await screen.findByText('保存しました');
    expect(mocked.updateWorkflow).toHaveBeenCalledTimes(1);
  });

  it('版 2 のワークフローは開かず、対応していない理由を出す', async () => {
    mocked.getWorkflow.mockResolvedValue({ ...structuredClone(SAVED), version: 2 });
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /^社内QA\s*assistant-1/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('版 2 の形式です');
    expect(screen.queryByLabelText('名前')).not.toBeInTheDocument();
  });

  it('検証が失敗したら、サーバーの理由を出し、保存しない。編集内容は残る', async () => {
    mocked.validateWorkflow.mockRejectedValue(new api.ApiError(400, 'つなぎ方が不正です'));
    render(<App />);
    await openFirst();
    await userEvent.type(screen.getByLabelText('名前'), 'x');

    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('つなぎ方が不正です');
    expect(mocked.updateWorkflow).not.toHaveBeenCalled();
    expect(screen.getByLabelText('名前')).toHaveValue('社内QAx');
  });

  it('サービス ID の重複（409）の理由を出す', async () => {
    mocked.updateWorkflow.mockRejectedValue(new api.ApiError(409, 'サービス ID は使われています'));
    render(<App />);
    await openFirst();
    await userEvent.type(screen.getByLabelText('名前'), 'x');

    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('サービス ID は使われています');
  });

  it('検証ボタンで、保存せずに検証だけする', async () => {
    render(<App />);
    await openFirst();

    await userEvent.click(screen.getByRole('button', { name: '検証' }));

    await screen.findByText(/検証しました/);
    expect(mocked.updateWorkflow).not.toHaveBeenCalled();
  });

  it('新規作成は、保存したときに作成の API を呼ぶ', async () => {
    render(<App />);
    await screen.findByText('別');
    await userEvent.click(screen.getByRole('button', { name: '＋ 新規' }));
    await userEvent.type(screen.getByLabelText('ID'), 'wf-new');
    await userEvent.type(screen.getAllByLabelText('名前')[0], '新規');
    await userEvent.type(screen.getByLabelText('サービス ID'), 'svc-new');
    await userEvent.click(screen.getByRole('button', { name: '作成' }));

    expect(mocked.createWorkflow).not.toHaveBeenCalled();
    expect(await screen.findByText('● 未保存')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    await screen.findByText('保存しました');
    expect(mocked.createWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'wf-new', name: '新規', serviceIds: ['svc-new'] }),
    );
  });

  it('未保存のまま別のワークフローを選ぶと確認し、断れば移動しない', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<App />);
    await openFirst();
    await userEvent.type(screen.getByLabelText('名前'), 'x');

    await userEvent.click(screen.getByRole('button', { name: /^別\s*other/ }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(mocked.getWorkflow).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('名前')).toHaveValue('社内QAx');
  });

  it('削除すると、API を呼んで、開いていれば閉じる', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mocked.deleteWorkflow.mockResolvedValue(undefined);
    render(<App />);
    await openFirst();

    await userEvent.click(screen.getByRole('button', { name: '社内QAを削除' }));

    await waitFor(() => expect(mocked.deleteWorkflow).toHaveBeenCalledWith('wf-1'));
    await waitFor(() => expect(screen.queryByLabelText('名前')).not.toBeInTheDocument());
  });

  it('エミュレーターに接続できないとき、一覧の取得の失敗を出す', async () => {
    mocked.listWorkflows.mockRejectedValue(
      new api.ApiError(0, 'エミュレーターに接続できません'),
    );
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('エミュレーターに接続できません');
  });
});
