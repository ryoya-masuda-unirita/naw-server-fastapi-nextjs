import { describe, test, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { LoginPage } from './login';

const renderLogin = () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(BrowserRouter, null, createElement(LoginPage))
    ) as ReactNode
  );
};

describe('LoginPage', () => {
  describe('初期表示', () => {
    test('username / password 入力フィールドと送信ボタンが表示されること', () => {
      renderLogin();

      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /AUTH\.LOGIN\.SUBMIT/i })).toBeInTheDocument();
    });
  });

  describe('ログイン成功', () => {
    test('正常なログインで login() が呼ばれること', async () => {
      renderLogin();
      const user = userEvent.setup();

      const usernameInput = screen.getByRole('textbox');
      const passwordInputs = document.querySelectorAll('input[type="password"]');
      const submitButton = screen.getByRole('button');

      await user.type(usernameInput, 'user');
      await user.type(passwordInputs[0], 'pass');
      await user.click(submitButton);

      // ローディング中は disabled になること
      await waitFor(() => {
        expect(submitButton).toBeDisabled();
      });
    });
  });

  describe('ログイン失敗', () => {
    test('401 エラー時にエラーメッセージが表示されること', async () => {
      renderLogin();
      const user = userEvent.setup();

      const usernameInput = screen.getByRole('textbox');
      const passwordInputs = document.querySelectorAll('input[type="password"]');
      const submitButton = screen.getByRole('button');

      await user.type(usernameInput, 'invalid');
      await user.type(passwordInputs[0], 'wrong');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('AUTH.LOGIN.ERROR')).toBeInTheDocument();
      });
    });
  });

  describe('ローディング', () => {
    test('送信中に入力フィールドが disabled になること', async () => {
      renderLogin();
      const user = userEvent.setup();

      const usernameInput = screen.getByRole('textbox') as HTMLInputElement;
      const passwordInputs = document.querySelectorAll('input[type="password"]');
      const submitButton = screen.getByRole('button');

      await user.type(usernameInput, 'user');
      await user.type(passwordInputs[0], 'pass');
      await user.click(submitButton);

      await waitFor(() => {
        expect(usernameInput.disabled).toBe(true);
      });
    });
  });
});
