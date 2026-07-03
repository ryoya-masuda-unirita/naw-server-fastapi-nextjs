import { describe, expect, test } from 'vitest';
import { buildShareUrl, parseShareIdFromShareUrl } from './share-url.util';

describe('share-url.util', () => {
  describe('parseShareIdFromShareUrl', () => {
    test('shareUrl から shareId を抽出できること', () => {
      expect(parseShareIdFromShareUrl('https://example.com/chat/share/share-123')).toBe(
        'share-123',
      );
    });

    test('null の場合 null を返すこと', () => {
      expect(parseShareIdFromShareUrl(null)).toBeNull();
    });
  });

  describe('buildShareUrl', () => {
    test('origin と shareId から URL を組み立てること', () => {
      expect(buildShareUrl('share-123', 'https://example.com')).toBe(
        'https://example.com/chat/share/share-123',
      );
    });
  });
});
