import { describe, expect, test } from 'vitest';
import { applyLinkPrefix } from './training-data-link-prefix';
import type { AddFileRow } from './training-data-validation';

function row(key: string, displayName: string, reference: string): AddFileRow {
  return { key, file: new File(['a'], `${displayName}.txt`), displayName, reference, chunkSize: '1000' };
}

describe('applyLinkPrefix', () => {
  test('表示名ではなく今のリンクの先頭に接頭辞が付くこと', () => {
    const [result] = applyLinkPrefix([row('r1', 'guide', 'edited')], 'https://x/');

    expect(result.reference).toBe('https://x/edited');
    expect(result.displayName).toBe('guide');
  });

  test('すでにその接頭辞で始まるリンクには付けないこと', () => {
    const rows = [row('r1', 'a', 'https://x/a'), row('r2', 'b', 'b')];

    expect(applyLinkPrefix(rows, 'https://x/').map((r) => r.reference)).toEqual([
      'https://x/a',
      'https://x/b',
    ]);
  });

  test('接頭辞が空のときはリンクを変えないこと', () => {
    expect(applyLinkPrefix([row('r1', 'a', 'a')], '')[0].reference).toBe('a');
  });
});
