import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from './dialog';
import { querySvgIcon } from './icons/test-helpers';

describe('Dialog', () => {
  describe('表示', () => {
    test('open が false のときは何も表示しないこと', () => {
      render(<Dialog open={false} title="ユーザーを削除" />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    test('タイトル・メッセージ・本文を表示すること', () => {
      render(
        <Dialog open title="ユーザーを削除" message="この操作は取り消せません">
          <p>本文</p>
        </Dialog>,
      );
      const dialog = screen.getByRole('dialog', { name: 'ユーザーを削除' });
      expect(dialog).toHaveTextContent('この操作は取り消せません');
      expect(dialog).toHaveTextContent('本文');
    });

    test('Material と同じクラス構造で描画し、パネルの幅とクラスを指定できること', () => {
      render(<Dialog open title="編集" dialogWidth="800px" panelClass="dialog-xl" width="600px" />);
      const pane = document.querySelector('.cdk-overlay-pane.mat-mdc-dialog-panel') as HTMLElement;
      expect(pane).toHaveClass('dialog-xl');
      expect(pane).toHaveStyle({ width: '800px' });
      const surface = document.querySelector('.mdc-dialog__surface') as HTMLElement;
      expect(surface).toHaveStyle({ width: '600px' });
      expect(surface.querySelector('.app-dialog.modal-dialog')).toBeInTheDocument();
    });

    test('ボタンの既定の文言はキャンセルと確認であること', () => {
      render(<Dialog open title="確認" showCancel showConfirm />);
      expect(screen.getByTestId('dialog-cancel-button')).toHaveTextContent('キャンセル');
      expect(screen.getByTestId('dialog-confirm-button')).toHaveTextContent('確認');
    });

    test('キャンセルボタンのホストに dialog-cancel-btn が付くこと', () => {
      render(<Dialog open title="確認" showCancel cancelText="閉じる" />);
      expect(screen.getByTestId('dialog-cancel-button').parentElement).toHaveClass(
        'app-button',
        'dialog-cancel-btn',
        'md:w-auto',
      );
    });

    test('buttonAlign が right のときボタン列を右寄せにすること', () => {
      render(<Dialog open title="確認" showConfirm buttonAlign="right" />);
      const actions = screen.getByTestId('dialog-confirm-button').closest('.flex.w-full');
      expect(actions).toHaveClass('justify-end');
    });

    test('確認ボタンを危険色・削除アイコン付きにできること', () => {
      render(<Dialog open title="削除" showConfirm confirmDanger confirmIcon="delete" confirmText="削除" />);
      const confirm = screen.getByTestId('dialog-confirm-button');
      expect(confirm).toHaveClass('bg-status-error');
      expect(querySvgIcon(confirm, 'delete')).toBeInTheDocument();
    });

    test('確認ボタンを無効・読み込み中にできること', () => {
      const { rerender } = render(<Dialog open title="t" showConfirm confirmDisabled />);
      expect(screen.getByTestId('dialog-confirm-button')).toBeDisabled();
      rerender(<Dialog open title="t" showConfirm confirmLoading />);
      expect(screen.getByTestId('dialog-confirm-button')).toHaveClass('cursor-wait');
    });

    test('customActions を指定すると既定のボタンを出さないこと', () => {
      render(<Dialog open title="t" showConfirm customActions={<button type="button">独自</button>} />);
      expect(screen.getByRole('button', { name: '独自' })).toBeInTheDocument();
      expect(screen.queryByTestId('dialog-confirm-button')).not.toBeInTheDocument();
    });
  });

  describe('閉じる', () => {
    test('確認ボタンは true、キャンセルボタンは false で閉じること', async () => {
      const onClose = vi.fn();
      render(<Dialog open title="t" showCancel showConfirm onClose={onClose} />);
      await userEvent.click(screen.getByTestId('dialog-confirm-button'));
      await userEvent.click(screen.getByTestId('dialog-cancel-button'));
      expect(onClose.mock.calls).toEqual([[true], [false]]);
    });

    test('onConfirm・onCancel を指定すると閉じずにそれを呼ぶこと', async () => {
      const onClose = vi.fn();
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      render(
        <Dialog open title="t" showCancel showConfirm onClose={onClose} onConfirm={onConfirm} onCancel={onCancel} />,
      );
      await userEvent.click(screen.getByTestId('dialog-confirm-button'));
      await userEvent.click(screen.getByTestId('dialog-cancel-button'));
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
    });

    test('×ボタン・Esc・背景クリックで閉じること', async () => {
      const onClose = vi.fn();
      render(<Dialog open title="t" showClose onClose={onClose} />);
      await userEvent.click(screen.getByRole('button', { name: 'Close' }));
      await userEvent.keyboard('{Escape}');
      await userEvent.click(screen.getByTestId('dialog-backdrop'));
      expect(onClose).toHaveBeenCalledTimes(3);
      expect(onClose.mock.calls.every((call) => call[0] === undefined)).toBe(true);
    });

    test('disableClose のときは Esc・背景クリックで閉じないこと', async () => {
      const onClose = vi.fn();
      render(<Dialog open title="t" disableClose onClose={onClose} />);
      await userEvent.keyboard('{Escape}');
      await userEvent.click(screen.getByTestId('dialog-backdrop'));
      expect(onClose).not.toHaveBeenCalled();
    });

    test('左側のアクションボタンを押すと onLeftAction が呼ばれること', async () => {
      const onLeftAction = vi.fn();
      render(<Dialog open title="t" showConfirm leftActionText="無効化" leftActionDanger onLeftAction={onLeftAction} />);
      const button = screen.getByRole('button', { name: '無効化' });
      expect(button).toHaveClass('bg-status-error');
      await userEvent.click(button);
      expect(onLeftAction).toHaveBeenCalledTimes(1);
    });
  });

  describe('背面のスクロール', () => {
    test('重ねて開いたダイアログを開いた順に閉じても、すべて閉じるまでスクロールを止めておくこと', () => {
      const root = document.documentElement;
      root.style.overflow = '';
      const { rerender } = render(
        <>
          <Dialog open title="A" />
          <Dialog open title="B" />
        </>,
      );
      expect(root.style.overflow).toBe('hidden');
      rerender(
        <>
          <Dialog open={false} title="A" />
          <Dialog open title="B" />
        </>,
      );
      expect(root.style.overflow).toBe('hidden');
      rerender(
        <>
          <Dialog open={false} title="A" />
          <Dialog open={false} title="B" />
        </>,
      );
      expect(root.style.overflow).toBe('');
    });
  });

  describe('フォーカス', () => {
    test('開いたら最初の操作可能な要素にフォーカスすること', () => {
      render(
        <Dialog open title="t" showConfirm>
          <input aria-label="名前" />
        </Dialog>,
      );
      expect(screen.getByRole('textbox', { name: '名前' })).toHaveFocus();
    });

    test('autoFocus が false のときは操作可能な要素ではなくダイアログ自体にフォーカスすること', () => {
      render(
        <Dialog open title="t" showConfirm autoFocus={false}>
          <input aria-label="名前" />
        </Dialog>,
      );
      expect(screen.getByRole('textbox', { name: '名前' })).not.toHaveFocus();
      expect(screen.getByRole('dialog', { name: 't' })).toHaveFocus();
    });
  });
});
