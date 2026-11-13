import type { FieldErrors } from '@/lib/utils/form-errors';

/** 移植元 group-list.component・group-detail.component の `Validators.maxLength` */
export const GROUP_NAME_MAX_LENGTH = 100;

/** 作成・編集ダイアログの幅（移植元 `width: '100%', maxWidth: '800px'`） */
export const GROUP_NAME_DIALOG_WIDTH = 'min(100%, 800px)';

/**
 * Angular の Validators.required・maxLength と同じ判定。
 * required は空文字だけを弾く（空白だけの値は通り、送信時の trim で空になる点も移植元どおり）。
 *
 * @param value 入力されたチーム名
 */
export function validateGroupName(value: string): FieldErrors | null {
  if (value.length === 0) return { required: true };
  if (value.length > GROUP_NAME_MAX_LENGTH) {
    return {
      maxlength: { requiredLength: GROUP_NAME_MAX_LENGTH, actualLength: value.length },
    };
  }
  return null;
}
