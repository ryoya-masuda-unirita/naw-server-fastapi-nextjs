import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';
import { MarkdownComponent } from 'ngx-markdown';

import { chartTypeFromClassName, parseChartBlock } from '@shared/utils/chart-block.helpers';
import { echarts } from '@shared/utils/echarts.setup';

/** 描画済みチャートの管理単位（破棄・リサイズ用） */
interface RenderedChart {
  instance: ReturnType<typeof echarts.init>;
  resizeObserver: ResizeObserver;
}

/**
 * `<markdown appChartBlocks>` に付与すると、マークダウン描画後に
 * ` ```chart:line ` / ` ```chart:bar ` / ` ```chart:pie ` のコードブロックを
 * 検出して ECharts のグラフへ差し替える再利用可能なディレクティブ。
 *
 * ngx-markdown の `MarkdownComponent` は描画完了ごとに `ready` を emit するため、
 * ストリーミングで本文が逐次更新される場合も都度再描画される。
 * JSON が不完全・不正な場合はグラフ化せず、元のコードブロックをそのまま残す。
 */
@Directive({
  selector: 'markdown[appChartBlocks]',
  standalone: true,
})
export class ChartBlockDirective {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly markdown = inject(MarkdownComponent);
  private readonly destroyRef = inject(DestroyRef);

  private rendered: RenderedChart[] = [];
  private pendingFrame: number | null = null;

  constructor() {
    this.markdown.ready.pipe(takeUntilDestroyed()).subscribe(() => this.scheduleRender());
    this.destroyRef.onDestroy(() => {
      this.cancelPendingRender();
      this.disposeRendered();
    });
  }

  /**
   * ストリーミング中は `ready` が文字チャンクごとに連続発火するため、
   * `requestAnimationFrame` で 1 フレーム 1 回に集約して再描画コストを抑える。
   * 最終的な描画では必ず置換が行われるため表示の正しさは保たれる。
   */
  private scheduleRender(): void {
    if (this.pendingFrame !== null) return;
    this.pendingFrame = requestAnimationFrame(() => {
      this.pendingFrame = null;
      this.renderCharts();
    });
  }

  private cancelPendingRender(): void {
    if (this.pendingFrame !== null) {
      cancelAnimationFrame(this.pendingFrame);
      this.pendingFrame = null;
    }
  }

  private renderCharts(): void {
    // 前回描画分を破棄してから再描画する（ストリーミング更新に対応）
    this.disposeRendered();

    const codeBlocks = this.host.nativeElement.querySelectorAll<HTMLElement>(
      'code[class*="language-chart:"]',
    );

    codeBlocks.forEach((code) => {
      const type = chartTypeFromClassName(code.className);
      if (!type) return;

      const option = parseChartBlock(type, code.textContent ?? '');
      // 不完全・不正な JSON はグラフ化せずコードブロックを残す
      if (!option) return;

      const pre = code.closest('pre');
      if (!pre || !pre.parentElement) return;

      const container = document.createElement('div');
      container.className = 'chart-block';
      pre.replaceWith(container);

      const instance = echarts.init(container, undefined, { renderer: 'svg' });
      instance.setOption(option);

      const resizeObserver = new ResizeObserver(() => instance.resize());
      resizeObserver.observe(container);

      this.rendered.push({ instance, resizeObserver });
    });
  }

  private disposeRendered(): void {
    for (const { instance, resizeObserver } of this.rendered) {
      resizeObserver.disconnect();
      instance.dispose();
    }
    this.rendered = [];
  }
}
