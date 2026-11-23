import { afterEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MultiSelect } from './multi-select';
import type { SelectOption } from './types';

const FIXTURE_OPTIONS: SelectOption[] = [
  { label: '営業部', value: 'sales' },
  { label: '開発部', value: 'dev' },
  { label: '人事部', value: 'hr' },
];

const DESKTOP_WIDTH = 1024;
const MOBILE_WIDTH = 375;

function setViewportWidth(width: number) {
  act(() => {
    window.innerWidth = width;
    window.dispatchEvent(new Event('resize'));
  });
}

afterEach(() => {
  setViewportWidth(DESKTOP_WIDTH);
});

const getTrigger = (container: HTMLElement) => container.querySelector('.trigger-wrapper') as HTMLElement;

async function openMultiSelect(container: HTMLElement) {
  const user = userEvent.setup();
  await user.click(getTrigger(container));
  await waitFor(() => expect(screen.getByRole('listbox')).not.toHaveClass('opacity-0'));
  return user;
}

describe('MultiSelect', () => {
  describe('初期表示', () => {
    test('未選択ならプレースホルダーが表示されること', () => {
      render(<MultiSelect options={FIXTURE_OPTIONS} />);
      expect(screen.getByText('選択してください')).toBeInTheDocument();
    });

    test('選択済みの値がチップで表示されること', () => {
      render(<MultiSelect options={FIXTURE_OPTIONS} value={['sales', 'hr']} />);
      expect(screen.getByRole('button', { name: '営業部' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '人事部' })).toBeInTheDocument();
      expect(screen.queryByText('選択してください')).not.toBeInTheDocument();
    });
  });

  describe('選択と確定', () => {
    test('チェックした値は確定するまで selectionChange に通知されないこと', async () => {
      const onValueChange = vi.fn();
      const onSelectionChange = vi.fn();
      const { container } = render(
        <MultiSelect options={FIXTURE_OPTIONS} onValueChange={onValueChange} onSelectionChange={onSelectionChange} />,
      );
      const user = await openMultiSelect(container);
      await user.click(screen.getByRole('option', { name: '開発部' }));
      expect(onValueChange).toHaveBeenLastCalledWith(['dev']);
      expect(onSelectionChange).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'COMMON.CONFIRM_SELECTION' }));
      expect(onSelectionChange).toHaveBeenCalledWith(['dev']);
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
      expect(screen.getByRole('button', { name: '開発部' })).toBeInTheDocument();
    });

    test('キャンセルすると開く前の値に戻ること', async () => {
      const onValueChange = vi.fn();
      const onSelectionChange = vi.fn();
      const { container } = render(
        <MultiSelect
          options={FIXTURE_OPTIONS}
          value={['sales']}
          onValueChange={onValueChange}
          onSelectionChange={onSelectionChange}
        />,
      );
      const user = await openMultiSelect(container);
      await user.click(screen.getByRole('option', { name: '開発部' }));
      await user.click(screen.getByRole('button', { name: 'COMMON.CANCEL' }));
      expect(onValueChange).toHaveBeenLastCalledWith(['sales']);
      expect(onSelectionChange).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
      expect(screen.queryByRole('button', { name: '開発部' })).not.toBeInTheDocument();
    });

    test('外側をクリックすると開く前の値に戻って閉じること', async () => {
      const onValueChange = vi.fn();
      const { container } = render(
        <div>
          <button type="button">outside</button>
          <MultiSelect options={FIXTURE_OPTIONS} onValueChange={onValueChange} />
        </div>,
      );
      const user = await openMultiSelect(container);
      await user.click(screen.getByRole('option', { name: '人事部' }));
      await user.click(screen.getByRole('button', { name: 'outside' }));
      expect(onValueChange).toHaveBeenLastCalledWith([]);
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    });

    test('すべて選択とすべて解除を切り替えられること', async () => {
      const onValueChange = vi.fn();
      const { container } = render(<MultiSelect options={FIXTURE_OPTIONS} onValueChange={onValueChange} />);
      const user = await openMultiSelect(container);
      await user.click(screen.getByRole('button', { name: /COMMON\.SELECT_ALL/ }));
      expect(onValueChange).toHaveBeenLastCalledWith(['sales', 'dev', 'hr']);
      await user.click(screen.getByRole('button', { name: /COMMON\.RELEASE_ALL/ }));
      expect(onValueChange).toHaveBeenLastCalledWith([]);
    });

    test('選択肢が空なら空表示の文言が出ること', async () => {
      const { container } = render(<MultiSelect options={[]} />);
      await openMultiSelect(container);
      expect(screen.getByText('COMMON.EMPTY_RESULT')).toBeInTheDocument();
    });
  });

  describe('チップの削除', () => {
    test('チップの削除ボタンで値を外すとすぐに確定されること', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const onSelectionChange = vi.fn();
      render(
        <MultiSelect
          options={FIXTURE_OPTIONS}
          value={['sales', 'dev']}
          onValueChange={onValueChange}
          onSelectionChange={onSelectionChange}
        />,
      );
      await user.click(screen.getByRole('button', { name: '営業部' }));
      expect(onValueChange).toHaveBeenCalledWith(['dev']);
      expect(onSelectionChange).toHaveBeenCalledWith(['dev']);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('キーボード操作', () => {
    test('Escape キーで閉じること', async () => {
      const { container } = render(<MultiSelect options={FIXTURE_OPTIONS} />);
      await openMultiSelect(container);
      fireEvent.keyDown(getTrigger(container), { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    });

    test('Enter キーで開くこと', async () => {
      const { container } = render(<MultiSelect options={FIXTURE_OPTIONS} />);
      fireEvent.keyDown(getTrigger(container), { key: 'Enter' });
      expect(await screen.findByRole('listbox')).toBeInTheDocument();
    });
  });

  describe('無効状態', () => {
    test('disabled のときはクリックしても開かないこと', async () => {
      const user = userEvent.setup();
      const { container } = render(<MultiSelect options={FIXTURE_OPTIONS} disabled />);
      await user.click(getTrigger(container));
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('モバイル', () => {
    test('モバイル幅ではボトムドロワーで開き、背景クリックで確定して閉じること', async () => {
      setViewportWidth(MOBILE_WIDTH);
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      const { container } = render(<MultiSelect options={FIXTURE_OPTIONS} onSelectionChange={onSelectionChange} />);
      await user.click(getTrigger(container));
      await waitFor(() => expect(container.querySelector('.combobox-select-all')).toBeInTheDocument());
      await waitFor(() => expect(container.querySelector('.fixed.inset-0')).not.toHaveClass('opacity-0'));
      await user.click(screen.getByRole('option', { name: '営業部' }));
      await user.click(container.querySelector('.bg-bg-overlay') as HTMLElement);
      expect(onSelectionChange).toHaveBeenCalledWith(['sales']);
    });
  });
});
