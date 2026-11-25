import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import type { GraphData, LegacyGraphData } from '../api/types';
import {
  addNode,
  availableVariables,
  canAddNode,
  canConnect,
  convertLegacy,
  fromFlow,
  insertVariable,
  isDirty,
  newGraph,
  normalize,
  toFlow,
  upstreamRetrievalNodes,
  type FlowNode,
} from './model';

const edge = (source: string, target: string, sourceHandle?: string): Edge => ({
  id: `${source}${sourceHandle ? `:${sourceHandle}` : ''}->${target}`,
  source,
  target,
  sourceHandle: sourceHandle ?? null,
});

function node(id: string, type: string): FlowNode {
  const added = addNode([], type as never);
  return { ...added, id };
}

describe('toFlow / fromFlow', () => {
  it('キャンバスを経由しても、定義の内容が変わらない', () => {
    const graph = normalize(newGraph('wf-1', '社内QA', ['svc']));
    const { nodes, edges } = toFlow(graph);

    expect(fromFlow(graph, nodes, edges)).toEqual(graph);
  });

  it('ノードの名前がないときは ID を名前にする', () => {
    const graph: GraphData = {
      ...newGraph('wf-1', 'x', ['svc']),
      nodes: [{ id: 'start', type: 'start', position: { x: 0, y: 0 } }],
      edges: [],
    };

    expect(toFlow(graph).nodes[0].data.label).toBe('start');
  });

  it('動かした位置の小数を、整数にそろえて定義に戻す', () => {
    const graph = newGraph('wf-1', 'x', ['svc']);
    const { nodes, edges } = toFlow(graph);
    nodes[0].position = { x: 10.4, y: 20.6 };

    expect(fromFlow(graph, nodes, edges).nodes[0].position).toEqual({ x: 10, y: 21 });
  });

  it('検索を使う生成AI は、出力モードを送らない（送ると 400 になる）', () => {
    const graph = newGraph('wf-1', 'x', ['svc']);
    const { nodes, edges } = toFlow(graph);
    const llm = nodes.find((n) => n.id === 'answer') as FlowNode;
    llm.data.config = { ...llm.data.config, retrieval: 'search', outputType: 2 };

    const result = fromFlow(graph, nodes, edges).nodes.find((n) => n.id === 'answer');

    expect(result?.config).toHaveProperty('retrieval', 'search');
    expect(result?.config).not.toHaveProperty('outputType');
  });

  it('条件分岐の「空」では、値を送らない', () => {
    const graph = newGraph('wf-1', 'x', ['svc']);
    const { nodes, edges } = toFlow(graph);
    const branch = node('judge', 'branch');
    branch.data.config = { variable: 'question', operator: 'empty', value: 'x' };

    const result = fromFlow(graph, [...nodes, branch], edges).nodes.find((n) => n.id === 'judge');

    expect(result?.config).toEqual({ variable: 'question', operator: 'empty' });
  });

  it('分岐の線は、出口（sourceHandle）を持ち回り、「はい」「いいえ」の名前が付く', () => {
    const graph = newGraph('wf-1', 'x', ['svc']);
    graph.edges = [{ source: 'start', target: 'answer', sourceHandle: 'true' }];

    const flow = toFlow(graph);

    expect(flow.edges[0].label).toBe('はい');
    expect(fromFlow(graph, flow.nodes, flow.edges).edges[0].sourceHandle).toBe('true');
  });

  it('開始ノードだけ削除できない', () => {
    const { nodes } = toFlow(newGraph('wf-1', 'x', ['svc']));

    expect(Object.fromEntries(nodes.map((n) => [n.id, n.deletable]))).toEqual({
      start: false,
      answer: true,
      end: true,
    });
  });
});

describe('newGraph', () => {
  it('開始 → 生成AI → 終了の鎖になる（版 2）', () => {
    const graph = newGraph('wf-1', '名前', ['a', 'b']);

    expect(graph.version).toBe(2);
    expect(graph.serviceIds).toEqual(['a', 'b']);
    expect(graph.nodes.map((n) => n.type)).toEqual(['start', 'llm', 'end']);
    expect(graph.nodes[2].config).toEqual({ output: '{{answer.text}}' });
    expect(graph.edges).toEqual([
      { source: 'start', target: 'answer' },
      { source: 'answer', target: 'end' },
    ]);
  });
});

describe('convertLegacy', () => {
  const legacy: LegacyGraphData = {
    version: 1,
    id: 'wf-1',
    name: '旧',
    serviceIds: ['svc'],
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 } },
      { id: 'gen', type: 'generative-ai', position: { x: 1, y: 0 }, outputType: 2, properties: { A: 'b' } },
      { id: 'end', type: 'end', position: { x: 2, y: 0 } },
    ],
    edges: [
      { source: 'start', target: 'gen' },
      { source: 'gen', target: 'end' },
    ],
  };

  it('生成AI を llm にし、終了の出力を、その回答にする', () => {
    const graph = convertLegacy(legacy);

    expect(graph.version).toBe(2);
    expect(graph.nodes[1]).toMatchObject({
      type: 'llm',
      config: { prompt: '{{question}}', inheritContext: true, outputType: 2, properties: { A: 'b' } },
    });
    expect(graph.nodes[2].config).toEqual({ output: '{{gen.text}}' });
  });

  it('検索ノードがあれば、llm の retrieval に結び、出力モードは持たない', () => {
    const withRetrieval: LegacyGraphData = {
      ...legacy,
      nodes: [
        ...legacy.nodes,
        { id: 'ret', type: 'retrieval', position: { x: 1, y: 1 }, properties: { T: 'v' } },
      ],
    };

    const graph = convertLegacy(withRetrieval);

    expect(graph.nodes[1].config).toMatchObject({ retrieval: 'ret' });
    expect(graph.nodes[1].config).not.toHaveProperty('outputType');
    expect(graph.nodes[3]).toMatchObject({ type: 'retrieval', config: { query: '{{question}}' } });
  });
});

