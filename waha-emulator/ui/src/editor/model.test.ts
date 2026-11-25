import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import type { GraphData } from '../api/types';
import {
  addNode,
  canAddNode,
  canConnect,
  fromFlow,
  insertRetrieval,
  isDirty,
  newGraph,
  normalize,
  toFlow,
  type FlowNode,
} from './model';

function withRetrieval(graph: GraphData): GraphData {
  return {
    ...graph,
    nodes: [
      ...graph.nodes,
      {
        id: 'retrieval',
        type: 'retrieval',
        name: '検索',
        position: { x: 100, y: 0 },
        properties: { VDB_TABLE_NAME: 'vectors' },
      },
    ],
  };
}

function flowOf(graph: GraphData): { nodes: FlowNode[]; edges: Edge[] } {
  return toFlow(graph);
}

describe('toFlow / fromFlow', () => {
  it('キャンバスを経由しても、定義の内容が変わらない', () => {
    const graph = normalize(newGraph('wf-1', '社内QA', ['svc']));
    const { nodes, edges } = flowOf(graph);

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
    const { nodes, edges } = flowOf(graph);
    nodes[0].position = { x: 10.4, y: 20.6 };

    expect(fromFlow(graph, nodes, edges).nodes[0].position).toEqual({ x: 10, y: 21 });
  });

  it('開始・終了ノードには properties を付けない', () => {
    const graph = newGraph('wf-1', 'x', ['svc']);
    const { nodes, edges } = flowOf(graph);
    const result = fromFlow(graph, nodes, edges);

    expect(result.nodes.find((n) => n.type === 'start')).not.toHaveProperty('properties');
    expect(result.nodes.find((n) => n.type === 'end')).not.toHaveProperty('properties');
  });

  it('生成AI の出力モードを持ち回る', () => {
    const graph = newGraph('wf-1', 'x', ['svc']);
    graph.nodes[1].outputType = 2;
    const { nodes, edges } = flowOf(graph);

    expect(fromFlow(graph, nodes, edges).nodes[1].outputType).toBe(2);
  });

  it('検索ノードがあるときは、生成AI の出力モードをサーバーへ送らない（送ると 400 になる）', () => {
    const graph = withRetrieval(newGraph('wf-1', 'x', ['svc']));
    graph.nodes[1].outputType = 2;
    const { nodes, edges } = flowOf(graph);

    const result = fromFlow(graph, nodes, edges);

    expect(result.nodes.find((n) => n.id === 'gen')).not.toHaveProperty('outputType');
  });

  it('開始・終了・生成AI は削除できず、検索だけ削除できる', () => {
    const { nodes } = flowOf(withRetrieval(newGraph('wf-1', 'x', ['svc'])));
    const deletable = Object.fromEntries(nodes.map((n) => [n.id, n.deletable]));

    expect(deletable).toEqual({ start: false, gen: false, end: false, retrieval: true });
  });
});

describe('newGraph', () => {
  it('開始 → 生成AI → 終了の鎖になる', () => {
    const graph = newGraph('wf-1', '名前', ['a', 'b']);

    expect(graph.version).toBe(1);
    expect(graph.serviceIds).toEqual(['a', 'b']);
    expect(graph.nodes.map((n) => n.type)).toEqual(['start', 'generative-ai', 'end']);
    expect(graph.edges).toEqual([
      { source: 'start', target: 'gen' },
      { source: 'gen', target: 'end' },
    ]);
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
      '位置',
      { ...base, nodes: base.nodes.map((n, i) => (i ? n : { ...n, position: { x: 99, y: 0 } })) },
    ],
    [
      'プロパティ',
      {
        ...base,
        nodes: base.nodes.map((n) =>
          n.type === 'generative-ai' ? { ...n, properties: { ...n.properties, MODEL_NAME: 'x' } } : n,
        ),
      },
    ],
  ])('%s が変わると true', (_label, changed) => {
    expect(isDirty(base, changed as GraphData)).toBe(true);
  });
});

