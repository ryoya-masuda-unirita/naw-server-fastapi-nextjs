import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ToastContainer } from './toast-container';
import { useToastStore } from './toast-store';

beforeEach(() => {
  vi.useFakeTimers();
  useToastStore.getState().clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useToastStore', () => {
  test('種類ごとの既定の時間が過ぎると自動で消えること', () => {
    const store = useToastStore.getState();
    store.success('成功');
    store.error('失敗');
    store.warning('警告');
    store.info('お知らせ');
    expect(useToastStore.getState().toasts.map((t) => t.type)).toEqual(['success', 'error', 'warning', 'info']);

    act(() => vi.advanceTimersByTime(3000));
    expect(useToastStore.getState().toasts.map((t) => t.type)).toEqual(['error', 'warning']);
    act(() => vi.advanceTimersByTime(1000));
    expect(useToastStore.getState().toasts.map((t) => t.type)).toEqual(['error']);
    act(() => vi.advanceTimersByTime(1000));
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  test('時間に 0 を指定すると自動では消えないこと', () => {
    useToastStore.getState().info('残る', 0);
    act(() => vi.advanceTimersByTime(60000));
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
});

describe('ToastContainer', () => {
  test('トーストを種類に応じた見た目とアイコンで表示すること', () => {
    render(<ToastContainer />);
    act(() => useToastStore.getState().error('保存に失敗しました'));
    const toast = screen.getByTestId('toast-error');
    expect(toast).toHaveAttribute('role', 'alert');
    expect(toast).toHaveClass('bg-red-50', 'border-red-200', 'text-red-800');
    expect(toast).toHaveTextContent('保存に失敗しました');
    expect(toast.querySelector('[data-mat-icon-name="error"]')).toBeInTheDocument();
  });

  test('閉じるボタンでトーストを消せること', () => {
    render(<ToastContainer />);
    act(() => useToastStore.getState().success('保存しました'));
    // popover 内の要素は jsdom ではアクセシビリティツリーから外れるので、ラベルで取得する
    fireEvent.click(screen.getByLabelText('Close notification'));
    expect(screen.queryByTestId('toast-success')).not.toBeInTheDocument();
  });
});