describe('isDirty', () => {
  const base = normalize(newGraph('wf-1', '名前', ['svc']));

  it('変更がなければ false', () => {
    expect(isDirty(base, normalize(base))).toBe(false);
  });

  it('ノードの並び順が違うだけなら false', () => {
    expect(isDirty(base, { ...base, nodes: [...base.nodes].reverse() })).toBe(false);
  });

  it.each([
    ['名前', { ...base, name: '別' }],
    ['サービス ID', { ...base, serviceIds: ['svc', 'x'] }],
    ['線', { ...base, edges: [] }],
    [
      '設定',
      {
        ...base,
        nodes: base.nodes.map((n) =>
          n.type === 'llm' ? { ...n, config: { ...n.config, prompt: '変えた' } } : n,
        ),
      },
    ],
  ])('%s が変わると true', (_label, changed) => {
    expect(isDirty(base, changed as GraphData)).toBe(true);
  });
});

describe('canAddNode / addNode', () => {
  it.each(['llm', 'retrieval', 'branch', 'template', 'end'] as const)('%s は足せる', (type) => {
    expect(canAddNode(type)).toEqual({ ok: true });
  });

  it('開始は足せない', () => {
    expect(canAddNode('start').ok).toBe(false);
  });

  it('同じ種類を足しても、ID が重ならない', () => {
    const first = addNode([], 'llm');
    const second = addNode([first], 'llm');

    expect(first.id).toBe('llm');
    expect(second.id).toBe('llm-2');
  });

  it('足した検索ノードは、検索の初期設定を持つ', () => {
    const added = addNode([], 'retrieval');

    expect(added.data.config.query).toBe('{{question}}');
    expect(added.data.config.properties?.VDB_TABLE_NAME).toBe('vectors');
  });
});

describe('canConnect', () => {
  const nodes = ['start', 'a', 'b', 'judge', 'end'].map((id) =>
    node(id, id === 'start' ? 'end' : id === 'judge' ? 'branch' : id === 'end' ? 'end' : 'llm'),
  );
  nodes[0].data.nodeType = 'start';

  it('普通の線は引ける', () => {
    expect(canConnect(nodes, [], { source: 'start', target: 'a' })).toEqual({ ok: true });
  });

  it.each([
    ['自分自身', 'a', 'a', '自分自身'],
    ['終了から', 'end', 'a', '終了ノードから'],
    ['開始へ', 'a', 'start', '開始ノードへ'],
    ['存在しないノード', 'a', 'none', '存在しない'],
  ])('%s は拒否する', (_label, source, target, reason) => {
    const result = canConnect(nodes, [], { source, target });

    expect(result.ok === false && result.reason).toContain(reason);
  });

  it('合流（1 つのノードへ 2 本）は拒否する', () => {
    const result = canConnect(nodes, [edge('start', 'b')], { source: 'a', target: 'b' });

    expect(result.ok === false && result.reason).toContain('複数の線は入れません');
  });

  it('普通のノードから 2 本目は拒否する', () => {
    const result = canConnect(nodes, [edge('a', 'b')], { source: 'a', target: 'end' });

    expect(result.ok === false && result.reason).toContain('複数の線は出せません');
  });

  it('輪（ループ）になる線は拒否する', () => {
    const result = canConnect(nodes, [edge('a', 'b')], { source: 'b', target: 'a' });

    expect(result.ok === false && result.reason).toContain('ループ');
  });

  it('条件分岐は、出口を選ばない線を拒否し、「はい」「いいえ」を 1 本ずつ引ける', () => {
    expect(canConnect(nodes, [], { source: 'judge', target: 'a' }).ok).toBe(false);
    expect(canConnect(nodes, [], { source: 'judge', target: 'a', sourceHandle: 'true' }).ok).toBe(true);
    const used = [edge('judge', 'a', 'true')];

    expect(canConnect(nodes, used, { source: 'judge', target: 'b', sourceHandle: 'true' }).ok).toBe(false);
    expect(canConnect(nodes, used, { source: 'judge', target: 'b', sourceHandle: 'false' }).ok).toBe(true);
  });

  it('条件分岐ではないノードに、出口は指定できない', () => {
    const result = canConnect(nodes, [], { source: 'a', target: 'b', sourceHandle: 'true' });

    expect(result.ok).toBe(false);
  });
});

describe('変数', () => {
  const nodes = [node('start', 'end'), node('search', 'retrieval'), node('answer', 'llm'), node('later', 'llm')];
  const edges = [edge('start', 'search'), edge('search', 'answer'), edge('answer', 'later')];

  it('前のノードの出力だけを使える。自分と後ろのノードは出ない', () => {
    const tokens = availableVariables(nodes, edges, 'answer').map((v) => v.token);

    expect(tokens).toEqual(['question', 'history', 'search.contexts_text']);
  });

  it('後ろのノードからは、前の生成AI の出力も使える', () => {
    const tokens = availableVariables(nodes, edges, 'later').map((v) => v.token);

    expect(tokens).toContain('answer.text');
  });

  it('引用資料にできる検索ノードは、前にあるものだけ', () => {
    expect(upstreamRetrievalNodes(nodes, edges, 'answer').map((n) => n.id)).toEqual(['search']);
    expect(upstreamRetrievalNodes(nodes, edges, 'search')).toEqual([]);
  });

  it('カーソルの位置（選択範囲）に、変数を差し込む', () => {
    expect(insertVariable('abXXcd', 2, 4, 'question')).toEqual({
      value: 'ab{{question}}cd',
      cursor: 14,
    });
  });
});