describe('canAddNode / addNode', () => {
  const { nodes } = flowOf(newGraph('wf-1', 'x', ['svc']));

  it('検索ノードを足せる', () => {
    expect(canAddNode(nodes, 'retrieval')).toEqual({ ok: true });
  });

  it('検索ノードは 1 つまで', () => {
    const added = [...nodes, addNode(nodes, 'retrieval')];

    expect(canAddNode(added, 'retrieval')).toEqual({
      ok: false,
      reason: '検索ノードは 1 つまでです',
    });
  });

  it.each(['start', 'generative-ai', 'end'] as const)('%s は足せない', (type) => {
    expect(canAddNode(nodes, type).ok).toBe(false);
  });

  it('足した検索ノードは、削除でき、検索の初期プロパティを持つ', () => {
    const node = addNode(nodes, 'retrieval');

    expect(node.deletable).toBe(true);
    expect(node.data.properties.VDB_TABLE_NAME).toBe('vectors');
  });

  it('ノードの ID が既存と重ならない', () => {
    const first = addNode(nodes, 'retrieval');
    const second = addNode([...nodes, first], 'retrieval');

    expect(second.id).not.toBe(first.id);
  });
});

describe('canConnect', () => {
  const chain = flowOf(withRetrieval(newGraph('wf-1', 'x', ['svc'])));
  const nodes = chain.nodes;
  const noEdges: Edge[] = [];
  const edge = (source: string, target: string): Edge => ({
    id: `${source}->${target}`,
    source,
    target,
  });

  it.each([
    ['start', 'retrieval'],
    ['retrieval', 'gen'],
    ['gen', 'end'],
  ])('%s → %s は引ける', (source, target) => {
    expect(canConnect(nodes, noEdges, { source, target })).toEqual({ ok: true });
  });

  it('検索がなければ 開始 → 生成AI を引ける', () => {
    const plain = flowOf(newGraph('wf-1', 'x', ['svc'])).nodes;

    expect(canConnect(plain, noEdges, { source: 'start', target: 'gen' })).toEqual({
      ok: true,
    });
  });

  it('検索があるとき 開始 → 生成AI は引けない', () => {
    const result = canConnect(nodes, noEdges, { source: 'start', target: 'gen' });

    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.reason).toContain('開始 → 検索 → 生成AI');
  });

  it.each([
    ['自分自身', 'gen', 'gen', '自分自身'],
    ['終了から', 'end', 'gen', '終了ノードから'],
    ['開始へ', 'gen', 'start', '開始ノードへ'],
    ['逆向き', 'gen', 'retrieval', '順につないでください'],
    ['順序の飛ばし', 'retrieval', 'end', '順につないでください'],
    ['存在しないノード', 'gen', 'none', '存在しない'],
  ])('%s は拒否する', (_label, source, target, reason) => {
    const result = canConnect(nodes, noEdges, { source, target });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain(reason);
  });

  it('1 つのノードから 2 本目の線は出せない', () => {
    const result = canConnect(nodes, [edge('start', 'retrieval')], {
      source: 'start',
      target: 'gen',
    });

    expect(result.ok === false && result.reason).toContain('複数の線は出せません');
  });

  it('1 つのノードへ 2 本目の線は入れない', () => {
    const result = canConnect(nodes, [edge('retrieval', 'gen')], {
      source: 'start',
      target: 'gen',
    });

    expect(result.ok === false && result.reason).toContain('複数の線は入れません');
  });
});

describe('insertRetrieval', () => {
  const { nodes } = flowOf(newGraph('wf-1', 'x', ['svc']));

  it('検索ノードを生成AI の位置に入れ、生成AI と終了を右へずらす', () => {
    const result = insertRetrieval(nodes);
    const position = (id: string) => result.find((n) => n.id === id)?.position;

    expect(position('retrieval')).toEqual({ x: 280, y: 80 });
    expect(position('gen')).toEqual({ x: 560, y: 80 });
    expect(position('end')).toEqual({ x: 840, y: 80 });
    expect(position('start')).toEqual({ x: 0, y: 80 });
  });

  it('入れたあとの 4 つのノードが、同じ x に重ならない', () => {
    const xs = insertRetrieval(nodes).map((n) => n.position.x);

    expect(new Set(xs).size).toBe(4);
  });

  it('生成AI がなくても、検索ノードを足す', () => {
    const result = insertRetrieval(nodes.filter((n) => n.id !== 'gen'));

    expect(result.map((n) => n.id)).toContain('retrieval');
  });
});
