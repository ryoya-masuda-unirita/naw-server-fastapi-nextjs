import { useCallback, useEffect, useRef } from 'react';

export interface FocusableField {
  /** 入力欄の id */
  id: string;
  invalid: boolean;
}

/** 入力欄はエラー文言の描画後に探すため、移植元と同じく少し待つ */
const FOCUS_DELAY_MS = 100;

/**
 * 最初の不正な入力欄までスクロールしてフォーカスする関数を返す（移植元 focusFirstInvalidControl）。
 * ダイアログを閉じたあとに別の画面の入力欄へフォーカスしないよう、アンマウント時に待機中の処理を取り消す。
 */
export function useFocusFirstInvalidField(): (fields: readonly FocusableField[]) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  return useCallback((fields) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const target = fields.find((field) => field.invalid);
      const input = target ? document.getElementById(target.id) : null;
      if (!input) return;
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input.focus();
    }, FOCUS_DELAY_MS);
  }, []);
}
