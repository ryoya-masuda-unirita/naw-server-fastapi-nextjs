import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from './checkbox';

describe('Checkbox', () => {
  test('ラベルを翻訳キーで表示すること', () => {
    render(<Checkbox label="COMMON.SELECT_ALL" />);
    expect(screen.getByText('COMMON.SELECT_ALL')).toBeInTheDocument();
  });

  test('クリックで反転した値が通知されること', async () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox checked={false} onCheckedChange={onCheckedChange} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  test('中間状態からクリックすると全選択（true）になること', async () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox checked={false} indeterminate onCheckedChange={onCheckedChange} />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-checked', 'mixed');
    await userEvent.click(checkbox);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  test('内部の input に checked と indeterminate が反映されること', () => {
    const { container, rerender } = render(<Checkbox checked />);
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.checked).toBe(true);
    rerender(<Checkbox checked={false} indeterminate />);
    expect(input.indeterminate).toBe(true);
  });

  test('ヘッダー用は中間状態のアイコンが全選択用になること', () => {
    const { container } = render(<Checkbox isHeader indeterminate />);
    expect(container.querySelector('[data-svg-icon-name="checkboxAll"]')).toBeInTheDocument();
  });
});
