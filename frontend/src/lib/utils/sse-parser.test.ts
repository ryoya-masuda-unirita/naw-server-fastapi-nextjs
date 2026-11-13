import { describe, expect, test } from 'vitest';
import { parseSseChunk, parseSseDataLine } from './sse-parser';

/** ジェネレーターを最後まで回し、yield された値と remainder を返す */
function drain(buffer: string, chunk: string): { events: unknown[]; remainder: string } {
  const generator = parseSseChunk(buffer, chunk);
  const events: unknown[] = [];
  let result = generator.next();
  while (!result.done) {
    events.push(result.value);
    result = generator.next();
  }
  return { events, remainder: result.value };
}

describe('parseSseDataLine', () => {
  test('data 行の JSON を返すこと', () => {
    expect(parseSseDataLine('data: {"type":"text_delta","text":"a"}')).toEqual({
      type: 'text_delta',
      text: 'a',
    });
  });

  test('data: の直後にスペースがなくても読めること', () => {
    expect(parseSseDataLine('data:{"a":1}')).toEqual({ a: 1 });
  });

  test('空行・コメント行・data 以外の行は null になること', () => {
    expect(parseSseDataLine('')).toBeNull();
    expect(parseSseDataLine('   ')).toBeNull();
    expect(parseSseDataLine(': keep-alive')).toBeNull();
    expect(parseSseDataLine('event: message')).toBeNull();
  });

  test('[DONE] と空の data は null になること', () => {
    expect(parseSseDataLine('data: [DONE]')).toBeNull();
    expect(parseSseDataLine('data:')).toBeNull();
  });

  test('JSON として読めない data は null になること', () => {
    expect(parseSseDataLine('data: {"type":')).toBeNull();
  });
});

describe('parseSseChunk', () => {
  test('完成した行だけを順に返し、未完成の行は remainder に残すこと', () => {
    const { events, remainder } = drain('', 'data: {"a":1}\n\ndata: {"b":2}\ndata: {"c"');
    expect(events).toEqual([{ a: 1 }, { b: 2 }]);
    expect(remainder).toBe('data: {"c"');
  });

  test('前回の remainder と連結して 1 行を完成させること', () => {
    const { events, remainder } = drain('data: {"c"', ':3}\n');
    expect(events).toEqual([{ c: 3 }]);
    expect(remainder).toBe('');
  });

  test('CRLF の改行でも読めること', () => {
    const { events } = drain('', 'data: {"a":1}\r\n\r\ndata: {"b":2}\r\n');
    expect(events).toEqual([{ a: 1 }, { b: 2 }]);
  });
});
