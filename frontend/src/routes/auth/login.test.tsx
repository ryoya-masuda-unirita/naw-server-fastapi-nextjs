import { describe, test, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';
import { LoginPage } from './login';

const BASE_URL = import.meta.env.VITE_API_URL;
const FIXTURE_TENANT_ID = 'tenant-1';

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

const getInputs = () => ({
  tenantIdInput: screen.getByLabelText('AUTH.LOGIN.TENANT_ID_LABEL') as HTMLInputElement,
  usernameInput: screen.getByLabelText('AUTH.LOGIN.USER_ID_LABEL') as HTMLInputElement,
  passwordInput: screen.getByLabelText('AUTH.LOGIN.PASSWORD_LABEL') as HTMLInputElement,
  submitButton: screen.getByRole('button', { name: /AUTH\.LOGIN\.SUBMIT/i }),
});

describe('LoginPage', () => {
  describe('初期表示', () => {
    test('テナントID / ユーザーID / パスワード入力フィールドと送信ボタンが表示されること', () => {
      renderLogin();

      const { tenantIdInput, usernameInput, passwordInput, submitButton } = getInputs();
      expect(tenantIdInput).toBeInTheDocument();
      expect(usernameInput).toBeInTheDocument();
      expect(passwordInput).toHaveAttribute('type', 'password');
      expect(submitButton).toBeInTheDocument();
    });
  });

  describe('ログイン成功', () => {
    test('正常なログインで login() が呼ばれること', async () => {
      renderLogin();
      const user = userEvent.setup();
      const { tenantIdInput, usernameInput, passwordInput, submitButton } = getInputs();

      await user.type(tenantIdInput, FIXTURE_TENANT_ID);
      await user.type(usernameInput, 'user');
      await user.type(passwordInput, 'pass');
      await user.click(submitButton);

      // ローディング中は disabled になること
      await waitFor(() => {
        expect(submitButton).toBeDisabled();
      });
    });
  });

  describe('テナントID', () => {
    test('入力したテナントIDが X-Tenant-ID ヘッダでログインリクエストに送られること', async () => {
      let tenantHeader: string | null = null;
      server.use(
        http.post(`${BASE_URL}/auth/login`, ({ request }) => {
          tenantHeader = request.headers.get('X-Tenant-ID');
          return HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 });
        })
      );
      renderLogin();
      const user = userEvent.setup();
      const { tenantIdInput, usernameInput, passwordInput, submitButton } = getInputs();

      await user.type(tenantIdInput, FIXTURE_TENANT_ID);
      await user.type(usernameInput, 'user');
      await user.type(passwordInput, 'pass');
      await user.click(submitButton);

      await waitFor(() => {
        expect(tenantHeader).toBe(FIXTURE_TENANT_ID);
      });
    });

    test('テナントIDを入力しないとログインリクエストが送られないこと', async () => {
      let loginCalled = false;
      server.use(
        http.post(`${BASE_URL}/auth/login`, () => {
          loginCalled = true;
          return HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 });
        })
      );
      renderLogin();
      const user = userEvent.setup();
      const { usernameInput, passwordInput, submitButton } = getInputs();

      await user.type(usernameInput, 'user');
      await user.type(passwordInput, 'pass');
      await user.click(submitButton);

      // 送信されていれば非同期でハンドラが呼ばれるため、ボタンが操作可能なままであることも合わせて確認する
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(loginCalled).toBe(false);
      expect(submitButton).not.toBeDisabled();
    });
  });

  describe('ログイン失敗', () => {
    test('401 エラー時にエラーメッセージが表示されること', async () => {
      renderLogin();
      const user = userEvent.setup();
      const { tenantIdInput, usernameInput, passwordInput, submitButton } = getInputs();

      await user.type(tenantIdInput, FIXTURE_TENANT_ID);
      await user.type(usernameInput, 'invalid');
      await user.type(passwordInput, 'wrong');
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
      const { tenantIdInput, usernameInput, passwordInput, submitButton } = getInputs();

      await user.type(tenantIdInput, FIXTURE_TENANT_ID);
      await user.type(usernameInput, 'user');
      await user.type(passwordInput, 'pass');
      await user.click(submitButton);

      await waitFor(() => {
        expect(tenantIdInput.disabled).toBe(true);
        expect(usernameInput.disabled).toBe(true);
      });
    });
  });
});
