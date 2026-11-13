// 移植元 core/utils/common.helpers.ts の printHtmlContent

const PRINT_WINDOW_FEATURES = 'width=900,height=700';
/** 印刷ウィンドウの描画（フォント読み込み）を待ってから印刷ダイアログを開くまでの時間 */
const PRINT_DELAY_MS = 300;

const PRINT_STYLE = `
    @page { margin: 20mm 18mm; }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: 'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif;
      font-size: 14px;
      line-height: 1.625;
      color: #111827;
      margin: 0;
      padding: 2rem;
      background: #fff;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    h1, h2, h3, h4, h5, h6 { margin: 0 0 0.5rem 0; }
    p { margin: 0; }
    img { max-width: 100%; height: auto; }
    button { display: none !important; }

    /*
     * The markdown content root uses display:flex (inline style).
     * Converting it to block lets page-break rules take effect.
     * !important is required to override the inline style.
     */
    body > div { display: block !important; }
    /* Each section block: keep header + content together */
    body > div > div {
      break-inside: avoid;
      page-break-inside: avoid;
      margin-bottom: 1.5rem;
    }
    /* Chart/table wrapper divs inside a section */
    body > div > div > div {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    /* Tables must not split mid-row */
    table { border-collapse: collapse; width: 100%; }
    table, thead, tbody, tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    /*
     * ECharts (SVG) は画面上コンテナのピクセル幅で固定サイズ出力される。
     * 印刷ウィンドウにはアプリの CSS が読み込まれないため、ここで印刷ページ幅に
     * 収まるよう縮小し、幅広チャートが右側で見切れるのを防ぐ。
     */
    .chart-block {
      max-width: 100%;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .chart-block svg { max-width: 100%; height: auto; }

    @media print {
      body { padding: 0; }
      button { display: none !important; }
      * {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      body > div { display: block !important; }
      body > div > div {
        break-inside: avoid;
        page-break-inside: avoid;
        margin-bottom: 1.5rem;
      }
      body > div > div > div {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      table, thead, tbody, tr {
        break-inside: avoid;
        page-break-inside: avoid;
      }
    }
`;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 描画済みの Markdown を別ウィンドウに写して印刷ダイアログを開く（PDF 保存用）。
 * タイトルはライブラリ名（利用者の入力）なので、移植元と違い HTML をエスケープして埋め込む。
 *
 * Parameters
 * ----------
 * wrapperEl : HTMLElement | null | undefined
 *     Markdown を含む要素。中の `.viewer-markdown` 要素（なければこの要素）の innerHTML を印刷する。
 * title : string
 *     印刷ウィンドウのタイトル。
 */
export function printHtmlContent(wrapperEl: HTMLElement | null | undefined, title: string): void {
  const markdownEl = wrapperEl?.querySelector('.viewer-markdown');
  const html = (markdownEl ?? wrapperEl)?.innerHTML ?? '';

  const printWindow = window.open('', '_blank', PRINT_WINDOW_FEATURES);
  if (!printWindow) return;

  const htmlContent = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600&display=swap" rel="stylesheet" />
  <style>${PRINT_STYLE}</style>
</head>
<body>${html}</body>
</html>`;

  printWindow.document.documentElement.innerHTML = htmlContent;
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, PRINT_DELAY_MS);
}
