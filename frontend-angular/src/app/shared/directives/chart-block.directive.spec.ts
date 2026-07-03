import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MarkdownComponent, provideMarkdown } from 'ngx-markdown';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { echarts } from '@shared/utils/echarts.setup';
import { ChartBlockDirective } from './chart-block.directive';

// ECharts は実描画せず、init 呼び出しとライフサイクルのみ検証する
const setOption = vi.fn();
const dispose = vi.fn();
const resize = vi.fn();
const init = vi.fn(() => ({ setOption, dispose, resize }));

const LINE_BLOCK = `<pre><code class="language-chart:line">${JSON.stringify({
  version: 1,
  categories: ['A', 'B'],
  series: [{ name: 's', values: [1, 2] }],
})}</code></pre>`;

const INVALID_BLOCK = `<pre><code class="language-chart:line">{ not valid json</code></pre>`;

@Component({
  standalone: true,
  imports: [ChartBlockDirective, MarkdownComponent],
  template: `<markdown appChartBlocks [data]="data()"></markdown>`,
})
class HostComponent {
  readonly data = signal('');
}

describe('ChartBlockDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let markdownEl: HTMLElement;
  let markdown: MarkdownComponent;
  // ディレクティブは requestAnimationFrame で再描画を集約するため、
  // テストでは登録されたコールバックを手動でフラッシュする
  let rafCallbacks: (FrameRequestCallback | undefined)[];

  function flushRaf(): void {
    const callbacks = rafCallbacks;
    rafCallbacks = [];
    callbacks.forEach((cb) => cb?.(0));
  }

  beforeEach(() => {
    vi.spyOn(echarts, 'init').mockImplementation(init as unknown as typeof echarts.init);
    init.mockClear();
    setOption.mockClear();
    dispose.mockClear();
    resize.mockClear();
    rafCallbacks = [];
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      rafCallbacks.push(cb)) as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number) => {
      rafCallbacks[id - 1] = undefined;
    }) as unknown as typeof cancelAnimationFrame;
    // happy-dom には ResizeObserver が無いためスタブを用意する
    globalThis.ResizeObserver = class {
      readonly observe = vi.fn();
      readonly unobserve = vi.fn();
      readonly disconnect = vi.fn();
    } as unknown as typeof ResizeObserver;

    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideMarkdown()],
    });

    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const debugEl = fixture.debugElement.query(By.directive(MarkdownComponent));
    markdown = debugEl.componentInstance;
    markdownEl = debugEl.nativeElement as HTMLElement;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function emitReadyWith(html: string): void {
    // ngx-markdown の描画結果を模して DOM を差し込み、ready をトリガーする
    markdownEl.innerHTML = html;
    markdown.ready.emit();
    flushRaf();
    fixture.detectChanges();
  }

  it('replaces a valid chart code block with an ECharts container', () => {
    emitReadyWith(LINE_BLOCK);

    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(expect.any(HTMLElement), undefined, { renderer: 'svg' });
    expect(setOption).toHaveBeenCalledTimes(1);
    expect(markdownEl.querySelector('pre')).toBeNull();
    expect(markdownEl.querySelector('.chart-block')).not.toBeNull();
  });

  it('leaves an invalid block untouched', () => {
    emitReadyWith(INVALID_BLOCK);

    expect(init).not.toHaveBeenCalled();
    expect(markdownEl.querySelector('pre')).not.toBeNull();
    expect(markdownEl.querySelector('.chart-block')).toBeNull();
  });

  it('disposes previous charts on re-render (streaming updates)', () => {
    emitReadyWith(LINE_BLOCK);
    expect(init).toHaveBeenCalledTimes(1);

    emitReadyWith(LINE_BLOCK);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledTimes(2);
  });

  it('coalesces multiple ready emissions into a single render (streaming)', () => {
    // ストリーミングを模して flush 前に ready を連続発火させる
    markdownEl.innerHTML = LINE_BLOCK;
    markdown.ready.emit();
    markdown.ready.emit();
    markdown.ready.emit();
    flushRaf();

    expect(init).toHaveBeenCalledTimes(1);
  });

  it('disposes charts when the host is destroyed', () => {
    emitReadyWith(LINE_BLOCK);
    fixture.destroy();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
