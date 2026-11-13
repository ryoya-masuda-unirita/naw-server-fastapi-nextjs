import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { echarts } from '@/lib/utils/echarts-setup';
import { MarkdownView } from './markdown-view';
import { renderMarkdownToHtml, trimIndentation } from './markdown-render';

const mermaidInitialize = vi.fn();
const mermaidRun = vi.fn(() => Promise.resolve());
vi.mock('mermaid', () => ({ default: { initialize: mermaidInitialize, run: mermaidRun } }));

// ECharts は実描画せず、init 呼び出しとライフサイクルだけ確認する
const setOption = vi.fn();
const dispose = vi.fn();
const resize = vi.fn();
const init = vi.fn(() => ({ setOption, dispose, resize }));

const FIXTURE_LINE_BLOCK = [
  '```chart:line',
  JSON.stringify({ version: 1, categories: ['A', 'B'], series: [{ name: 's', values: [1, 2] }] }),
  '```',
].join('\n');

const FIXTURE_INVALID_BLOCK = '```chart:line\n{ not valid json\n```';

describe('renderMarkdownToHtml', () => {
  test('見出し・強調・GFM の表を HTML にすること', () => {
    const html = renderMarkdownToHtml('# 題\n\n**太字**\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<h1>題</h1>');
    expect(html).toContain('<strong>太字</strong>');
    expect(html).toContain('<table>');
  });

  test('単独の改行は <br> にならないこと（breaks 無効）', () => {
    expect(renderMarkdownToHtml('a\nb')).not.toContain('<br');
  });

  test('コードブロックに language-xxx のクラスが付くこと', () => {
    expect(renderMarkdownToHtml(FIXTURE_LINE_BLOCK)).toContain('class="language-chart:line"');
  });

  test('mermaid 指定のときだけ mermaid ブロックを div.mermaid にすること', () => {
    const source = '```mermaid\ngraph TD; A-->B;\n```';
    expect(renderMarkdownToHtml(source, { mermaid: true })).toContain('<div class="mermaid">');
    expect(renderMarkdownToHtml(source)).toContain('class="language-mermaid"');
  });

  test('スクリプトやイベントハンドラーを取り除くこと', () => {
    const html = renderMarkdownToHtml('<img src=x onerror="alert(1)"><script>alert(2)</script>');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<script');
  });

  test('null や空文字は空の HTML になること', () => {
    expect(renderMarkdownToHtml(null)).toBe('');
    expect(renderMarkdownToHtml('')).toBe('');
  });
});

describe('trimIndentation', () => {
  test('先頭行のインデントを全行から取り除くこと', () => {
    expect(trimIndentation('    a\n      b\n    c')).toBe('a\n  b\nc');
  });

  test('インデントが無ければそのまま返すこと', () => {
    expect(trimIndentation('a\n  b')).toBe('a\n  b');
  });
});

describe('MarkdownView', () => {
  let rafCallbacks: (FrameRequestCallback | undefined)[];

  function flushRaf() {
    const callbacks = rafCallbacks;
    rafCallbacks = [];
    callbacks.forEach((callback) => callback?.(0));
  }

  beforeEach(() => {
    vi.spyOn(echarts, 'init').mockImplementation(init as unknown as typeof echarts.init);
    init.mockClear();
    setOption.mockClear();
    dispose.mockClear();
    rafCallbacks = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      rafCallbacks[id - 1] = undefined;
    });
    // jsdom には ResizeObserver が無い
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('Markdown を描画すること', () => {
    const { container } = render(<MarkdownView data={'# 見出し'} className="chat-message-bubble" />);
    expect(container.querySelector('h1')?.textContent).toBe('見出し');
    expect(container.firstElementChild).toHaveClass('chat-message-bubble');
  });

  test('有効なチャートのコードブロックを ECharts のコンテナに差し替えること', () => {
    const { container } = render(<MarkdownView data={FIXTURE_LINE_BLOCK} />);
    flushRaf();

    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(expect.any(HTMLElement), undefined, { renderer: 'svg' });
    expect(setOption).toHaveBeenCalledTimes(1);
    expect(container.querySelector('pre')).toBeNull();
    expect(container.querySelector('.chart-block')).not.toBeNull();
  });

  test('不正な JSON のチャートブロックはコードブロックのまま残すこと', () => {
    const { container } = render(<MarkdownView data={FIXTURE_INVALID_BLOCK} />);
    flushRaf();

    expect(init).not.toHaveBeenCalled();
    expect(container.querySelector('pre')).not.toBeNull();
  });

  test('本文が更新されたら前のチャートを破棄して描き直すこと', () => {
    const { rerender } = render(<MarkdownView data={FIXTURE_LINE_BLOCK} />);
    flushRaf();
    expect(init).toHaveBeenCalledTimes(1);

    rerender(<MarkdownView data={`${FIXTURE_LINE_BLOCK}\n\n続き`} />);
    flushRaf();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledTimes(2);
  });

  test('アンマウント時にチャートを破棄すること', () => {
    const { unmount } = render(<MarkdownView data={FIXTURE_LINE_BLOCK} />);
    flushRaf();
    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  test('chartBlocks を false にするとチャートにしないこと', () => {
    const { container } = render(<MarkdownView data={FIXTURE_LINE_BLOCK} chartBlocks={false} />);
    flushRaf();
    expect(init).not.toHaveBeenCalled();
    expect(container.querySelector('pre')).not.toBeNull();
  });

  test('mermaid のブロックを strict で初期化して描画すること', async () => {
    mermaidInitialize.mockClear();
    mermaidRun.mockClear();
    const { container } = render(<MarkdownView data={'```mermaid\ngraph TD; A-->B;\n```'} />);

    await waitFor(() => expect(mermaidRun).toHaveBeenCalledTimes(1));
    expect(mermaidInitialize).toHaveBeenCalledWith({ startOnLoad: false, securityLevel: 'strict' });
    expect(mermaidRun).toHaveBeenCalledWith({ nodes: [container.querySelector('.mermaid')] });
  });

  test('mermaid の描画に失敗しても画面は壊れないこと', async () => {
    mermaidRun.mockClear();
    mermaidRun.mockRejectedValueOnce(new Error('syntax'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { container } = render(<MarkdownView data={'```mermaid\ngraph TD; A-->\n```'} />);

    await waitFor(() => expect(mermaidRun).toHaveBeenCalledTimes(1));
    expect(container.querySelector('.mermaid')).not.toBeNull();
  });

  test('mermaid を false にすると mermaid として描画しないこと', async () => {
    mermaidRun.mockClear();
    render(<MarkdownView data={'```mermaid\ngraph TD; A-->B;\n```'} mermaid={false} />);
    await Promise.resolve();
    expect(mermaidRun).not.toHaveBeenCalled();
  });
});
