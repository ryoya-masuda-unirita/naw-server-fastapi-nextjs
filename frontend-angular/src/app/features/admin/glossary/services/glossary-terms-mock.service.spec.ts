import { GlossaryTermsMockService } from './glossary-terms-mock.service';

describe('GlossaryTermsMockService', () => {
  let service: GlossaryTermsMockService;

  beforeEach(() => {
    service = new GlossaryTermsMockService();
  });

  describe('初期値・ゲッター', () => {
    test('itemsが配列で返ること', () => {
      expect(Array.isArray(service.items())).toBe(true);
    });

    test('assistantOptionsが返ること', () => {
      expect(service.assistantOptions().length).toBeGreaterThan(0);
    });
  });

  describe('DOM要素表示', () => {
    test('（該当なし）', () => {
      expect(true).toBe(true);
    });
  });

  describe('DOM要素イベント', () => {
    test('addTermでitemsが更新されること（空文字は無視されること）', () => {
      const before = service.items().length;
      service.addTerm({ name: '   ', definition: 'x' });
      expect(service.items().length).toBe(before);

      service.addTerm({ name: 'New', definition: 'Def', assistantLabel: 'A' });
      expect(service.items().length).toBeGreaterThan(before);
      expect(service.items()[0]?.name).toBe('New');
    });

    test('updateTermで既存要素が更新されること（存在しないIDは無視されること）', () => {
      const first = service.items()[0];
      expect(first).toBeTruthy();
      if (!first) return;

      service.updateTerm('___not_found___', { name: 'x', definition: 'y' });
      expect(service.getItemById(first.id)?.name).toBe(first.name);

      service.updateTerm(first.id, {
        name: 'Updated',
        definition: 'Updated def',
        assistantLabel: 'Lbl',
      });
      const updated = service.getItemById(first.id);
      expect(updated?.name).toBe('Updated');
      expect(updated?.definition).toBe('Updated def');
    });
  });
});
