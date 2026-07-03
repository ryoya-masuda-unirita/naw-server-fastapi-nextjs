/** Parses a single SSE `data:` line into a JSON object, or null if not a data line. */
export function parseSseDataLine(line: string): unknown | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(':')) {
    return null;
  }
  if (!trimmed.startsWith('data:')) {
    return null;
  }
  const payload = trimmed.slice(5).trimStart();
  if (!payload || payload === '[DONE]') {
    return null;
  }
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
}

/** Feeds UTF-8 chunks into SSE line parser and yields parsed JSON payloads. */
export function* parseSseChunk(buffer: string, chunk: string): Generator<unknown, string> {
  let combined = buffer + chunk;
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
