import type { Assistant } from '@/types/chat/assistant.type';

/** 先頭の「@」から始まるメンションを分解した結果 */
export interface LeadingMention {
  /** 先頭が「@」か */
  isActive: boolean;
  /** 「@」の直後から最初の半角スペースまで（検索語） */
  query: string;
  /** メンションを除いた残りの本文（先頭の空白は除く） */
  rest: string;
}

/** アシスタントを名前・カテゴリで絞り込む（移植元 core/utils/assistant-filter.helpers.ts）。語が空なら全件 */
export function filterAssistants(query: string, assistants: Assistant[]): Assistant[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return assistants;
  }

  return assistants.filter(
    (assistant) =>
      assistant.name.toLowerCase().includes(normalizedQuery) ||
      assistant.category.toLowerCase().includes(normalizedQuery),
  );
}

/** 本文の先頭にあるメンション（`@名前 本文`）を、検索語と残りの本文に分ける */
export function parseLeadingMention(content: string): LeadingMention {
  if (!content.startsWith('@')) {
    return { isActive: false, query: '', rest: content };
  }

  const afterAt = content.slice(1);
  const spaceIndex = afterAt.indexOf(' ');
  const query = spaceIndex === -1 ? afterAt : afterAt.slice(0, spaceIndex);
  const rest = spaceIndex === -1 ? '' : afterAt.slice(spaceIndex).trimStart();

  return { isActive: true, query, rest };
}
