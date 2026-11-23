import { describe, test, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormCombobox, type ComboboxOption } from './form-combobox';

const FIXTURE_OPTIONS: ComboboxOption[] = [
  { value: 'g1', label: '営業部' },
  { value: 'g2', label: '開発部', description: '開発チーム', tag: 'IT' },
  { value: 'g3', label: '総務部', disabled: true },
];

function Harness({ initial = [], onFormBlur }: { initial?: string[]; onFormBlur?: () => void }) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <FormCombobox
      label="グループ"
      options={FIXTURE_OPTIONS}
      value={value}
      onValueChange={setValue}
      onFormBlur={onFormBlur}
    />
  );
}

/** トリガーは aria-expanded を持つ唯一のボタン */
const getTrigger = () =>
  screen.getAllByRole('button').find((el) => el.hasAttribute('aria-expanded')) as HTMLElement;

describe('FormCombobox', () => {
  describe('初期表示', () => {
    test('未選択のときプレースホルダーが表示されること', () => {
      render(<Harness />);
      expect(screen.getByText('選択してください')).toBeInTheDocument();
    });

    test('選択中の項目がチップで表示されること', () => {
      render(<Harness initial={['g1', 'g2']} />);
      expect(screen.getByText('営業部')).toBeInTheDocument();
      expect(screen.getByText('開発部')).toBeInTheDocument();
    });

    test('エラーがあるとき文言とエラー枠が表示されること', () => {
      const { container } = render(<FormCombobox label="グループ" error="必須です" />);
      expect(screen.getByText('必須です')).toBeInTheDocument();
      expect(container.querySelector('.border-error')).toBeInTheDocument();
    });
  });

  describe('選択', () => {
    test('開いて選択肢をクリックすると選択・解除できること', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(getTrigger());
      expect(screen.getByText('すべて選択')).toBeInTheDocument();
      await user.click(screen.getAllByText('営業部')[0]);
      // トリガーにチップが出る
      expect(screen.getAllByText('営業部')).toHaveLength(2);
      await user.click(screen.getAllByText('営業部')[1]);
      expect(screen.getAllByText('営業部')).toHaveLength(1);
    });

    test('すべて選択で無効な項目以外が選ばれ、もう一度で解除されること', async () => {
      const onValueChange = vi.fn();
      const user = userEvent.setup();
      render(<FormCombobox label="グループ" options={FIXTURE_OPTIONS} value={[]} onValueChange={onValueChange} />);
      await user.click(getTrigger());
      await user.click(screen.getByText('すべて選択'));
      expect(onValueChange).toHaveBeenLastCalledWith(['g1', 'g2']);
    });

    test('一部だけ選ばれているとき全選択が中間表示になること', async () => {
      const user = userEvent.setup();
      render(<Harness initial={['g1']} />);
      await user.click(getTrigger());
      const selectAll = screen.getByText('すべて選択').closest('[role="button"]') as HTMLElement;
      expect(within(selectAll).getByText('remove')).toBeInTheDocument();
    });

    test('無効な選択肢は選べないこと', async () => {
      const onValueChange = vi.fn();
      const user = userEvent.setup();
      render(<FormCombobox label="グループ" options={FIXTURE_OPTIONS} value={[]} onValueChange={onValueChange} />);
      await user.click(getTrigger());
      await user.click(screen.getByText('総務部'));
      expect(onValueChange).not.toHaveBeenCalled();
    });

    test('チップの削除アイコンで選択を外せること', async () => {
      const user = userEvent.setup();
      render(<Harness initial={['g1']} />);
      const chip = screen.getByText('営業部');
      await user.click(within(chip).getByText('cancel'));
      expect(screen.queryByText('営業部')).not.toBeInTheDocument();
      // 削除のクリックではドロップダウンが開かないこと
      expect(screen.queryByText('すべて選択')).not.toBeInTheDocument();
    });
  });

  describe('開閉', () => {
    test('外側をクリックすると閉じて formBlur が通知されること', async () => {
      const onFormBlur = vi.fn();
      const user = userEvent.setup();
      render(<Harness onFormBlur={onFormBlur} />);
      await user.click(getTrigger());
      await user.click(screen.getByTestId('form-combobox-backdrop'));
      expect(screen.queryByText('すべて選択')).not.toBeInTheDocument();
      expect(onFormBlur).toHaveBeenCalledTimes(1);
    });

    test('Enter で開き Escape で閉じられること', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      getTrigger().focus();
      await user.keyboard('{Enter}');
      expect(screen.getByText('すべて選択')).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(screen.queryByText('すべて選択')).not.toBeInTheDocument();
    });

    test('disabled のとき開かないこと', async () => {
      const user = userEvent.setup();
      render(<FormCombobox label="グループ" options={FIXTURE_OPTIONS} disabled />);
      await user.click(screen.getByRole('button'));
      expect(screen.queryByText('すべて選択')).not.toBeInTheDocument();
    });
  });
});
