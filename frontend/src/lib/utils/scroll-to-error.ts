// 移植元 shared/utils/scroll-to-error.ts。
// 移植元は FormGroup を受け取り form.get(name).invalid で判定する。React にはフォームライブラリがないため、
// 項目名を受け取って不正かどうかを返す関数を渡す。

export interface ScrollErrorField {
  controlName: string;
  elementId: string;
}

export interface ScrollToErrorOptions {
  /**
   * スクロールさせるコンテナの CSS セレクタ。
   * 移植元の既定は Angular Material のダイアログ（'mat-dialog-container'）。React ではダイアログの role で探す。
   */
  container?: string;
  behavior?: ScrollBehavior;
  block?: ScrollLogicalPosition;
}

const DEFAULT_CONTAINER = '[role="dialog"]';

/** `fields` の順に見て、最初の不正な項目までスクロールする */
export function scrollToFirstFormError(
  isInvalid: (controlName: string) => boolean,
  fields: ScrollErrorField[],
  options: ScrollToErrorOptions = {}
): void {
  const { container = DEFAULT_CONTAINER, behavior = 'smooth', block = 'nearest' } = options;
  const root = document.querySelector(container) ?? document;

  for (const { controlName, elementId } of fields) {
    if (isInvalid(controlName)) {
      root.querySelector<HTMLElement>(`#${elementId}`)?.scrollIntoView({ behavior, block });
      return;
    }
  }
}
