import { describe, test, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchInput } from './search-input';

const DESKTOP_WIDTH = 1024;
const MOBILE_WIDTH = 500;

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

function Harness({ onCleared }: { onCleared?: () => void }) {
  const [value, setValue] = useState('');
  return (
    <SearchInput
      value={value}
      placeholder="COMMON.SEARCH"
      ariaLabel="COMMON.SEARCH"
      dataTestid="search"
      onValueChange={setValue}
      onCleared={onCleared}
    />
  );
}

afterEach(() => {
  setViewportWidth(DESKTOP_WIDTH);
});

describe('SearchInput', () => {
  describe('初期表示', () => {
    test('プレースホルダーと aria-label が翻訳キーで表示され、クリアボタンは出ないこと', () => {
      render(<Harness />);
      const input = screen.getByRole('textbox', { name: 'COMMON.SEARCH' });
      expect(input).toHaveAttribute('placeholder', 'COMMON.SEARCH');
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    test('size=small のときデスクトップでは幅 160px になること', () => {
      const { container } = render(<SearchInput size="small" />);
      expect(container.firstChild).toHaveStyle({ width: '160px' });
      expect(screen.getByRole('textbox')).toHaveClass('h-9', 'text-xs');
    });

    test('size=small でもモバイルでは幅いっぱいになること', () => {
      setViewportWidth(MOBILE_WIDTH);
      const { container } = render(<SearchInput size="small" />);
      expect(container.firstChild).toHaveStyle({ width: '100%' });
    });
  });

  describe('入力とクリア', () => {
    test('入力した値が通知され、クリアボタンで空にできること', async () => {
      const onCleared = vi.fn();
      const user = userEvent.setup();
      render(<Harness onCleared={onCleared} />);
      await user.type(screen.getByTestId('search'), 'abc');
      expect(screen.getByTestId('search')).toHaveValue('abc');
      await user.click(screen.getByRole('button', { name: 'COMMON.CLEAR' }));
      expect(screen.getByTestId('search')).toHaveValue('');
      expect(onCleared).toHaveBeenCalledTimes(1);
    });

    test('値があってフォーカスしていないとき入力済みの色になること', () => {
      render(<SearchInput value="abc" />);
      expect(screen.getByRole('textbox')).toHaveClass('text-brand-secondary');
    });

    test('showClearButton=false のときクリアボタンが出ないこと', () => {
      render(<SearchInput value="abc" showClearButton={false} />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });
});
