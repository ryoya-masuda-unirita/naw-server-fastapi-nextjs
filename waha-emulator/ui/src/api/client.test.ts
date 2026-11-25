import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  CONNECTION_ERROR_MESSAGE,
  createWorkflow,
  deleteWorkflow,
  getPropertyCatalog,
  getWorkflow,
  listWorkflows,
  updateWorkflow,
  validateWorkflow,
} from './client';
import { newGraph } from '../editor/model';

function respond(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('管理用 API の呼び出し', () => {
  it('一覧・取得・候補は GET で、ID は URL エンコードして呼ぶ', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(respond(200, [])));

    await listWorkflows();
    await getWorkflow('a b');
    await getPropertyCatalog();

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/admin/workflows',
      '/admin/workflows/a%20b',
      '/admin/property-catalog',
    ]);
  });

  it('作成・更新・検証は、JSON を本文にして送る', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(respond(200, { ok: true })));
    const graph = newGraph('wf-1', '名前', ['svc']);

    await createWorkflow(graph);
    await updateWorkflow('wf-1', graph);
    await validateWorkflow(graph);

    const calls = fetchMock.mock.calls;
    expect(calls.map((c) => [c[0], c[1].method])).toEqual([
      ['/admin/workflows', 'POST'],
      ['/admin/workflows/wf-1', 'PUT'],
      ['/admin/workflows/validate', 'POST'],
    ]);
    expect(JSON.parse(calls[0][1].body)).toEqual(graph);
    expect(calls[0][1].headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('削除は 204 で、本文なしで終わる', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(deleteWorkflow('wf-1')).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][1]).toEqual({ method: 'DELETE' });
  });
});

describe('失敗', () => {
  it.each([400, 404, 409])('%i で、サーバーの理由を持つ ApiError にする', async (status) => {
    fetchMock.mockResolvedValue(respond(status, { detail: '理由です' }));

    await expect(getWorkflow('x')).rejects.toMatchObject({
      name: 'ApiError',
      status,
      message: '理由です',
    });
  });

  it('本文が JSON でないエラーは、ステータスで伝える', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));

    await expect(listWorkflows()).rejects.toThrow('HTTP 500');
  });

  it('通信に失敗したら、接続できないことを伝える', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await listWorkflows().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, message: CONNECTION_ERROR_MESSAGE });
  });
});
