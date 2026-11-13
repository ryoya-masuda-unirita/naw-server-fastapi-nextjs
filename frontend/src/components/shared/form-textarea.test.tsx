import { describe, test, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormTextarea } from './form-textarea';

function Harness({ onValueChange }: { onValueChange?: (v: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <FormTextarea
      label="説明"
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    />
  );
}

describe('FormTextarea', () => {
  describe('初期表示', () => {
    test('ラベル・バッジ・補足文と行数が表示されること', () => {
      render(<FormTextarea label="説明" badgeText="任意" supportText="補足" value="" rows={6} textareaId="desc" />);
      expect(screen.getByText('任意')).toHaveClass('fieldset-any');
      expect(screen.getByText('補足')).toBeInTheDocument();
      const textarea = screen.getByRole('textbox', { name: '説明' });
      expect(textarea).toHaveAttribute('rows', '6');
      expect(textarea).toHaveAttribute('id', 'desc');
    });

    test('areaHeight で最小の高さを指定できること', () => {
      render(<FormTextarea label="説明" value="" areaHeight={120} />);
      expect(screen.getByRole('textbox')).toHaveStyle({ minHeight: '120px' });
    });
  });

  describe('入力', () => {
    test('入力した値が通知されること', async () => {
      const onValueChange = vi.fn();
      render(<Harness onValueChange={onValueChange} />);
      await userEvent.setup().type(screen.getByRole('textbox'), 'メモ');
      expect(onValueChange).toHaveBeenLastCalledWith('メモ');
    });

    test('フォーカスを外すと formBlur が通知されること', async () => {
      const onFormBlur = vi.fn();
      render(<FormTextarea label="説明" value="" onFormBlur={onFormBlur} />);
      const user = userEvent.setup();
      await user.click(screen.getByRole('textbox'));
      await user.tab();
      expect(onFormBlur).toHaveBeenCalledTimes(1);
    });
  });

  test('エラーがあるとき文言とエラー枠が表示されること', () => {
    render(<FormTextarea label="説明" value="" error="必須です" />);
    expect(screen.getByText('必須です')).toHaveClass('text-error');
    expect(screen.getByRole('textbox')).toHaveClass('border-error');
  });

  test('disabled のとき入力できないこと', () => {
    render(<FormTextarea label="説明" value="" disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});
