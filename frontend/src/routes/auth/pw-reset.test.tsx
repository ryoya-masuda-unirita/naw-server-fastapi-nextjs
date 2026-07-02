import { describe, test, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { PwResetPage } from './pw-reset';

const renderPwReset = (search = '') => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        MemoryRouter,
        { initialEntries: [`/auth/pw-reset${search}`] },
        createElement(PwResetPage)
      )
    ) as ReactNode
  );
};

describe('PwResetPage', () => {
  describe('初期表示', () => {
    test('4つの入力フィールドと送信ボタンが表示されること', () => {
      renderPwReset();

      const inputs = document.querySelectorAll('input');
      expect(inputs).toHaveLength(4);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    test('reason=INITIAL のとき INITIAL メッセージが表示されること', () => {
      renderPwReset('?username=user&reason=INITIAL');

      expect(screen.getByText('AUTH.PW_RESET.REASON_INITIAL')).toBeInTheDocument();
    });

    test('reason=EXPIRED のとき EXPIRED メッセージが表示されること', () => {
      renderPwReset('?username=user&reason=EXPIRED');

      expect(screen.getByText('AUTH.PW_RESET.REASON_EXPIRED')).toBeInTheDocument();
    });

    test('クエリパラメータから username が自動填入されること', async () => {
      renderPwReset('?username=testuser&oldPassword=oldpass');

      await waitFor(() => {
        const inputs = document.querySelectorAll('input') as NodeListOf<HTMLInputElement>;
        expect(inputs[0].value).toBe('testuser');
        expect(inputs[1].value).toBe('oldpass');
      });
    });
  });

  describe('バリデーション', () => {
    test('newPassword と confirmPassword が異なる場合にエラーが表示されること', async () => {
      renderPwReset();
      const user = userEvent.setup();

      const inputs = document.querySelectorAll('input');
      await user.type(inputs[0], 'testuser');
      await user.type(inputs[1], 'oldpass');
      await user.type(inputs[2], 'NewPass123');
      await user.type(inputs[3], 'DifferentPass');
      await user.click(screen.getByRole('button'));

      expect(screen.getByText('VALIDATION.PASSWORD_MISMATCH')).toBeInTheDocument();
    });
  });

  describe('パスワードリセット成功', () => {
    test('正常なリセットで mutation が呼ばれること', async () => {
      renderPwReset();
      const user = userEvent.setup();

      const inputs = document.querySelectorAll('input');
      await user.type(inputs[0], 'user');
      await user.type(inputs[1], 'oldpass');
      await user.type(inputs[2], 'NewPass123');
      await user.type(inputs[3], 'NewPass123');
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeDisabled();
      });
    });
  });
});
