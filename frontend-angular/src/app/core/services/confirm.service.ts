import { Injectable, signal } from '@angular/core';

export interface ConfirmDialog {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'info' | 'warning' | 'danger';
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly _dialog = signal<ConfirmDialog | null>(null);
  private readonly _isProcessing = signal(false);

  readonly dialog = this._dialog.asReadonly();
  readonly isProcessing = this._isProcessing.asReadonly();

  /**
   * Show a confirmation dialog
   */
  confirm(config: ConfirmDialog): void {
    this._dialog.set(config);
  }

  /**
   * Handle confirm action
   */
  async handleConfirm(): Promise<void> {
    const dialog = this._dialog();
    if (!dialog) return;

    this._isProcessing.set(true);

    try {
      await dialog.onConfirm();
      this.close();
    } catch (error) {
      console.error('Confirm action failed:', error);
      // Keep dialog open on error
    } finally {
      this._isProcessing.set(false);
    }
  }

  /**
   * Handle cancel action
   */
  handleCancel(): void {
    const dialog = this._dialog();
    if (!dialog) return;

    dialog.onCancel?.();
    this.close();
  }

  /**
   * Close the dialog
   */
  close(): void {
    this._dialog.set(null);
    this._isProcessing.set(false);
  }
}
