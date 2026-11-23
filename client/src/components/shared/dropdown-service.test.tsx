import { describe, test, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { DropdownBackdrop } from './dropdown-backdrop';
import { dropdownService } from './dropdown-service';

const DESKTOP_WIDTH = 1024;
const MOBILE_WIDTH = 375;

afterEach(() => {
  dropdownService.closeAll();
  window.innerWidth = DESKTOP_WIDTH;
});

describe('dropdownService', () => {
  test('別のドロップダウンを開くと前のものが閉じること', () => {
    const closeFirst = vi.fn();
    const closeSecond = vi.fn();
    dropdownService.open(closeFirst);
    dropdownService.open(closeSecond);
    expect(closeFirst).toHaveBeenCalledTimes(1);
    expect(closeSecond).not.toHaveBeenCalled();
  });

  test('画面のどこかをクリックすると開いているドロップダウンが閉じること', () => {
    const close = vi.fn();
    dropdownService.open(close);
    document.body.click();
    expect(close).toHaveBeenCalledTimes(1);
  });

  test('自分で閉じたと通知したあとは、クリックで閉じる処理が呼ばれないこと', () => {
    const close = vi.fn();
    dropdownService.open(close);
    dropdownService.notifyClosed();
    document.body.click();
    expect(close).not.toHaveBeenCalled();
  });

  test('モバイル幅のときだけ暗幕を表示すること', () => {
    const { container } = render(<DropdownBackdrop />);
    const backdrop = container.querySelector('#dropdown-backdrop') as HTMLElement;

    dropdownService.open(vi.fn());
    expect(backdrop).not.toHaveClass('is-visible');
    dropdownService.closeAll();

    window.innerWidth = MOBILE_WIDTH;
    dropdownService.open(vi.fn());
    expect(backdrop).toHaveClass('dropdown-backdrop', 'is-visible');
    dropdownService.closeAll();
    expect(backdrop).not.toHaveClass('is-visible');
  });
});
