import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<Toast[]>([]);
  private idCounter = 0;

  readonly toasts = this._toasts.asReadonly();

  /**
   * Show a success toast
   */
  success(message: string, duration = 3000): void {
    this.show('success', message, duration);
  }

  /**
   * Show an error toast
   */
  error(message: string, duration = 5000): void {
    this.show('error', message, duration);
  }

  /**
   * Show a warning toast
   */
  warning(message: string, duration = 4000): void {
    this.show('warning', message, duration);
  }

  /**
   * Show an info toast
   */
  info(message: string, duration = 3000): void {
    this.show('info', message, duration);
  }

  /**
   * Show a toast with custom type and duration
   */
  private show(type: ToastType, message: string, duration: number): void {
    const id = `toast-${++this.idCounter}`;
    const toast: Toast = { id, type, message, duration };

    this._toasts.update((toasts) => [...toasts, toast]);

    // Auto remove after duration
    if (duration > 0) {
      setTimeout(() => this.remove(id), duration);
    }
  }

  /**
   * Remove a specific toast
   */
  remove(id: string): void {
    this._toasts.update((toasts) => toasts.filter((t) => t.id !== id));
  }

  /**
   * Clear all toasts
   */
  clear(): void {
    this._toasts.set([]);
  }
}
