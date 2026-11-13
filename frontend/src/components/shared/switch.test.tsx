import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Switch } from './switch';

describe('Switch', () => {
  test('オンのときはトラックが primary 色でチェックアイコンが出ること', () => {
    const { container } = render(<Switch checked label="有効" />);
    expect(screen.getByRole('switch', { name: '有効' })).toHaveAttribute('aria-checked', 'true');
    expect(container.querySelector('.bg-primary.rounded-full.w-14')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  test('クリックで反転した値が通知され、親のクリックには伝わらないこと', async () => {
    const onCheckedChange = vi.fn();
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <Switch checked={false} onCheckedChange={onCheckedChange} />
      </div>,
    );
    await userEvent.click(screen.getByRole('switch'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(onParentClick).not.toHaveBeenCalled();
  });

  test('無効のときは切り替わらないこと', async () => {
    const onCheckedChange = vi.fn();
    render(<Switch disabled onCheckedChange={onCheckedChange} />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  test('size で大きさが変わること', () => {
    const { container } = render(<Switch size="sm" />);
    expect(container.querySelector('.w-10.h-5')).toBeInTheDocument();
  });
});
