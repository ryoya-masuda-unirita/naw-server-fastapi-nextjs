/** 出力が回答の JSON なら、本文（answer）を取り出す。そうでなければ、そのまま返す。 */
export function answerOf(output: string): string {
  try {
    const parsed: unknown = JSON.parse(output);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'answer' in parsed &&
      typeof parsed.answer === 'string'
    ) {
      return parsed.answer;
    }
  } catch {
    // JSON でない出力（出力モード 2 など）は、そのまま見せる
  }
  return output;
}
