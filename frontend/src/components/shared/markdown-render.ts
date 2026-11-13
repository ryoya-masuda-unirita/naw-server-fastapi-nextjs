import DOMPurify from 'dompurify';
import { Marked, type Tokens } from 'marked';

/** mermaid のコードブロックの言語名（フェンス ` ```mermaid `） */
const MERMAID_LANG = 'mermaid';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ngx-markdown は marked の既定設定（gfm 有効・breaks 無効）で描画する。mermaid 指定時だけ code を差し替える
const plainMarked = new Marked();
const mermaidMarked = new Marked({
  renderer: {
    code(token: Tokens.Code) {
      // false を返すと marked の既定の code 描画に戻る。
      // 移植元（ngx-markdown）は本文を無加工で入れるが、mermaid.run は innerHTML をエンティティ復号して読むため、エスケープしても結果は同じ
      return token.lang === MERMAID_LANG
        ? `<div class="mermaid">${escapeHtml(token.text)}</div>`
        : false;
    },
  },
});

/**
 * 先頭行のインデントを全行から取り除く（ngx-markdown の trimIndentation と同じ。
 * 空行は無視し、各行の最小インデントのうち「最初に見つかった行以降の最小値」を使う）。
 */
export function trimIndentation(markdown: string | null | undefined): string {
  if (!markdown) {
    return '';
  }
  let indentStart: number | undefined;
  return markdown
    .split('\n')
    .map((line) => {
      let lineIndentStart = indentStart;
      if (line.length > 0) {
        const lineIndent = line.search(/\S|$/);
        lineIndentStart =
          lineIndentStart === undefined ? lineIndent : Math.min(lineIndent, lineIndentStart);
      }
      if (indentStart === undefined) {
        indentStart = lineIndentStart;
      }
      return lineIndentStart ? line.substring(lineIndentStart) : line;
    })
    .join('\n');
}

export interface RenderMarkdownOptions {
  /** true なら ` ```mermaid ` のブロックを `<div class="mermaid">` にする */
  mermaid?: boolean;
}

/**
 * Markdown を HTML 文字列にする（移植元 `<markdown mermaid [disableSanitizer]="true">` 相当）。
 * 移植元は AI の回答 HTML を無加工で挿入していたが、React では innerHTML 経由の XSS を避けるため DOMPurify で無害化する
 * （チャート・mermaid の class は保持される）。
 */
export function renderMarkdownToHtml(
  markdown: string | null | undefined,
  options: RenderMarkdownOptions = {},
): string {
  const instance = options.mermaid ? mermaidMarked : plainMarked;
  const html = instance.parse(trimIndentation(markdown), { async: false });
  return DOMPurify.sanitize(html);
}
