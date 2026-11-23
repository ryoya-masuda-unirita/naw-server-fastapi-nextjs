import { describe, test, expect, vi, beforeEach } from 'vitest';
import { useConfirmStore } from './confirm-store';

beforeEach(() => {
  useConfirmStore.getState().close();
});

describe('useConfirmStore', () => {
  test('確認すると onConfirm を実行して閉じること', async () => {
    const onConfirm = vi.fn();
    useConfirmStore.getState().confirm({ title: '削除', message: '削除しますか', onConfirm });
    expect(useConfirmStore.getState().dialog?.title).toBe('削除');

    await useConfirmStore.getState().handleConfirm();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(useConfirmStore.getState().dialog).toBeNull();
    expect(useConfirmStore.getState().isProcessing).toBe(false);
  });

  test('onConfirm が失敗したら開いたままにすること', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useConfirmStore.getState().confirm({
      title: '削除',
      message: '削除しますか',
      onConfirm: () => Promise.reject(new Error('failed')),
    });

    await useConfirmStore.getState().handleConfirm();
    expect(useConfirmStore.getState().dialog).not.toBeNull();
    expect(useConfirmStore.getState().isProcessing).toBe(false);
    consoleError.mockRestore();
  });

  test('キャンセルすると onCancel を呼んで閉じること', () => {
    const onCancel = vi.fn();
    useConfirmStore.getState().confirm({ title: 't', message: 'm', onConfirm: vi.fn(), onCancel });
    useConfirmStore.getState().handleCancel();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(useConfirmStore.getState().dialog).toBeNull();
  });
});
