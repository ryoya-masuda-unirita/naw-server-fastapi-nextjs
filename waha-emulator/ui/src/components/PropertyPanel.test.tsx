import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

function nodeOf(id: string): FlowNode {
  const node = toFlow(newGraph('wf-1', 'x', ['svc'])).nodes.find((n) => n.id === id);
  if (!node) throw new Error(id);
  return node;
}

function setup(node: FlowNode | null, hasRetrieval = false) {
  const onChange = vi.fn();
  render(
    <PropertyPanel node={node} catalog={CATALOG} hasRetrieval={hasRetrieval} onChange={onChange} />,
  );
  return onChange;
}

describe('PropertyPanel', () => {
  it('ノードを選んでいないときは、案内を出す', () => {
    setup(null);

    expect(screen.getByText(/ノードを選ぶと/)).toBeInTheDocument();
  });

  it('名前を変えると、その内容で通知する', async () => {
    const onChange = setup(nodeOf('gen'));

    await userEvent.type(screen.getByLabelText('名前'), '!');

    expect(onChange).toHaveBeenLastCalledWith('gen', { label: '生成AI!' });
  });

  it('開始ノードにはプロパティ欄がない', () => {
    setup(nodeOf('start'));

    expect(screen.queryByRole('region', { name: 'プロパティ一覧' })).not.toBeInTheDocument();
  });

  it('候補から選んでプロパティを足せる。入っている名前は候補に出ない', async () => {
    const onChange = setup(nodeOf('gen'));
    const select = screen.getByLabelText('追加するプロパティ');

    expect(screen.queryByRole('option', { name: 'API_KEY' })).not.toBeInTheDocument();
    await userEvent.selectOptions(select, 'TEMPERATURE');
    await userEvent.click(screen.getByRole('button', { name: '追加' }));

    expect(onChange).toHaveBeenCalledWith('gen', {
      properties: expect.objectContaining({ TEMPERATURE: '' }),
    });
  });

  it('候補にない名前は入れられない（選択肢が候補だけ）', () => {
    setup(nodeOf('gen'));

    const options = screen.getAllByRole('option').map((o) => o.textContent);

    expect(options).toContain('TEMPERATURE');
    expect(options).not.toContain('NOPE');
  });

  it('値を変えると、そのプロパティだけ更新して通知する', async () => {
    const onChange = setup(nodeOf('gen'));

    await userEvent.type(screen.getByLabelText('MODEL_NAMEの値'), '2');

    expect(onChange).toHaveBeenLastCalledWith('gen', {
      properties: expect.objectContaining({ MODEL_NAME: 'echo2' }),
    });
  });

  it('プロパティを削除できる', async () => {
    const onChange = setup(nodeOf('gen'));

    await userEvent.click(screen.getByRole('button', { name: 'MODEL_NAMEを削除' }));

    const properties = onChange.mock.calls[0][1].properties;
    expect(properties).not.toHaveProperty('MODEL_NAME');
    expect(properties).toHaveProperty('URL');
  });

  it('API キーの入力欄は、文字を隠す', () => {
    setup(nodeOf('gen'));

    expect(screen.getByLabelText('API_KEYの値')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('MODEL_NAMEの値')).toHaveAttribute('type', 'text');
  });

  it('伏せた値は、保存済みの値を使うと表示し、入力欄を出さない', () => {
    const node = nodeOf('gen');
    node.data.properties = { ...node.data.properties, API_KEY: MASK };
    setup(node);

    expect(screen.getByText('保存済みの値を使います')).toBeInTheDocument();
    expect(screen.queryByLabelText('API_KEYの値')).not.toBeInTheDocument();
  });

  it('「入れ直す」で、値を空にして、入力欄を出す', async () => {
    const node = nodeOf('gen');
    node.data.properties = { ...node.data.properties, API_KEY: MASK };
    const onChange = setup(node);

    await userEvent.click(screen.getByRole('button', { name: '入れ直す' }));

    expect(onChange).toHaveBeenCalledWith('gen', {
      properties: expect.objectContaining({ API_KEY: '' }),
    });
  });

  it('検索ノードがあるとき、生成AI の出力モードは RAG 固定で選べない', () => {
    setup(nodeOf('gen'), true);

    const select = screen.getByLabelText(/出力モード/);
    expect(select).toBeDisabled();
    expect(select).toHaveValue('1');
  });

  it('検索ノードがなければ、出力モードの選択肢に RAG（1）を出さない', () => {
    setup(nodeOf('gen'), false);

    const values = screen.getAllByRole('option', { name: /^\d:/ }).map((o) => o.getAttribute('value'));

    expect(values).toEqual(['0', '2']);
  });

  it('検索ノードがあるときは、RAG（1）だけを固定で出す', () => {
    setup(nodeOf('gen'), true);

    const values = screen.getAllByRole('option', { name: /^\d:/ }).map((o) => o.getAttribute('value'));

    expect(values).toEqual(['1']);
  });

  it('検索ノードがなければ、出力モードを 0 と 2 から選べる', async () => {
    const onChange = setup(nodeOf('gen'), false);

    await userEvent.selectOptions(screen.getByLabelText(/出力モード/), '2');

    expect(onChange).toHaveBeenCalledWith('gen', { outputType: 2 });
  });

  it('検索ノードは、検索の候補でプロパティを編集する', () => {
    const retrieval = addNode(toFlow(newGraph('wf-1', 'x', ['svc'])).nodes, 'retrieval');
    setup(retrieval);

    expect(screen.getByLabelText('VDB_TABLE_NAMEの値')).toHaveValue('vectors');
    expect(screen.queryByLabelText(/出力モード/)).not.toBeInTheDocument();
  });
});
