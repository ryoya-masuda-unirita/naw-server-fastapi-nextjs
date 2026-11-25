import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Edge } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { MASK, type PropertyCatalog } from '../api/types';
import { addNode, newGraph, toFlow, type FlowNode } from '../editor/model';
import { PropertyPanel } from './PropertyPanel';

const CATALOG: PropertyCatalog = {
  generativeAi: [
    { name: 'API_KEY', secret: true },
    { name: 'MODEL_NAME', secret: false },
    { name: 'TEMPERATURE', secret: false },
  ],
  retrieval: [{ name: 'VDB_TABLE_NAME', secret: false }],
};

function base() {
  return toFlow(newGraph('wf-1', 'x', ['svc']));
}

function setup(
  nodeId: string | null,
  options: { nodes?: FlowNode[]; edges?: Edge[]; mutate?: (n: FlowNode) => void } = {},
) {
  const flow = base();
  const nodes = options.nodes ?? flow.nodes;
  const edges = options.edges ?? flow.edges;
  const node = nodeId ? (nodes.find((n) => n.id === nodeId) ?? null) : null;
  if (node) options.mutate?.(node);
  const onLabelChange = vi.fn();
  const onConfigChange = vi.fn();
  render(
    <PropertyPanel
      node={node}
      nodes={nodes}
      edges={edges}
      catalog={CATALOG}
      onLabelChange={onLabelChange}
      onConfigChange={onConfigChange}
    />,
  );
  return { onLabelChange, onConfigChange };
}

/** 開始 → 検索 → 生成AI(answer) → 条件分岐 → 終了 の流れ。 */
function ragFlow() {
  const { nodes } = base();
  const search = addNode(nodes, 'retrieval');
  const branch = addNode(nodes, 'branch');
  const all = [...nodes, search, branch];
  const edges: Edge[] = [
    { id: 'a', source: 'start', target: search.id },
    { id: 'b', source: search.id, target: 'answer' },
    { id: 'c', source: 'answer', target: branch.id },
  ];
  return { nodes: all, edges, search, branch };
}

