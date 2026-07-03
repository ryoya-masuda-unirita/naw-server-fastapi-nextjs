import { Assistant } from '@app-types/chat/assistant.type';

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

export function parseLeadingMention(content: string): {
  isActive: boolean;
  query: string;
  rest: string;
} {
  if (!content.startsWith('@')) {
    return { isActive: false, query: '', rest: content };
  }

  const afterAt = content.slice(1);
  const spaceIndex = afterAt.indexOf(' ');
  const query = spaceIndex === -1 ? afterAt : afterAt.slice(0, spaceIndex);
  const rest = spaceIndex === -1 ? '' : afterAt.slice(spaceIndex).trimStart();

  return { isActive: true, query, rest };
}
