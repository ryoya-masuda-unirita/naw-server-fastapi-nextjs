import { Injectable, signal } from '@angular/core';
import type { GlossaryItem } from '@app-types/admin/glossary.types';
import { MOCK_GLOSSARY_TERMS } from '@core/mocks/admin-mock-data';
import type { ComboboxOption } from '@app/shared/components/form/form-combobox/form-combobox.component';

@Injectable({ providedIn: 'root' })
export class GlossaryTermsMockService {
  private readonly _items = signal<GlossaryItem[]>([...MOCK_GLOSSARY_TERMS]);

  readonly items = this._items.asReadonly();

  /** Resolve a glossary dictionary card by id (for detail routes). Uses store so HTTP mock updates stay visible. */
  getItemById(id: string): GlossaryItem | undefined {
    return MOCK_GLOSSARY_TERMS.find((i) => i.id === id);
  }

  readonly assistantOptions = signal<ComboboxOption[]>([
    {
      label: '社内情報アシスタント',
      value: '社内情報アシスタント',
      description:
        '説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト',
      category: 'カテゴリカテゴリ',
    },
    {
      label: 'Azure4o-mini',
      value: 'Azure4o-mini',
      description:
        '説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト',
      category: 'カスタムカテゴリ',
    },
    {
      label: '論文添削',
      value: '論文添削',
      description:
        '説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト',
      category: 'カテゴリカテゴリ',
    },
    {
      label: '議事録作成',
      value: '議事録作成',
      description:
        '説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト',
      category: 'カテゴリカテゴリ',
    },
    {
      label: 'コード生成',
      value: 'コード生成',
      description:
        '説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト',
      category: 'カテゴリカテゴリ',
    },
  ]);

  private syncFromStore(): void {
    this._items.set([...MOCK_GLOSSARY_TERMS]);
  }

  addTerm(input: { name: string; definition: string; assistantLabel?: string }): void {
    const name = input.name.trim();
    if (!name) return;
    const id = String(
      MOCK_GLOSSARY_TERMS.reduce((m, t) => {
        const n = parseInt(t.id, 10);
        return Number.isFinite(n) && n > m ? n : m;
      }, 0) + 1,
    );
    MOCK_GLOSSARY_TERMS.unshift({
      id,
      name,
      definition: input.definition.trim(),
      tags: [],
      editedDate: new Date(),
      creator: '名前名者名前',
      category: '全ての関語',
      assistant: input.assistantLabel?.trim() ?? '',
    });
    this.syncFromStore();
  }

  updateTerm(
    id: string,
    input: { name: string; definition: string; assistantLabel?: string },
  ): void {
    const idx = MOCK_GLOSSARY_TERMS.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const existing = MOCK_GLOSSARY_TERMS[idx];
    MOCK_GLOSSARY_TERMS[idx] = {
      ...existing,
      name: input.name.trim(),
      definition: input.definition.trim(),
      assistant:
        input.assistantLabel !== undefined ? input.assistantLabel.trim() : existing.assistant,
      editedDate: new Date(),
    };
    this.syncFromStore();
  }
}
