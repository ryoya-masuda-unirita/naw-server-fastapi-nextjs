import { create } from 'zustand';

export interface ConfirmDialogConfig {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'info' | 'warning' | 'danger';
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

interface ConfirmStore {
  dialog: ConfirmDialogConfig | null;
  isProcessing: boolean;
  confirm: (config: ConfirmDialogConfig) => void;
  handleConfirm: () => Promise<void>;
  handleCancel: () => void;
  close: () => void;
}

/**
 * 移植元 core/services/confirm.service.ts の状態部分。
 * 移植元でもこの状態を描画する UI はなく、どの画面からも使われていない（削除確認は Dialog で行う）。
 * 移植元に揃えて状態だけを持つ。
 */
export const useConfirmStore = create<ConfirmStore>((set, get) => ({
  dialog: null,
  isProcessing: false,
  confirm: (config) => set({ dialog: config }),
  handleConfirm: async () => {
    const dialog = get().dialog;
    if (!dialog) return;
    set({ isProcessing: true });
    try {
      await dialog.onConfirm();
      get().close();
    } catch (error) {
      // 失敗時はダイアログを開いたままにして、利用者がやり直せるようにする（移植元と同じ）
      console.error('Confirm action failed:', error);
    } finally {
      set({ isProcessing: false });
    }
  },
  handleCancel: () => {
    const dialog = get().dialog;
    if (!dialog) return;
    dialog.onCancel?.();
    get().close();
  },
  close: () => set({ dialog: null, isProcessing: false }),
}));
