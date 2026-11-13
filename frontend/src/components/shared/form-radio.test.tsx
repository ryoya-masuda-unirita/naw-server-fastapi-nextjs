import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormRadio, type FormRadioOption } from './form-radio';

const FIXTURE_OPTIONS: FormRadioOption[] = [
  { label: '管理者', value: 'ADMIN', testid: 'role-admin' },
  { label: '一般', value: 'USER', testid: 'role-user' },
  { label: '閲覧のみ', value: 'VIEWER', disabled: true, testid: 'role-viewer' },
];

describe('FormRadio', () => {
  describe('初期表示', () => {
    test('ラベルと選択肢が表示され、選択中の値にチェックが付くこと', () => {
      render(<FormRadio label="権限" badgeText="必須" options={FIXTURE_OPTIONS} value="USER" />);
      expect(screen.getByText('権限')).toBeInTheDocument();
      expect(screen.getByText('必須')).toHaveClass('fieldset-any');
      expect(screen.getByTestId('role-user')).toBeChecked();
      expect(screen.getByTestId('role-admin')).not.toBeChecked();
    });

    test('縦並びのとき選択肢が縦に並ぶこと', () => {
      const { container } = render(<FormRadio options={FIXTURE_OPTIONS} layout="vertical" />);
      expect(container.querySelector('.flex-col.gap-3')).toBeInTheDocument();
    });

    test('エラーと警告が表示されること', () => {
      render(<FormRadio options={FIXTURE_OPTIONS} error="選択してください" warning="注意" />);
      expect(screen.getByText('選択してください')).toBeInTheDocument();
      expect(screen.getByText('注意')).toBeInTheDocument();
    });
  });

  describe('選択', () => {
    test('選択肢をクリックすると値が通知されること', async () => {
      const onValueChange = vi.fn();
      render(<FormRadio options={FIXTURE_OPTIONS} value="USER" onValueChange={onValueChange} />);
      await userEvent.setup().click(screen.getByText('管理者'));
      expect(onValueChange).toHaveBeenCalledWith('ADMIN');
    });

    test('無効な選択肢は選べないこと', async () => {
      const onValueChange = vi.fn();
      render(<FormRadio options={FIXTURE_OPTIONS} onValueChange={onValueChange} />);
      expect(screen.getByTestId('role-viewer')).toBeDisabled();
      await userEvent.setup().click(screen.getByText('閲覧のみ'));
      expect(onValueChange).not.toHaveBeenCalled();
    });

    test('disabled のときどの選択肢も選べないこと', async () => {
      const onValueChange = vi.fn();
      render(<FormRadio options={FIXTURE_OPTIONS} disabled onValueChange={onValueChange} />);
      await userEvent.setup().click(screen.getByText('管理者'));
      expect(onValueChange).not.toHaveBeenCalled();
      expect(screen.getByText('管理者').closest('label')).toHaveClass('opacity-50', 'cursor-not-allowed');
    });

    test('name を省略しても同じ部品内の選択肢は同じ name になること', () => {
      render(<FormRadio options={FIXTURE_OPTIONS} />);
      const name = screen.getByTestId('role-admin').getAttribute('name');
      expect(name).toMatch(/^radio-/);
      expect(screen.getByTestId('role-user')).toHaveAttribute('name', name);
    });
  });
});
