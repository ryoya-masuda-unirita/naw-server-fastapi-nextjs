import { afterEach, describe, expect, test, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChunkSelect } from './chunk-select';

const DESKTOP_WIDTH = 1024;
const MOBILE_WIDTH = 375;
const FIXTURE_NUMERIC_VALUE = '500';

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

describe('ChunkSelect', () => {
  describe('初期表示', () => {
    test('未選択ならプレースホルダーが表示されること', () => {
      render(<ChunkSelect />);
      expect(screen.getByText('チャンク分割を選択')).toBeInTheDocument();
    });

    test('選択肢にない数値は数値そのものが表示されること', () => {
      render(<ChunkSelect value="1200" />);
      expect(screen.getByText('1200')).toBeInTheDocument();
    });

    test('error を渡すとエラー枠になること', () => {
      const { container } = render(<ChunkSelect error="必須です" />);
      expect(getTrigger(container)).toHaveClass('has-error');
    });
  });

  describe('選択', () => {
    test('大・中・小と数値指定の選択肢が開くこと', async () => {
      const user = userEvent.setup();
      const { container } = render(<ChunkSelect />);
      await user.click(getTrigger(container));
      await screen.findByRole('listbox');
      expect(screen.getByText('大')).toBeInTheDocument();
      expect(screen.getByText('中')).toBeInTheDocument();
      expect(screen.getByText('小')).toBeInTheDocument();
      expect(screen.getByText('数値を指定')).toBeInTheDocument();
    });

    test('選択肢を選ぶと値が通知されて閉じること', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const onSelectionChange = vi.fn();
      const { container } = render(<ChunkSelect onValueChange={onValueChange} onSelectionChange={onSelectionChange} />);
      await user.click(getTrigger(container));
      await user.click(await screen.findByText('中'));
      expect(onValueChange).toHaveBeenCalledWith('medium');
      expect(onSelectionChange).toHaveBeenCalledWith('medium');
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
      expect(screen.getByText('中')).toBeInTheDocument();
    });

    test('選択中の選択肢に data-selected が付くこと', async () => {
      const user = userEvent.setup();
      const { container } = render(<ChunkSelect value="small" />);
      await user.click(getTrigger(container));
      await screen.findByRole('listbox');
      const selected = container.querySelector('.dl-option[data-selected="true"]');
      expect(selected).toHaveTextContent('小');
    });
  });

  describe('数値指定', () => {
    test('数値を入力して確定できること', async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      const { container } = render(<ChunkSelect onSelectionChange={onSelectionChange} />);
      await user.click(getTrigger(container));
      await user.click(await screen.findByText('数値を指定'));
      await user.type(screen.getByPlaceholderText('数値を入力'), FIXTURE_NUMERIC_VALUE);
      await user.click(screen.getByRole('button', { name: 'COMMON.CONFIRM_SELECTION' }));
      expect(onSelectionChange).toHaveBeenCalledWith(FIXTURE_NUMERIC_VALUE);
      expect(screen.getByText(FIXTURE_NUMERIC_VALUE)).toBeInTheDocument();
    });

    test('0 以下の数値は確定できないこと', async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      const { container } = render(<ChunkSelect onSelectionChange={onSelectionChange} />);
      await user.click(getTrigger(container));
      await user.click(await screen.findByText('数値を指定'));
      await user.type(screen.getByPlaceholderText('数値を入力'), '0');
      await user.click(screen.getByRole('button', { name: 'COMMON.CONFIRM_SELECTION' }));
      expect(onSelectionChange).not.toHaveBeenCalled();
    });

    test('キャンセルで数値入力パネルを閉じられること', async () => {
      const user = userEvent.setup();
      const { container } = render(<ChunkSelect />);
      await user.click(getTrigger(container));
      await user.click(await screen.findByText('数値を指定'));
      expect(screen.getByPlaceholderText('数値を入力')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'COMMON.CANCEL' }));
      expect(screen.queryByPlaceholderText('数値を入力')).not.toBeInTheDocument();
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });
  });

  describe('クリア', () => {
    test('クリアボタンで値を空にでき、selectionChange には空文字が渡ること', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const onSelectionChange = vi.fn();
      const { container } = render(
        <ChunkSelect value="large" onValueChange={onValueChange} onSelectionChange={onSelectionChange} />,
      );
      await user.click(container.querySelector('.trigger-wrapper button') as HTMLElement);
      expect(onValueChange).toHaveBeenCalledWith(null);
      expect(onSelectionChange).toHaveBeenCalledWith('');
      expect(screen.getByText('チャンク分割を選択')).toBeInTheDocument();
    });
  });

  describe('無効状態', () => {
    test('disabled のときは開かず、クリアボタンも出ないこと', async () => {
      const user = userEvent.setup();
      const { container } = render(<ChunkSelect value="large" disabled />);
      expect(container.querySelector('.trigger-wrapper button')).toBeNull();
      await user.click(getTrigger(container));
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(getTrigger(container)).toHaveClass('disabled');
    });
  });

  describe('モバイル', () => {
    test('モバイル幅ではドロワー内で数値入力に切り替わり、戻るボタンで一覧に戻れること', async () => {
      setViewportWidth(MOBILE_WIDTH);
      const user = userEvent.setup();
      const { container } = render(<ChunkSelect />);
      await user.click(getTrigger(container));
      await user.click(await screen.findByText('数値を指定'));
      expect(screen.getByPlaceholderText('数値を入力')).toBeInTheDocument();
      expect(screen.queryByText('大')).not.toBeInTheDocument();
      await user.click(container.querySelector('.px-4.pt-2 button') as HTMLElement);
      expect(screen.getByText('大')).toBeInTheDocument();
    });
  });
});
