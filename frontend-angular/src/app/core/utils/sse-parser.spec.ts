import { describe, expect, test } from 'vitest';
import { parseSseChunk, parseSseDataLine } from './sse-parser';

describe('parseSseDataLine', () => {
  test('data: プレフィックス付き JSON をパースすること', () => {
    const parsed = parseSseDataLine('data:{"type":"text_delta","text":"hello"}');
    expect(parsed).toEqual({ type: 'text_delta', text: 'hello' });
  });
});

describe('parseSseChunk', () => {
  test('複数行の data イベントを順に yield すること', () => {
    const gen = parseSseChunk(
      '',
      'data:{"type":"text_delta","text":"a"}\n\ndata:{"type":"text_delta","text":"b"}\n',
    );
    expect(gen.next().value).toEqual({ type: 'text_delta', text: 'a' });
    expect(gen.next().value).toEqual({ type: 'text_delta', text: 'b' });
    const last = gen.next();
    expect(last.done).toBe(true);
    expect(last.value).toBe('');
  });

  test('チャンク境界で行が分割されてもパースできること', () => {
    const gen1 = parseSseChunk('', 'data:{"type":"text_delta","te');
    let result = gen1.next();
    while (!result.done) {
      result = gen1.next();
    }
    const buffer = result.value as string;

    const gen2 = parseSseChunk(buffer, 'xt":"hi"}\n');
    expect(gen2.next().value).toEqual({ type: 'text_delta', text: 'hi' });
  });
});
