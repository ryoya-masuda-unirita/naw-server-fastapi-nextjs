import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';

/**
 * Singleton service that closes any open dropdown when the user clicks
 * anywhere outside it — without a visible backdrop overlay.
 *
 * Pattern: each component registers its `closeCallback` via `open()`.
 * A root-level document click listener calls `closeAll()` automatically.
 * Toggle buttons must call `$event.stopPropagation()` in their template
 * to prevent the document click from immediately re-closing a newly-opened menu.
 */
@Injectable({ providedIn: 'root' })
export class DropdownService {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  /** Callback registered by the currently-open dropdown to close itself */
  private _closeCallback: (() => void) | null = null;

  constructor() {
    // Close any open dropdown when clicking anywhere on the document.
    // Toggle buttons must stopPropagation() so they don't immediately re-close.
    fromEvent(this.document, 'click')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.closeAll());
  }

  private showBackdrop(): void {
    if (this.document.defaultView && this.document.defaultView.innerWidth < 768) {
      this.document.getElementById('dropdown-backdrop')?.classList.add('is-visible');
    }
  }

  private hideBackdrop(): void {
    this.document.getElementById('dropdown-backdrop')?.classList.remove('is-visible');
  }

  /**
   * Notify the service that a dropdown has opened.
   * @param closeCallback Function called to close the currently-open dropdown.
   */
  open(closeCallback: () => void): void {
    // Close the previous dropdown first (only one open at a time)
    if (this._closeCallback) {
      this._closeCallback();
    }
    this._closeCallback = closeCallback;
    this.showBackdrop();
  }

  /** Close the currently-open dropdown */
  closeAll(): void {
    if (this._closeCallback) {
      this._closeCallback();
      this._closeCallback = null;
    }
    this.hideBackdrop();
  }

  /** Called by a component when it closes itself (e.g. item clicked) */
  notifyClosed(): void {
    this._closeCallback = null;
    this.hideBackdrop();
  }
}
