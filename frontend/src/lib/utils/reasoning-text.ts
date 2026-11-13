import type { MessageReasoning, MessageReasoningSection } from '@/types/chat/message.type';

const COMPLETE_SUMMARY_PATTERN = /\*\*([^*]+)\*\*/g;
const INCOMPLETE_SUMMARY_SUFFIX = /\*\*[^*]*$/;

/** ストリーミング途中の `**見出し` （閉じていない見出し）を本文末尾から取り除く */
function trimIncompleteSummarySuffix(text: string): string {
  const match = text.match(INCOMPLETE_SUMMARY_SUFFIX);
  if (!match || match.index === undefined) {
    return text;
  }
  return text.slice(0, match.index).trimEnd();
}

/** 蓄積した reasoning のストリーム文字列を、`**見出し**` ごとのセクション（見出し + 詳細）に分ける（移植元 core/utils/reasoning-text.helpers.ts） */
export function parseReasoningText(raw: string): MessageReasoning {
  const matches = [...raw.matchAll(COMPLETE_SUMMARY_PATTERN)];
  if (matches.length === 0) {
    return { sections: [] };
  }

  const sections: MessageReasoningSection[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const summary = match[1].trim();
    if (!summary) {
      continue;
    }

    const detailStart = (match.index ?? 0) + match[0].length;
    const detailEnd = i + 1 < matches.length ? (matches[i + 1].index ?? raw.length) : raw.length;
    let detail = raw.slice(detailStart, detailEnd);

    if (i === matches.length - 1) {
      detail = trimIncompleteSummarySuffix(detail);
    }

    sections.push({ summary, detail: detail.trim() });
  }

  return { sections };
}
