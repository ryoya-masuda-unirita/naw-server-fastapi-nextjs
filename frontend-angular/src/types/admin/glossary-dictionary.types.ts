/** Rows for the term-word-admin table (Astro `term-word-admin.astro`). */
export interface GlossaryWordTableRow {
  id: string;
  name: string;
  description: string;
  dateLabel: string;
  author: string;
  tags: string[];
}

/** Rows for the term-word-assistant-admin table (Astro `term-word-assistant-admin.astro`). */
export interface GlossaryDictionaryAssistantRow {
  id: string;
  name: string;
  description: string;
  server: string;
  model: string;
  category: string;
  history: string;
}
