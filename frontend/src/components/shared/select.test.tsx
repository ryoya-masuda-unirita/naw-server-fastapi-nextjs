import { afterEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './select';
import type { SelectOption } from './types';

const FIXTURE_OPTIONS: SelectOption[] = [
  { label: 'りんご', value: 'apple' },
  { label: 'みかん', value: 'orange' },
  { label: 'ぶどう', value: 'grape', disabled: true },
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

describe('Select', () => {
  describe('初期表示', () => {
    test('未選択ならプレースホルダーが表示されること', () => {
      render(<Select options={FIXTURE_OPTIONS} />);
      expect(screen.getByText('選択してください')).toBeInTheDocument();
    });

    test('選択済みの値のラベルが表示されること', () => {
      render(<Select options={FIXTURE_OPTIONS} value="orange" />);
      expect(screen.getByText('みかん')).toBeInTheDocument();
    });

    test('閉じている間は選択肢が表示されないこと', () => {
      render(<Select options={FIXTURE_OPTIONS} />);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('開閉と選択', () => {
    test('トリガーをクリックすると選択肢が開くこと', async () => {
      const user = userEvent.setup();
      const { container } = render(<Select options={FIXTURE_OPTIONS} />);
      await user.click(getTrigger(container));
      expect(await screen.findByRole('listbox')).toBeInTheDocument();
      expect(screen.getAllByRole('option')).toHaveLength(3);
    });

    test('選択肢を選ぶと値が通知されて閉じること', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const onSelectionChange = vi.fn();
      const { container } = render(
        <Select options={FIXTURE_OPTIONS} onValueChange={onValueChange} onSelectionChange={onSelectionChange} />,
      );
      await user.click(getTrigger(container));
      await user.click(await screen.findByRole('option', { name: 'みかん' }));
      expect(onValueChange).toHaveBeenCalledWith('orange');
      expect(onSelectionChange).toHaveBeenCalledWith('orange');
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
      expect(screen.getByText('みかん')).toBeInTheDocument();
    });

    test('無効な選択肢は選べないこと', async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      const { container } = render(<Select options={FIXTURE_OPTIONS} onSelectionChange={onSelectionChange} />);
      await user.click(getTrigger(container));
      expect(await screen.findByRole('option', { name: 'ぶどう' })).toBeDisabled();
      expect(onSelectionChange).not.toHaveBeenCalled();
    });

    test('外側をクリックすると閉じること', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <div>
          <button type="button">outside</button>
          <Select options={FIXTURE_OPTIONS} />
        </div>,
      );
      await user.click(getTrigger(container));
      await screen.findByRole('listbox');
      await user.click(screen.getByRole('button', { name: 'outside' }));
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    });

    test('選択肢が空なら空表示の文言が出ること', async () => {
      const user = userEvent.setup();
      const { container } = render(<Select options={[]} />);
      await user.click(getTrigger(container));
      expect(await screen.findByText('COMMON.EMPTY_RESULT')).toBeInTheDocument();
    });

    test('補足文がドロップダウンに表示されること', async () => {
      const user = userEvent.setup();
      const { container } = render(<Select options={FIXTURE_OPTIONS} supportText="補足です" />);
      await user.click(getTrigger(container));
      expect(await screen.findByText('補足です')).toBeInTheDocument();
    });
  });

  describe('クリア', () => {
    test('クリアボタンで値を空にできること', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const onSelectionChange = vi.fn();
      const { container } = render(
        <Select
          options={FIXTURE_OPTIONS}
          value="apple"
          onValueChange={onValueChange}
          onSelectionChange={onSelectionChange}
        />,
      );
      await user.click(container.querySelector('.trigger-wrapper button') as HTMLElement);
      expect(onValueChange).toHaveBeenCalledWith(null);
      expect(onSelectionChange).not.toHaveBeenCalled();
      expect(screen.getByText('選択してください')).toBeInTheDocument();
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    test('showClear が false ならクリアボタンが出ないこと', () => {
      const { container } = render(<Select options={FIXTURE_OPTIONS} value="apple" showClear={false} />);
      expect(container.querySelector('.trigger-wrapper button')).toBeNull();
    });
  });

  describe('キーボード操作', () => {
    test('下矢印キーで開き、さらに押すと次の選択肢を選ぶこと', async () => {
      const onValueChange = vi.fn();
      const { container } = render(<Select options={FIXTURE_OPTIONS} value="apple" onValueChange={onValueChange} />);
      fireEvent.keyDown(getTrigger(container), { key: 'ArrowDown' });
      await screen.findByRole('listbox');
      fireEvent.keyDown(getTrigger(container), { key: 'ArrowDown' });
      expect(onValueChange).toHaveBeenCalledWith('orange');
    });

    test('Escape キーで閉じること', async () => {
      const { container } = render(<Select options={FIXTURE_OPTIONS} />);
      fireEvent.keyDown(getTrigger(container), { key: 'Enter' });
      await screen.findByRole('listbox');
      fireEvent.keyDown(getTrigger(container), { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    });
  });

  describe('無効状態', () => {
    test('disabled のときはクリックしても開かないこと', async () => {
      const user = userEvent.setup();
      const { container } = render(<Select options={FIXTURE_OPTIONS} disabled />);
      await user.click(getTrigger(container));
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(getTrigger(container)).toHaveClass('cursor-not-allowed');
    });
  });

  describe('モバイル', () => {
    test('モバイル幅ではボトムドロワーで開き、背景クリックで閉じること', async () => {
      setViewportWidth(MOBILE_WIDTH);
      const user = userEvent.setup();
      const { container } = render(<Select options={FIXTURE_OPTIONS} />);
      await user.click(getTrigger(container));
      const listbox = await screen.findByRole('listbox');
      expect(listbox).toHaveClass('py-4');
      await user.click(container.querySelector('.bg-bg-overlay') as HTMLElement);
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    });

    test('選んで閉じた直後に開き直しても、ドロワーが表示されたままであること', async () => {
      setViewportWidth(MOBILE_WIDTH);
      const user = userEvent.setup();
      const { container } = render(<Select options={FIXTURE_OPTIONS} />);
      const trigger = getTrigger(container);
      await user.click(trigger);
      // requestAnimationFrame で開き切るのを待ってから選ぶ
      await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));
      await user.click(screen.getByRole('option', { name: 'りんご' }));
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      // 閉じる遅延（300ms）が終わる前に開き直す
      await user.click(trigger);
      await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });
  });
});
