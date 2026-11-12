import { afterEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectWithSearch } from './select-with-search';
import type { SelectOption } from './types';

const FIXTURE_OPTIONS: SelectOption[] = [
  { label: 'Apple', value: 'apple' },
  { label: 'Orange', value: 'orange' },
  { label: 'Grape', value: 'grape', description: '紫の果物', category: '果物' },
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

describe('SelectWithSearch', () => {
  describe('初期表示', () => {
    test('未選択なら入力欄にプレースホルダーが表示されること', () => {
      render(<SelectWithSearch options={FIXTURE_OPTIONS} testidPrefix="fruit" />);
      expect(screen.getByPlaceholderText('選択してください')).toBeInTheDocument();
      expect(screen.getByTestId('fruit-trigger')).toBeInTheDocument();
    });

    test('選択済みの値のラベルが表示されること', () => {
      render(<SelectWithSearch options={FIXTURE_OPTIONS} value="orange" />);
      expect(screen.getByText('Orange')).toBeInTheDocument();
    });
  });

  describe('検索と選択', () => {
    test('入力欄をクリックすると選択肢が開くこと', async () => {
      const user = userEvent.setup();
      render(<SelectWithSearch options={FIXTURE_OPTIONS} testidPrefix="fruit" />);
      await user.click(screen.getByRole('textbox'));
      expect(await screen.findByRole('listbox')).toBeInTheDocument();
      expect(screen.getAllByTestId('fruit-option')).toHaveLength(3);
    });

    test('入力した文字で選択肢を絞り込めること', async () => {
      const user = userEvent.setup();
      render(<SelectWithSearch options={FIXTURE_OPTIONS} />);
      await user.click(screen.getByRole('textbox'));
      await screen.findByRole('listbox');
      await user.type(screen.getByRole('textbox'), 'ap');
      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(2);
      expect(options[0]).toHaveTextContent('Apple');
      expect(options[1]).toHaveTextContent('Grape');
    });

    test('一致する選択肢がなければ空表示の文言が出ること', async () => {
      const user = userEvent.setup();
      render(<SelectWithSearch options={FIXTURE_OPTIONS} />);
      await user.click(screen.getByRole('textbox'));
      await screen.findByRole('listbox');
      await user.type(screen.getByRole('textbox'), 'zzz');
      expect(screen.getByText('COMMON.EMPTY_RESULT')).toBeInTheDocument();
    });

    test('選択肢を選ぶと値が通知されて閉じること', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const onSelectionChange = vi.fn();
      render(
        <SelectWithSearch
          options={FIXTURE_OPTIONS}
          onValueChange={onValueChange}
          onSelectionChange={onSelectionChange}
        />,
      );
      await user.click(screen.getByRole('textbox'));
      await user.click(await screen.findByRole('option', { name: /Orange/ }));
      expect(onValueChange).toHaveBeenCalledWith('orange');
      expect(onSelectionChange).toHaveBeenCalledWith('orange');
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
      expect(screen.getByText('Orange')).toBeInTheDocument();
    });

    test('説明とカテゴリを持つ選択肢は説明とカテゴリも表示されること', async () => {
      const user = userEvent.setup();
      render(<SelectWithSearch options={FIXTURE_OPTIONS} />);
      await user.click(screen.getByRole('textbox'));
      await screen.findByRole('listbox');
      expect(screen.getByText('紫の果物')).toBeInTheDocument();
      expect(screen.getByText('果物')).toBeInTheDocument();
    });
  });

  describe('クリア', () => {
    test('クリアボタンで値と検索語を空にできること', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const { container } = render(
        <SelectWithSearch options={FIXTURE_OPTIONS} value="apple" onValueChange={onValueChange} />,
      );
      await user.click(container.querySelector('.trigger-wrapper button') as HTMLElement);
      expect(onValueChange).toHaveBeenCalledWith(null);
      expect(screen.getByRole('textbox')).toHaveValue('');
    });
  });

  describe('キーボード操作', () => {
    test('Escape キーで閉じること', async () => {
      const user = userEvent.setup();
      render(<SelectWithSearch options={FIXTURE_OPTIONS} />);
      await user.click(screen.getByRole('textbox'));
      await screen.findByRole('listbox');
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    });
  });

  describe('無効状態', () => {
    test('disabled のときは入力欄が無効で開かないこと', async () => {
      const user = userEvent.setup();
      const { container } = render(<SelectWithSearch options={FIXTURE_OPTIONS} disabled />);
      expect(screen.getByRole('textbox')).toBeDisabled();
      await user.click(container.querySelector('.trigger-wrapper') as HTMLElement);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('モバイル', () => {
    test('モバイル幅ではドロワー内の入力欄で絞り込めること', async () => {
      setViewportWidth(MOBILE_WIDTH);
      const user = userEvent.setup();
      const { container } = render(<SelectWithSearch options={FIXTURE_OPTIONS} />);
      await user.click(container.querySelector('.trigger-wrapper') as HTMLElement);
      await waitFor(() => expect(container.querySelector('.combobox-list__sp-input')).toBeInTheDocument());
      const mobileInput = container.querySelector('.combobox-list__sp-input') as HTMLInputElement;
      await user.type(mobileInput, 'gra');
      const listbox = container.querySelector('.combobox-list__body') as HTMLElement;
      expect(listbox.querySelectorAll('[role="option"]')).toHaveLength(1);
    });
  });
});
