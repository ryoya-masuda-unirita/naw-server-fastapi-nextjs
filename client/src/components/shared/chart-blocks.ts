import { chartTypeFromClassName, parseChartBlock } from '@/lib/utils/chart-block';
import { echarts } from '@/lib/utils/echarts-setup';

/** 描画済みチャートの管理単位（破棄・リサイズ用） */
export interface RenderedChart {
  instance: ReturnType<typeof echarts.init>;
  resizeObserver: ResizeObserver;
}

const CHART_CODE_SELECTOR = 'code[class*="language-chart:"]';
const CHART_CONTAINER_CLASS = 'chart-block';

/**
 * host 内の ` ```chart:line|bar|pie ` のコードブロックを ECharts のグラフに差し替える（移植元 ChartBlockDirective.renderCharts）。
 * JSON が不完全・不正なら差し替えず、元のコードブロックを残す。
 */
export function renderChartBlocks(host: HTMLElement): RenderedChart[] {
  const rendered: RenderedChart[] = [];

  host.querySelectorAll<HTMLElement>(CHART_CODE_SELECTOR).forEach((code) => {
    const type = chartTypeFromClassName(code.className);
    if (!type) return;

    const option = parseChartBlock(type, code.textContent ?? '');
    if (!option) return;

    const pre = code.closest('pre');
    if (!pre || !pre.parentElement) return;

    const container = document.createElement('div');
    container.className = CHART_CONTAINER_CLASS;
    pre.replaceWith(container);

    // SVG レンダラーを使う理由は echarts-setup.ts を参照
    const instance = echarts.init(container, undefined, { renderer: 'svg' });
    instance.setOption(option);

    const resizeObserver = new ResizeObserver(() => instance.resize());
    resizeObserver.observe(container);

    rendered.push({ instance, resizeObserver });
  });

  return rendered;
}

/** renderChartBlocks が作ったチャートを破棄する */
export function disposeChartBlocks(rendered: RenderedChart[]): void {
  for (const { instance, resizeObserver } of rendered) {
    resizeObserver.disconnect();
    instance.dispose();
  }
}
