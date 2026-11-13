import { describe, test, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormSortInput } from './form-sort-input';

const DESKTOP_WIDTH = 1024;
const MOBILE_WIDTH = 500;

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

function Harness({ onClear }: { onClear?: () => void }) {
  const [field, setField] = useState<string | null>(null);
  const [order, setOrder] = useState<string | null>(null);
  return (
    <FormSortInput
      testidPrefix="sort"
      selectedField={field}
      selectedOrder={order}
      onFieldChange={setField}
      onOrderChange={setOrder}
      onClear={onClear}
    />
  );
}

afterEach(() => {
  setViewportWidth(DESKTOP_WIDTH);
});

describe('FormSortInput', () => {
  describe('初期表示', () => {
    test('未選択のときプレースホルダーが表示されること', () => {
      render(<Harness />);
      expect(screen.getByTestId('sort-trigger')).toHaveTextContent('更新日時順');
      expect(screen.getByTestId('sort-trigger')).not.toHaveClass('has-value');
    });

    test('選択中の並べ替え項目のラベルが表示されること', () => {
      render(<FormSortInput testidPrefix="sort" selectedField="term" />);
      expect(screen.getByTestId('sort-trigger')).toHaveTextContent('用語順');
      expect(screen.getByTestId('sort-trigger')).toHaveClass('has-value', 'bg-bg-brand-weak');
    });
  });

  describe('デスクトップのメニュー', () => {
    test('トリガーをクリックするとメニューが開き、項目と順序を選べること', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByTestId('sort-trigger'));
      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(screen.getByTestId('sort-trigger')).toHaveClass('is-open');

      await user.click(screen.getAllByTestId('sort-field-option')[1]);
      // 移植元の mat-menu と同じく、メニュー内をクリックすると閉じる
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(screen.getByTestId('sort-trigger')).toHaveTextContent('用語順');

      await user.click(screen.getByTestId('sort-trigger'));
      await user.click(screen.getAllByTestId('sort-order-option')[1]);
      await user.click(screen.getByTestId('sort-trigger'));
      expect(screen.getAllByTestId('sort-order-option')[1]).toHaveAttribute('aria-checked', 'true');
    });

    test('メニューの外側をクリックすると閉じること', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByTestId('sort-trigger'));
      await user.click(screen.getByTestId('sort-backdrop'));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    test('選択中と同じ項目を選んでも通知されないこと', async () => {
      const onFieldChange = vi.fn();
      const user = userEvent.setup();
      render(<FormSortInput testidPrefix="sort" selectedField="updatedAt" onFieldChange={onFieldChange} />);
      await user.click(screen.getByTestId('sort-trigger'));
      await user.click(screen.getAllByTestId('sort-field-option')[0]);
      expect(onFieldChange).not.toHaveBeenCalled();
    });
  });

  describe('クリア', () => {
    test('クリアボタンで項目と順序が解除されること', async () => {
      const onClear = vi.fn();
      const user = userEvent.setup();
      const { container } = render(<Harness onClear={onClear} />);
      await user.click(screen.getByTestId('sort-trigger'));
      await user.click(screen.getAllByTestId('sort-field-option')[1]);
      await user.click(container.querySelector('.combobox-clear') as HTMLElement);
      expect(onClear).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('sort-trigger')).toHaveTextContent('更新日時順');
      // クリアのクリックでメニューが開かないこと
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  test('disabled のときメニューが開かないこと', async () => {
    render(<FormSortInput testidPrefix="sort" disabled />);
    const trigger = screen.getByTestId('sort-trigger');
    expect(trigger).toHaveClass('pointer-events-none', 'opacity-60');
    // pointer-events: none の要素は userEvent でクリックできないので、クリック処理を直接呼ぶ
    act(() => trigger.click());
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  describe('モバイルのドロワー', () => {
    test('モバイルではボトムドロワーで項目を選べること', async () => {
      setViewportWidth(MOBILE_WIDTH);
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByTestId('sort-trigger'));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      await user.click(await screen.findByRole('menuitemradio', { name: '用語順' }));
      expect(screen.getByTestId('sort-trigger')).toHaveTextContent('用語順');
    });
  });
});
