import type { FieldErrors } from '@/lib/utils/form-errors';

/** Angular の Validators.required・maxLength と同じ判定（required は空文字だけを弾く） */
export function validateText(
  value: string,
  maxLength: number | null,
  required: boolean,
): FieldErrors | null {
  if (required && value.length === 0) return { required: true };
  if (maxLength !== null && value.length > maxLength) {
    return { maxlength: { requiredLength: maxLength, actualLength: value.length } };
  }
  return null;
}

/** 学習データの表示名・参照資料のリンク名の最大文字数（移植元 `Validators.maxLength(255)`） */
export const FILE_NAME_MAX_LENGTH = 255;

/** 追加ダイアログで選んだファイル 1 件分の入力（移植元の `files` FormArray の 1 要素） */
export interface AddFileRow {
  /** 行を識別する値（削除で並びが変わっても入力欄を取り違えないため） */
  key: string;
  file: File;
  displayName: string;
  reference: string;
  chunkSize: string;
}

export type AddFileField = 'displayName' | 'reference' | 'chunkSize';

/** 追加ダイアログの行ごとの入力チェック（移植元の `Validators.required`・`maxLength(255)`） */
export function validateAddRow(row: AddFileRow, field: AddFileField): FieldErrors | null {
  if (field === 'chunkSize') return validateText(row.chunkSize, null, true);
  return validateText(row[field], FILE_NAME_MAX_LENGTH, true);
}

/** 編集（追加）ダイアログの入力（移植元の `editFileForm`） */
export interface EditFileValues {
  displayName: string;
  reference: string;
  chunkSize: string;
  /** 学習に使うか */
  status: boolean;
}

export type EditFileField = 'displayName' | 'reference' | 'chunkSize';

/** 編集ダイアログの入力チェック（移植元の `Validators.required`・`maxLength(255)`） */
export function validateEditField(values: EditFileValues, field: EditFileField): FieldErrors | null {
  if (field === 'chunkSize') return validateText(values.chunkSize, null, true);
  return validateText(values[field], FILE_NAME_MAX_LENGTH, true);
}
