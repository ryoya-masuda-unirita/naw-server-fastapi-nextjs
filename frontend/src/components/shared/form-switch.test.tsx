import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormSwitch } from './form-switch';

describe('FormSwitch', () => {
  describe('初期表示', () => {
    test('ラベル・バッジ・補足文・スイッチ文言が表示されること', () => {
      render(<FormSwitch label="有効化" badgeText="任意" supportText="補足" switchLabel="ON" checked />);
      expect(screen.getByText('有効化')).toBeInTheDocument();
      expect(screen.getByText('任意')).toBeInTheDocument();
      expect(screen.getByText('補足')).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'ON' })).toHaveAttribute('aria-checked', 'true');
    });

    test('エラーと警告が表示されること', () => {
      const { container } = render(<FormSwitch label="有効化" error="エラー" warning="注意" />);
      expect(screen.getByText('エラー')).toBeInTheDocument();
      expect(screen.getByText('注意')).toBeInTheDocument();
      expect(container.querySelector('.form-switch-wrapper')).toHaveClass('has-error');
    });
  });

  describe('切り替え', () => {
    test('クリックすると反転した値と formBlur が通知されること', async () => {
      const onCheckedChange = vi.fn();
      const onFormBlur = vi.fn();
      render(
        <FormSwitch
          label="有効化"
          dataTestid="sw"
          checked={false}
          onCheckedChange={onCheckedChange}
          onFormBlur={onFormBlur}
        />,
      );
      await userEvent.setup().click(screen.getByRole('switch'));
      expect(onCheckedChange).toHaveBeenCalledWith(true);
      expect(onFormBlur).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('sw')).toContainElement(screen.getByRole('switch'));
    });

    test('disabled のとき切り替えられないこと', async () => {
      const onCheckedChange = vi.fn();
      render(<FormSwitch label="有効化" disabled onCheckedChange={onCheckedChange} />);
      await userEvent.setup().click(screen.getByRole('switch'));
      expect(onCheckedChange).not.toHaveBeenCalled();
    });
  });
});
