import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

/** 種類ごとの表示時間（ms）。移植元 ToastService の既定値 */
const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 3000,
};

interface ToastStore {
  toasts: Toast[];
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  remove: (id: string) => void;
  clear: () => void;
}

let idCounter = 0;

/**
 * 移植元 core/services/toast.service.ts。表示は `<ToastContainer />`（アプリのルートに 1 つ置く）。
 * コンポーネント外（mutation の onError など）からは `useToastStore.getState().error(...)` で呼ぶ。
 */
export const useToastStore = create<ToastStore>((set, get) => {
  const show = (type: ToastType, message: string, duration: number) => {
    const id = `toast-${++idCounter}`;
    set((state) => ({ toasts: [...state.toasts, { id, type, message, duration }] }));
    // duration が 0 以下なら自動では消さない
    if (duration > 0) {
      setTimeout(() => get().remove(id), duration);
    }
  };

  return {
    toasts: [],
    success: (message, duration = DEFAULT_DURATION.success) => show('success', message, duration),
    error: (message, duration = DEFAULT_DURATION.error) => show('error', message, duration),
    warning: (message, duration = DEFAULT_DURATION.warning) => show('warning', message, duration),
    info: (message, duration = DEFAULT_DURATION.info) => show('info', message, duration),
    remove: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
    clear: () => set({ toasts: [] }),
  };
});

/**
 * 移植元 errorInterceptor が出す共通のエラートースト。`useApiErrorInterceptor({ showErrorToast })` に渡す。
 * 参照が変わらないようモジュールの関数にしている（渡し先の useEffect の依存に入るため）
 */
export function showErrorToast(message: string): void {
  useToastStore.getState().error(message);
}
