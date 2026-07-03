import { FormGroup } from '@angular/forms';

export interface ScrollErrorField {
  controlName: string;
  elementId: string;
}

export interface ScrollToErrorOptions {
  /** CSS selector for the scroll container. Defaults to 'mat-dialog-container'. */
  container?: string;
  behavior?: ScrollBehavior;
  block?: ScrollLogicalPosition;
}

/**
 * Scrolls to the first invalid field in a FormGroup.
 * Fields are checked in the order provided via the `fields` array.
 */
export function scrollToFirstFormError(
  form: FormGroup,
  fields: ScrollErrorField[],
  options: ScrollToErrorOptions = {},
): void {
  const { container = 'mat-dialog-container', behavior = 'smooth', block = 'nearest' } = options;
  const root = document.querySelector(container) ?? document;

  for (const { controlName, elementId } of fields) {
    if (form.get(controlName)?.invalid) {
      (root.querySelector(`#${elementId}`) as HTMLElement | null)?.scrollIntoView({
        behavior,
        block,
      });
      return;
    }
  }
}
