import { describe, test, expect, vi, afterEach } from 'vitest';
import { act, createRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { queryMatIcon, querySvgIcon } from './icons/test-helpers';
import { ContextMenu, type ContextMenuHandle } from './context-menu';

const DESKTOP_WIDTH = 1024;
const MOBILE_WIDTH = 375;

function setWidth(width: number) {
  window.innerWidth = width;
  window.dispatchEvent(new Event('resize'));
}

afterEach(() => {
  setWidth(DESKTOP_WIDTH);
});

describe('ContextMenu', () => {
  describe('デスクトップ', () => {
    test('トリガーで開き、項目をクリックすると閉じること', async () => {
      const onEdit = vi.fn();
      render(
        <ContextMenu
          triggerTestid="menu-trigger"
          menu={
            <button type="button" onClick={onEdit}>
              編集
            </button>
          }
        />,
      );
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      await userEvent.click(screen.getByTestId('menu-trigger'));
      const menu = await screen.findByRole('menu');
      expect(menu).toHaveClass('min-w-60', 'shadow-default');
      await userEvent.click(screen.getByRole('button', { name: '編集' }));
      expect(onEdit).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    });

    test('closeOnContentClick が false なら中身をクリックしても閉じないこと', async () => {
      render(<ContextMenu triggerTestid="t" closeOnContentClick={false} menu={<span>中身</span>} />);
      await userEvent.click(screen.getByTestId('t'));
      await userEvent.click(await screen.findByText('中身'));
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    test('背景をクリックすると閉じること', async () => {
      render(<ContextMenu triggerTestid="t" menu={<span>中身</span>} />);
      await userEvent.click(screen.getByTestId('t'));
      await screen.findByRole('menu');
      await userEvent.click(screen.getByTestId('context-menu-backdrop'));
      await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    });

    test('トリガーアイコンを指定しないと歯車の SVG を出すこと', () => {
      const { container, rerender } = render(<ContextMenu triggerTestid="t" menu={null} />);
      expect(querySvgIcon(container, 'settings')).toBeInTheDocument();
      rerender(<ContextMenu triggerTestid="t" triggerIcon="more_vert" menu={null} />);
      expect(queryMatIcon(container, 'more_vert')).toBeInTheDocument();
    });

    test('customTrigger で独自のトリガーを使えること', async () => {
      render(<ContextMenu customTrigger={<span>開く</span>} menu={<span>中身</span>} />);
      await userEvent.click(screen.getByText('開く'));
      expect(await screen.findByText('中身')).toBeInTheDocument();
    });

    test('ref から開閉できること', async () => {
      const ref = createRef<ContextMenuHandle>();
      render(<ContextMenu ref={ref} menu={<span>中身</span>} />);
      act(() => ref.current?.open());
      expect(await screen.findByText('中身')).toBeInTheDocument();
      act(() => ref.current?.close());
      await waitFor(() => expect(screen.queryByText('中身')).not.toBeInTheDocument());
    });
  });

  describe('モバイル', () => {
    test('下からのドロワーで開き、関数で受け取った close で閉じられること', async () => {
      setWidth(MOBILE_WIDTH);
      render(
        <ContextMenu
          triggerTestid="t"
          menu={({ close }) => (
            <button type="button" onClick={close}>
              削除
            </button>
          )}
        />,
      );
      await userEvent.click(screen.getByTestId('t'));
      const menu = await screen.findByRole('menu');
      expect(menu.parentElement).toHaveClass('rounded-t-2xl');
      await waitFor(() => expect(menu.parentElement).not.toHaveClass('translate-y-full'));
      await userEvent.click(screen.getByRole('button', { name: '削除' }));
      await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    });
  });
});
