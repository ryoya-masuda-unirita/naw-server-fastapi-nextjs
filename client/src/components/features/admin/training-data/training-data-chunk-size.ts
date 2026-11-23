// 移植元 training-data/utils/training-data-chunk-size.helper.ts

/** `ChunkSelect` の選択肢のキー */
export type ChunkSizePreset = 'small' | 'medium' | 'large';

/**
 * プリセットごとの 1 チャンクの文字数（API の `splitLength`）。
 * - small (500): 細かく分割し、ピンポイントの検索に向く
 * - medium (1000): 標準。RAG で一般的なサイズ
 * - large (2000): 粗く分割し、チャンクごとに広い文脈を持たせる
 */
export const CHUNK_SIZE_PRESET_VALUES: Record<ChunkSizePreset, number> = {
  small: 500,
  medium: 1000,
  large: 2000,
};

/** 追加ダイアログでファイルを選んだときの既定のチャンク分割 */
export const DEFAULT_CHUNK_SIZE_PRESET: ChunkSizePreset = 'medium';

/** 「数値を指定」で入力できる文字数の範囲（移植元 `toSplitLength`） */
const MIN_SPLIT_LENGTH = 100;
const MAX_SPLIT_LENGTH = 10000;

const SPLIT_LENGTH_TO_PRESET = new Map<number, ChunkSizePreset>(
  (Object.entries(CHUNK_SIZE_PRESET_VALUES) as [ChunkSizePreset, number][]).map(
    ([preset, length]) => [length, preset],
  ),
);

/** 画面・フォームの値を API の `splitLength`（数値の文字列）にする。範囲外・不正なら undefined */
export function toSplitLength(value: string | undefined | null): string | undefined {
  if (!value?.trim()) return undefined;

  const trimmed = value.trim();
  const presetValue = (CHUNK_SIZE_PRESET_VALUES as Record<string, number | undefined>)[trimmed];
  if (
    presetValue !== undefined &&
    presetValue >= MIN_SPLIT_LENGTH &&
    presetValue <= MAX_SPLIT_LENGTH
  ) {
    return String(presetValue);
  }

  const numeric = Number(trimmed);
  if (Number.isInteger(numeric) && numeric >= MIN_SPLIT_LENGTH && numeric <= MAX_SPLIT_LENGTH) {
    return String(numeric);
  }

  return undefined;
}

/** API の `splitLength` を画面・フォームの値（プリセットのキーか数値の文字列）にする */
export function fromSplitLength(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return '';

  const numeric = Number(value);
  if (!Number.isNaN(numeric) && numeric > 0) {
    const preset = SPLIT_LENGTH_TO_PRESET.get(numeric);
    return preset ?? String(Math.trunc(numeric));
  }

  return String(value);
}
