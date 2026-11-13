import { describe, test, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormInput } from './form-input';

type HarnessProps = Omit<Parameters<typeof FormInput>[0], 'value'> & { initial?: string };

/** 制御コンポーネントとして値を保持し、入力を反映させる */
function Harness({ initial = '', onValueChange, ...props }: HarnessProps) {
  const [value, setValue] = useState(initial);
  return (
    <FormInput
      {...props}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    />
  );
}

describe('FormInput', () => {
  describe('初期表示', () => {
    test('ラベル・バッジ・補足文が表示され、ラベルから入力欄を辿れること', () => {
      render(<Harness label="名前" badgeText="任意" supportText="補足" inputId="name" />);
      expect(screen.getByText('任意')).toHaveClass('fieldset-any');
      expect(screen.getByText('補足')).toHaveClass('fieldset-support-text');
      expect(screen.getByLabelText(/名前/)).toHaveAttribute('id', 'name');
    });

    test('既存呼び出し互換の id と onChange で入力できること', async () => {
      const onChange = vi.fn();
      render(<FormInput label="ID" id="legacy" value="" onChange={onChange} />);
      await userEvent.setup().type(screen.getByLabelText('ID'), 'a');
      expect(onChange).toHaveBeenCalledWith('a');
    });
  });

  describe('入力', () => {
    test('入力した値が通知されること', async () => {
      const onValueChange = vi.fn();
      render(<Harness label="名前" inputId="n" dataTestid="name-input" onValueChange={onValueChange} />);
      await userEvent.setup().type(screen.getByTestId('name-input'), 'abc');
      expect(onValueChange).toHaveBeenLastCalledWith('abc');
      expect(screen.getByTestId('name-input')).toHaveValue('abc');
    });

    test('asciiOnly のとき ASCII 以外の文字が取り除かれること', async () => {
      const onValueChange = vi.fn();
      render(<Harness label="名前" dataTestid="i" asciiOnly onValueChange={onValueChange} />);
      await userEvent.setup().type(screen.getByTestId('i'), 'aあb');
      expect(screen.getByTestId('i')).toHaveValue('ab');
    });

    test('maxLength を超えた分は入力できないこと', async () => {
      render(<Harness label="名前" dataTestid="i" maxLength={3} />);
      await userEvent.setup().type(screen.getByTestId('i'), 'abcde');
      expect(screen.getByTestId('i')).toHaveValue('abc');
    });

    test('フォーカスを外すと formBlur が通知されること', async () => {
      const onFormBlur = vi.fn();
      render(<Harness label="名前" dataTestid="i" onFormBlur={onFormBlur} />);
      const user = userEvent.setup();
      await user.click(screen.getByTestId('i'));
      await user.tab();
      expect(onFormBlur).toHaveBeenCalledTimes(1);
    });

    test('値があってフォーカスしていないとき入力済みの見た目になること', () => {
      render(<Harness label="名前" dataTestid="i" initial="x" />);
      const wrapper = screen.getByTestId('i').parentElement;
      expect(wrapper).toHaveClass('has-value', 'bg-bg-brand-weak');
    });
  });

  describe('エラー・警告表示', () => {
    test('エラー文言が data-testid 付きで表示され、枠がエラー表示になること', () => {
      render(<Harness label="名前" dataTestid="name" error="必須です" />);
      expect(screen.getByTestId('name-error')).toHaveTextContent('必須です');
      expect(screen.getByTestId('name').parentElement).toHaveClass('has-error', 'bg-bg-error');
    });

    test('警告文言が表示されること', () => {
      render(<Harness label="名前" warning="注意" />);
      expect(screen.getByText('注意')).toBeInTheDocument();
    });
  });

  describe('無効状態', () => {
    test('disabled のとき入力できないこと', () => {
      render(<Harness label="名前" dataTestid="i" disabled />);
      expect(screen.getByTestId('i')).toBeDisabled();
      expect(screen.getByTestId('i').parentElement).toHaveClass('is-disabled');
    });
  });

  describe('パスワード表示切替', () => {
    test('showPasswordToggle のときパスワードの表示・非表示を切り替えられること', async () => {
      render(<Harness label="PW" type="password" dataTestid="pw" showPasswordToggle />);
      const user = userEvent.setup();
      expect(screen.getByTestId('pw')).toHaveAttribute('type', 'password');
      await user.click(screen.getByRole('button', { name: 'Show password' }));
      expect(screen.getByTestId('pw')).toHaveAttribute('type', 'text');
      await user.click(screen.getByRole('button', { name: 'Hide password' }));
      expect(screen.getByTestId('pw')).toHaveAttribute('type', 'password');
    });

    test('showPasswordToggle を指定しないと切替ボタンが出ないこと', () => {
      render(<Harness label="PW" type="password" />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  test('endAdornment が入力欄の右に表示されること', () => {
    render(<Harness label="名前" endAdornment={<span>単位</span>} />);
    expect(screen.getByText('単位')).toBeInTheDocument();
  });
});
