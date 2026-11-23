import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormSelect } from './form-select';
import type { SelectOption } from './types';

const FIXTURE_OPTIONS: SelectOption[] = [
  { label: '管理者', value: 'ADMIN' },
  { label: '一般', value: 'USER' },
];

describe('FormSelect', () => {
  describe('初期表示', () => {
    test('見出し・バッジ・補足が表示されること', () => {
      render(<FormSelect label="権限" badgeText="必須" supportText="権限を選びます" options={FIXTURE_OPTIONS} />);
      expect(screen.getByText('権限')).toBeInTheDocument();
      expect(screen.getByText('必須')).toBeInTheDocument();
      expect(screen.getByText('権限を選びます')).toBeInTheDocument();
    });

    test('見出しが空なら見出し部分を出さないこと', () => {
      const { container } = render(<FormSelect label="" options={FIXTURE_OPTIONS} />);
      expect(container.querySelector('.fieldset-head')).toBeNull();
    });

    test('選択済みの値のラベルが表示されること', () => {
      render(<FormSelect label="権限" options={FIXTURE_OPTIONS} value="USER" />);
      expect(screen.getByText('一般')).toBeInTheDocument();
    });
  });

  describe('エラーと警告', () => {
    test('エラーを渡すとエラー文言が出てセレクトがエラー表示になること', () => {
      const { container } = render(<FormSelect label="権限" options={FIXTURE_OPTIONS} error="選択してください。" />);
      expect(screen.getByText('選択してください。')).toBeInTheDocument();
      expect(container.querySelector('.form-select-wrapper')).toHaveClass('has-error');
    });

    test('警告を渡すと警告文言が出ること', () => {
      const { container } = render(<FormSelect label="権限" options={FIXTURE_OPTIONS} warning="注意してください" />);
      expect(screen.getByText('注意してください')).toBeInTheDocument();
      expect(container.querySelector('.form-select-wrapper')).not.toHaveClass('has-error');
    });
  });

  describe('選択', () => {
    test('選択すると値と formBlur が通知されること', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const onFormBlur = vi.fn();
      const { container } = render(
        <FormSelect label="権限" options={FIXTURE_OPTIONS} onValueChange={onValueChange} onFormBlur={onFormBlur} />,
      );
      await user.click(container.querySelector('.trigger-wrapper') as HTMLElement);
      await user.click(await screen.findByRole('option', { name: '管理者' }));
      expect(onValueChange).toHaveBeenCalledWith('ADMIN');
      expect(onFormBlur).toHaveBeenCalledTimes(1);
    });

    test('クリアすると null が通知されること', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const { container } = render(
        <FormSelect label="権限" options={FIXTURE_OPTIONS} value="ADMIN" onValueChange={onValueChange} />,
      );
      await user.click(container.querySelector('.trigger-wrapper button') as HTMLElement);
      expect(onValueChange).toHaveBeenCalledWith(null);
    });
  });

  describe('無効状態', () => {
    test('disabled のときは開かないこと', async () => {
      const user = userEvent.setup();
      const { container } = render(<FormSelect label="権限" options={FIXTURE_OPTIONS} disabled />);
      await user.click(container.querySelector('.trigger-wrapper') as HTMLElement);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });
});
