import { useEffect, useMemo, useRef } from 'react';
import { disposeChartBlocks, renderChartBlocks, type RenderedChart } from './chart-blocks';
import { renderMarkdownToHtml } from './markdown-render';

/**
 * mermaid の初期化オプション。移植元 app.config.ts の MERMAID_OPTIONS（securityLevel: strict）と ngx-markdown の既定（startOnLoad: false）。
 * `suppressErrorRendering` は移植元にない。ストリーミング途中の未完成な図が構文エラーになるたびに、
 * mermaid がエラー図（bomb）を body 直下へ残していくのを防ぐ。
 */
const MERMAID_OPTIONS = {
  startOnLoad: false,
  securityLevel: 'strict',
  suppressErrorRendering: true,
} as const;

interface MarkdownViewProps {
  /** Markdown 本文。ストリーミング中は逐次更新してよい */
  data: string | null | undefined;
  className?: string;
  /** ` ```mermaid ` を図に描画する（移植元 `<markdown mermaid>`）。既定 true */
  mermaid?: boolean;
  /** ` ```chart:line|bar|pie ` をグラフに描画する（移植元 `appChartBlocks`）。既定 true */
  chartBlocks?: boolean;
}

/**
 * 移植元 `<markdown mermaid appChartBlocks [data] [disableSanitizer]="true">` 相当。
 * 本文が変わるたびに HTML を作り直し、mermaid とチャートを描き直す（ストリーミング対応）。
 */
export function MarkdownView({
  data,
  className,
  mermaid = true,
  chartBlocks = true,
}: MarkdownViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderMarkdownToHtml(data, { mermaid }), [data, mermaid]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let frame: number | null = null;
    let rendered: RenderedChart[] = [];

    if (mermaid) {
      void renderMermaidBlocks(host, () => cancelled);
    }
    if (chartBlocks) {
      // ストリーミング中は本文が細かく更新されるため、1 フレーム 1 回に集約する（移植元 scheduleRender）
      frame = requestAnimationFrame(() => {
        frame = null;
        rendered = renderChartBlocks(host);
      });
    }

    return () => {
      cancelled = true;
      if (frame !== null) cancelAnimationFrame(frame);
      disposeChartBlocks(rendered);
    };
  }, [html, mermaid, chartBlocks]);

  // innerHTML は html が変わったときだけ React が書き換える。チャート・mermaid が加えた DOM は、本文が変わるまで残る。
  // chartBlocks だけが切り替わっても html は変わらず、差し替え済みのコードブロックが戻らないため、key で作り直す
  return (
    <div
      key={String(chartBlocks)}
      ref={hostRef}
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

async function renderMermaidBlocks(host: HTMLElement, isCancelled: () => boolean): Promise<void> {
  const nodes = host.querySelectorAll<HTMLElement>('.mermaid');
  if (nodes.length === 0) return;

  // 図を使わない画面の初期バンドルを増やさないよう、必要になってから読み込む
  const { default: mermaid } = await import('mermaid');
  if (isCancelled()) return;

  try {
    mermaid.initialize(MERMAID_OPTIONS);
    await mermaid.run({ nodes: Array.from(nodes) });
  } catch (error) {
    // ストリーミング途中の未完成な図は構文エラーになるのが普通なので、画面は変えずログだけ残す
    console.warn('mermaid の描画に失敗しました', error);
  }
}
