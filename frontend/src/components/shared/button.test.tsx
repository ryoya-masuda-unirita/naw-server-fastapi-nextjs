import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';

describe('Button', () => {
  describe('見た目', () => {
    test('既定は solid の md で、ホスト要素に app-button と className が付くこと', () => {
      render(<Button className="dialog-cancel-btn">保存</Button>);
      const button = screen.getByRole('button', { name: '保存' });
      expect(button).toHaveClass('bg-brand-primary', 'h-10');
      expect(button.parentElement).toHaveClass('app-button', 'inline-block', 'dialog-cancel-btn');
    });

    test('outline の cancel intent はグレーの枠線になること', () => {
      render(
        <Button variant="outline" intent="cancel">
          キャンセル
        </Button>,
      );
      expect(screen.getByRole('button')).toHaveClass('border-border-strong', 'text-text-medium');
    });

    test('danger は赤背景になること', () => {
      render(<Button variant="danger">削除</Button>);
      expect(screen.getByRole('button')).toHaveClass('bg-status-error');
    });

    test('heightPx で高さを上書きできること', () => {
      render(<Button heightPx={54}>送信</Button>);
      expect(screen.getByRole('button')).toHaveStyle({ height: '54px' });
    });

    test('無効のときは classProps を付けず無効色になること', () => {
      render(
        <Button disabled classProps="extra-class">
          送信
        </Button>,
      );
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveClass('bg-text-disabled');
      expect(button).not.toHaveClass('extra-class');
    });

    test('アイコンを左に置けること', () => {
      render(
        <Button icon={<span data-testid="icon" />} iconPosition="left">
          ログイン
        </Button>,
      );
      expect(screen.getByTestId('icon').parentElement).toHaveClass('order-0');
    });
  });

  describe('クリック', () => {
    test('クリックで onClick が呼ばれること', async () => {
      const onClick = vi.fn();
      render(<Button onClick={onClick}>保存</Button>);
      await userEvent.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    test('読み込み中は押せないこと', async () => {
      const onClick = vi.fn();
      render(
        <Button loading onClick={onClick}>
          保存
        </Button>,
      );
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveClass('cursor-wait');
      await userEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });
  });
});
