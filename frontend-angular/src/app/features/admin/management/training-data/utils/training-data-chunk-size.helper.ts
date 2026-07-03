/** UI preset keys used by `app-chunk-select`. */
export type ChunkSizePreset = 'small' | 'medium' | 'large';

/**
 * Character count per chunk (splitLength) for each preset.
 * - small (500): fine-grained split for precise retrieval
 * - medium (1000): balanced default, common RAG chunk size
 * - large (2000): coarse split for broader context per chunk
 */
export const CHUNK_SIZE_PRESET_VALUES: Record<ChunkSizePreset, number> = {
  small: 500,
  medium: 1000,
  large: 2000,
};

/** Default chunk preset when user selects files in the add modal. */
export const DEFAULT_CHUNK_SIZE_PRESET: ChunkSizePreset = 'medium';

const SPLIT_LENGTH_TO_PRESET = new Map<number, ChunkSizePreset>(
  Object.entries(CHUNK_SIZE_PRESET_VALUES).map(([preset, length]) => [
    length,
    preset as ChunkSizePreset,
  ]),
);

/** UI / form value → API `splitLength` (numeric string). */
export function toSplitLength(value: string | undefined | null): string | undefined {
  if (!value?.trim()) return undefined;

  const trimmed = value.trim();
  const presetValue = CHUNK_SIZE_PRESET_VALUES[trimmed as ChunkSizePreset];
  if (presetValue !== undefined) {
    return String(presetValue);
  }

  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric) && numeric > 0) {
    return String(Math.trunc(numeric));
  }

  return undefined;
}

/** API `splitLength` → UI / form value (preset key or numeric string). */
export function fromSplitLength(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return '';

  const numeric = Number(value);
  if (!Number.isNaN(numeric) && numeric > 0) {
    const preset = SPLIT_LENGTH_TO_PRESET.get(numeric);
    return preset ?? String(Math.trunc(numeric));
  }

  return String(value);
}