describe('PropertyPanel', () => {
  it('ノードを選んでいないときは、案内を出す', () => {
    setup(null);

    expect(screen.getByText(/ノードを選ぶと/)).toBeInTheDocument();
  });

  it('名前を変えると、その内容で通知する', async () => {
    const { onLabelChange } = setup('answer');

    await userEvent.type(screen.getByLabelText('名前'), '!');

    expect(onLabelChange).toHaveBeenLastCalledWith('answer', '生成AI!');
  });

  it('開始ノードには、設定欄がない', () => {
    setup('start');

    expect(screen.queryByRole('region', { name: 'プロパティ一覧' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('プロンプト')).not.toBeInTheDocument();
  });

  it('生成AI のプロンプトを変えると、通知する', async () => {
    const { onConfigChange } = setup('answer', { mutate: (n) => (n.data.config.prompt = '') });

    await userEvent.type(screen.getByLabelText('プロンプト'), 'a');

    expect(onConfigChange).toHaveBeenLastCalledWith('answer', { prompt: 'a' });
  });

  it('使える変数を選ぶと、プロンプトに差し込む', async () => {
    const { onConfigChange } = setup('answer', { mutate: (n) => (n.data.config.prompt = '質問: ') });

    await userEvent.selectOptions(screen.getByLabelText('変数を挿入'), 'question');

    const { prompt } = onConfigChange.mock.calls[0][1] as { prompt: string };
    expect(prompt).toContain('{{question}}');
    expect(prompt).toContain('質問: ');
  });

  it('候補から選んでプロパティを足せる。入っている名前は候補に出ない', async () => {
    const { onConfigChange } = setup('answer');

    expect(screen.queryByRole('option', { name: 'API_KEY' })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('追加するプロパティ'), 'TEMPERATURE');
    await userEvent.click(screen.getByRole('button', { name: '追加' }));

    expect(onConfigChange).toHaveBeenCalledWith('answer', {
      properties: expect.objectContaining({ TEMPERATURE: '' }),
    });
  });

  it('値を変えると、そのプロパティだけ更新する', async () => {
    const { onConfigChange } = setup('answer');

    await userEvent.type(screen.getByLabelText('MODEL_NAMEの値'), '2');

    expect(onConfigChange).toHaveBeenLastCalledWith('answer', {
      properties: expect.objectContaining({ MODEL_NAME: 'echo2' }),
    });
  });

  it('プロパティを削除できる', async () => {
    const { onConfigChange } = setup('answer');

    await userEvent.click(screen.getByRole('button', { name: 'MODEL_NAMEを削除' }));

    const properties = onConfigChange.mock.calls[0][1].properties;
    expect(properties).not.toHaveProperty('MODEL_NAME');
    expect(properties).toHaveProperty('URL');
  });

  it('API キーの入力欄は、文字を隠す', () => {
    setup('answer');

    expect(screen.getByLabelText('API_KEYの値')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('MODEL_NAMEの値')).toHaveAttribute('type', 'text');
  });

  it('伏せた値は、保存済みの値を使うと表示し、「入れ直す」で空にする', async () => {
    const { onConfigChange } = setup('answer', {
      mutate: (n) => (n.data.config.properties = { ...n.data.config.properties, API_KEY: MASK }),
    });

    expect(screen.getByText('保存済みの値を使います')).toBeInTheDocument();
    expect(screen.queryByLabelText('API_KEYの値')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '入れ直す' }));

    expect(onConfigChange).toHaveBeenCalledWith('answer', {
      properties: expect.objectContaining({ API_KEY: '' }),
    });
  });

  it('検索を使わない生成AI は、出力モードを 0 と 2 から選べる', async () => {
    const { onConfigChange } = setup('answer');
    const values = screen.getAllByRole('option', { name: /^\d:/ }).map((o) => o.getAttribute('value'));

    await userEvent.selectOptions(screen.getByLabelText(/出力モード/), '2');

    expect(values).toEqual(['0', '2']);
    expect(onConfigChange).toHaveBeenCalledWith('answer', { outputType: 2 });
  });

  it('前に検索ノードがあれば選べる。選ぶと、出力モードは RAG 固定で選べない', async () => {
    const { nodes, edges, search } = ragFlow();
    const { onConfigChange } = setup('answer', { nodes, edges });

    await userEvent.selectOptions(screen.getByLabelText(/引用資料に使う検索/), search.id);

    expect(onConfigChange).toHaveBeenCalledWith('answer', { retrieval: search.id });
  });

  it('検索を結んだ生成AI は、出力モードが RAG（1）で固定される', () => {
    const { nodes, edges, search } = ragFlow();
    setup('answer', {
      nodes,
      edges,
      mutate: (n) => (n.data.config.retrieval = search.id),
    });

    const select = screen.getByLabelText(/出力モード/);
    expect(select).toBeDisabled();
    expect(select).toHaveValue('1');
  });

  it('検索ノードは、検索の候補でプロパティを編集し、検索語を持つ', () => {
    const { nodes, edges, search } = ragFlow();
    setup(search.id, { nodes, edges });

    expect(screen.getByLabelText('検索語')).toHaveValue('{{question}}');
    expect(screen.getByLabelText('VDB_TABLE_NAMEの値')).toHaveValue('vectors');
    expect(screen.queryByLabelText(/出力モード/)).not.toBeInTheDocument();
  });

  it('条件分岐は、前の生成AI の出力を調べる変数に選べる', async () => {
    const { nodes, edges, branch } = ragFlow();
    const { onConfigChange } = setup(branch.id, { nodes, edges });

    await userEvent.selectOptions(screen.getByLabelText('調べる変数'), 'answer.text');
    await userEvent.selectOptions(screen.getByLabelText('条件'), 'equals');

    expect(onConfigChange).toHaveBeenCalledWith(branch.id, { variable: 'answer.text' });
    expect(onConfigChange).toHaveBeenCalledWith(branch.id, { operator: 'equals' });
  });

  it('条件が「空」のときは、値の入力欄を出さない', () => {
    const { nodes, edges, branch } = ragFlow();
    setup(branch.id, {
      nodes,
      edges,
      mutate: (n) => (n.data.config.operator = 'empty'),
    });

    expect(screen.queryByLabelText(/^値/)).not.toBeInTheDocument();
  });

  it('終了ノードは、回答にする文字列を編集できる', async () => {
    const { onConfigChange } = setup('end', { mutate: (n) => (n.data.config.output = '') });

    await userEvent.type(screen.getByLabelText('回答にする文字列'), 'x');

    expect(onConfigChange).toHaveBeenLastCalledWith('end', { output: 'x' });
  });
});
