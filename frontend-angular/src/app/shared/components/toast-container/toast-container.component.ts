import { CommonModule } from '@angular/common';
import {
  Component,
  inject,
  ChangeDetectionStrategy,
  effect,
  ElementRef,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ToastService, ToastType } from '@core/services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #toastRoot
      popover="manual"
      class="fixed top-4 right-4 left-auto bottom-auto z-[9999] flex flex-col gap-2 max-w-md bg-transparent overflow-visible"
    >
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          [class]="getToastClass(toast.type)"
          class="flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg animate-slide-in-right"
          role="alert"
        >
          <mat-icon
            [class]="getIconClass(toast.type)"
            class="!w-5 !h-5 !text-[20px] flex-shrink-0 mt-0.5"
          >
            {{ getIcon(toast.type) }}
          </mat-icon>

          <p class="flex-1 text-sm leading-5">{{ toast.message }}</p>

          <button
            type="button"
            (click)="toastService.remove(toast.id)"
            class="flex-shrink-0 ml-2 p-0 hover:opacity-70 transition-opacity"
            [attr.aria-label]="'Close notification'"
          >
            <mat-icon class="!w-5 !h-5 !text-[18px]">close</mat-icon>
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      @keyframes slide-in-right {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      .animate-slide-in-right {
        animation: slide-in-right 0.3s ease-out;
      }
    `,
  ],
  host: {
    class: 'block',
  },
})
export class ToastContainerComponent {
  readonly toastService = inject(ToastService);

  private readonly toastRoot = viewChild<ElementRef<HTMLElement>>('toastRoot');

  constructor() {
    // トーストが存在する間はコンテナをトップレイヤーに載せ、モーダルなどの
    // CDK オーバーレイより常に前面へ表示する。トースト追加のたびに hide → show で
    // 載せ直すことで、既に開いているダイアログよりも後ろに回り込まないようにする。
    effect(() => {
      const hasToasts = this.toastService.toasts().length > 0;
      const el = this.toastRoot()?.nativeElement;
      if (!el || typeof el.showPopover !== 'function') {
        // popover 非対応環境では z-index フォールバックに任せる
        return;
      }

      if (hasToasts) {
        try {
          el.hidePopover();
        } catch {
          // 未表示状態での hidePopover は例外になるため無視
        }
        try {
          el.showPopover();
        } catch {
          // 既に表示済みなどの例外は無視
        }
      } else {
        try {
          el.hidePopover();
        } catch {
          // 未表示状態での hidePopover は例外になるため無視
        }
      }
    });
  }

  getToastClass(type: ToastType): string {
    const baseClasses = 'border';
    switch (type) {
      case 'success':
        return `${baseClasses} bg-green-50 border-green-200 text-green-800`;
      case 'error':
        return `${baseClasses} bg-red-50 border-red-200 text-red-800`;
      case 'warning':
        return `${baseClasses} bg-yellow-50 border-yellow-200 text-yellow-800`;
      case 'info':
        return `${baseClasses} bg-blue-50 border-blue-200 text-blue-800`;
      default:
        return `${baseClasses} bg-gray-50 border-gray-200 text-gray-800`;
    }
  }

  getIconClass(type: ToastType): string {
    switch (type) {
      case 'success':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
      case 'warning':
        return 'text-yellow-600';
      case 'info':
        return 'text-blue-600';
      default:
        return 'text-gray-600';
    }
  }

  getIcon(type: ToastType): string {
    switch (type) {
      case 'success':
        return 'check_circle';
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      default:
        return 'notifications';
    }
  }
}
