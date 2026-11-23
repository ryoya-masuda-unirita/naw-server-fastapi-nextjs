/** SSE の `data:` 1 行を JSON に変換する。data 行でない・空・`[DONE]`・JSON でない行は null（移植元 core/utils/sse-parser.ts） */
export function parseSseDataLine(line: string): unknown | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(':')) {
    return null;
  }
  if (!trimmed.startsWith('data:')) {
    return null;
  }
  const payload = trimmed.slice('data:'.length).trimStart();
  if (!payload || payload === '[DONE]') {
    return null;
  }
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    // 途中で切れた行・JSON でない行は読み飛ばす（移植元と同じ）
    return null;
  }
}

/**
 * 受信した UTF-8 のチャンクを行に分け、完成した data 行の JSON を順に yield する。
 * 末尾の改行で終わっていない行は `return` の値（remainder）として返すので、呼び出し側が次のチャンクの `buffer` に渡す。
 */
export function* parseSseChunk(buffer: string, chunk: string): Generator<unknown, string> {
  const combined = buffer + chunk;
  const lines = combined.split(/\r?\n/);
  const remainder = lines.pop() ?? '';
  for (const line of lines) {
    const parsed = parseSseDataLine(line);
    if (parsed !== null) {
      yield parsed;
    }
  }
  return remainder;
}
