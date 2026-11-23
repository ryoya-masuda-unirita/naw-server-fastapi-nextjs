import { useEffect, useRef } from 'react';
import './toast-container.css';
import { cx } from './class-names';
import { MatIcon } from './icons/mat-icon';
import { useToastStore, type ToastType } from './toast-store';

const TOAST_CLASS: Record<ToastType, string> = {
  success: 'border bg-green-50 border-green-200 text-green-800',
  error: 'border bg-red-50 border-red-200 text-red-800',
  warning: 'border bg-yellow-50 border-yellow-200 text-yellow-800',
  info: 'border bg-blue-50 border-blue-200 text-blue-800',
};

const ICON_CLASS: Record<ToastType, string> = {
  success: 'text-green-600',
  error: 'text-red-600',
  warning: 'text-yellow-600',
  info: 'text-blue-600',
};

const ICON: Record<ToastType, string> = {
  success: 'check_circle',
  error: 'error',
  warning: 'warning',
  info: 'info',
};

function hidePopoverSafely(el: HTMLElement) {
  try {
    el.hidePopover();
  } catch {
    // 未表示状態での hidePopover は例外になるが、閉じたい状態には変わりないので無視する
  }
}

/** 移植元 `<app-toast-container>`。`useToastStore` のトーストを右上に積んで表示する */
export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts);
  const remove = useToastStore((state) => state.remove);
  const rootRef = useRef<HTMLDivElement>(null);

  // トーストがある間はコンテナをトップレイヤーに載せ、ダイアログなどより常に前面に出す。
  // 追加のたびに hide → show で載せ直し、既に開いているダイアログの後ろに回り込まないようにする。
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof el.showPopover !== 'function') {
      // popover 非対応環境（jsdom 含む）は z-index のフォールバックに任せる
      return;
    }
    hidePopoverSafely(el);
    if (toasts.length > 0) {
      try {
        el.showPopover();
      } catch {
        // 既に表示済みなどの例外は表示状態に影響しないので無視する
      }
    }
  }, [toasts]);

  return (
    <div className="app-toast-container block">
      <div
        ref={rootRef}
        popover="manual"
        className="fixed top-4 right-4 left-auto bottom-auto z-[9999] flex flex-col gap-2 max-w-md bg-transparent overflow-visible"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            data-testid={`toast-${toast.type}`}
            className={cx(
              TOAST_CLASS[toast.type],
              'flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg animate-slide-in-right',
            )}
            role="alert"
          >
            <MatIcon name={ICON[toast.type]} size={20} className={cx(ICON_CLASS[toast.type], 'flex-shrink-0 mt-0.5')} />
            <p className="flex-1 text-sm leading-5">{toast.message}</p>
            <button
              type="button"
              onClick={() => remove(toast.id)}
              className="flex-shrink-0 ml-2 p-0 hover:opacity-70 transition-opacity"
              aria-label="Close notification"
            >
              <MatIcon name="close" size={18} className="!w-5 !h-5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
