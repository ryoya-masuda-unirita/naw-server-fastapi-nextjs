import { describe, expect, it } from 'vitest';
import { parseReasoningText } from './reasoning-text.helpers';

describe('parseReasoningText', () => {
  it('** ** ごとに summary/detail のペアを上から順に返すこと', () => {
    const raw =
      '**Checking Sapporo weather**\n\nThe user is asking in Japanese.\n\n**Combining weather sources**\n\nThe JMA page is not available.';

    expect(parseReasoningText(raw)).toEqual({
      sections: [
        {
          summary: 'Checking Sapporo weather',
          detail: 'The user is asking in Japanese.',
        },
        {
          summary: 'Combining weather sources',
          detail: 'The JMA page is not available.',
        },
      ],
    });
  });

  it('最後の summary が未完成の場合は前セクションの detail に含めないこと', () => {
    const raw =
      '**Checking Sapporo weather**\n\nThe user is asking in Japanese.\n\n**Combining weath';

    expect(parseReasoningText(raw)).toEqual({
      sections: [
        {
          summary: 'Checking Sapporo weather',
          detail: 'The user is asking in Japanese.',
        },
      ],
    });
  });

  it('** ** が未完成で1件も確定していない場合は sections を空にすること', () => {
    const raw = '**Checking Sapporo weath';

    expect(parseReasoningText(raw)).toEqual({ sections: [] });
  });

  it('** ** がない場合は sections を空にすること', () => {
    const raw = 'The user is asking about weather.';

    expect(parseReasoningText(raw)).toEqual({ sections: [] });
  });

  it('空文字列の場合は空の sections を返すこと', () => {
    expect(parseReasoningText('')).toEqual({ sections: [] });
  });
});
