import { describe, test, expect } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

    test.each([
      ['未入力', ''],
      ['空白のみ', '   '],
    ])('テナントIDが%sだとログインリクエストが送られないこと', async (_label, tenantIdValue) => {
      let loginCalled = false;
      server.use(
        http.post(`${BASE_URL}/auth/login`, () => {
          loginCalled = true;
          return HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 });
        })
      );
      renderLogin();
      const user = userEvent.setup();
      const { tenantIdInput, usernameInput, passwordInput, submitButton } = getInputs();

      if (tenantIdValue) await user.type(tenantIdInput, tenantIdValue);
      await user.type(usernameInput, 'user');
      await user.type(passwordInput, 'pass');
      // required 属性によるブラウザ側の検証を通さず、handleSubmit 内のガードを直接確かめる
      await act(async () => {
        fireEvent.submit(submitButton.closest('form')!);
      });

      // 送信処理に進めば同期的にローディング状態（disabled）になる
      expect(submitButton).not.toBeDisabled();
      expect(loginCalled).toBe(false);
    });

    test('前後の空白を除いたテナントIDが X-Tenant-ID ヘッダで送られること', async () => {
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

      await user.type(tenantIdInput, `  ${FIXTURE_TENANT_ID}  `);
      await user.type(usernameInput, 'user');
      await user.type(passwordInput, 'pass');
      await user.click(submitButton);

      await waitFor(() => {
        expect(tenantHeader).toBe(FIXTURE_TENANT_ID);
      });
    });
  });

  describe('入力チェック', () => {
    const watchLoginRequest = () => {
      const state = { called: false };
      server.use(
        http.post(`${BASE_URL}/auth/login`, () => {
          state.called = true;
          return HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 });
        })
      );
      return state;
    };

    test('ユーザーIDとパスワードが未入力だと両方に必須エラーが出て認証 API を呼ばないこと', async () => {
      const request = watchLoginRequest();
      renderLogin();
      const user = userEvent.setup();
      const { tenantIdInput, submitButton } = getInputs();

      await user.type(tenantIdInput, FIXTURE_TENANT_ID);
      await user.click(submitButton);

      expect(screen.getAllByText('VALIDATION.REQUIRED')).toHaveLength(2);
      expect(request.called).toBe(false);
    });

    test('ユーザーIDだけ未入力だと必須エラーが1つ出ること', async () => {
      const request = watchLoginRequest();
      renderLogin();
      const user = userEvent.setup();
      const { tenantIdInput, passwordInput, submitButton } = getInputs();

      await user.type(tenantIdInput, FIXTURE_TENANT_ID);
      await user.type(passwordInput, 'pass');
      await user.click(submitButton);

      expect(screen.getAllByText('VALIDATION.REQUIRED')).toHaveLength(1);
      expect(request.called).toBe(false);
    });

    test('パスワードだけ未入力だと必須エラーが1つ出ること', async () => {
      const request = watchLoginRequest();
      renderLogin();
      const user = userEvent.setup();
      const { tenantIdInput, usernameInput, submitButton } = getInputs();

      await user.type(tenantIdInput, FIXTURE_TENANT_ID);
      await user.type(usernameInput, 'user');
      await user.click(submitButton);

      expect(screen.getAllByText('VALIDATION.REQUIRED')).toHaveLength(1);
      expect(request.called).toBe(false);
    });

    test('ユーザーIDが2文字だと最小文字数エラーが出て認証 API を呼ばないこと', async () => {
      const request = watchLoginRequest();
      renderLogin();
      const user = userEvent.setup();
      const { tenantIdInput, usernameInput, passwordInput, submitButton } = getInputs();

      await user.type(tenantIdInput, FIXTURE_TENANT_ID);
      await user.type(usernameInput, 'ab');
      await user.type(passwordInput, 'pass');
      await user.click(submitButton);

      expect(screen.getByText('VALIDATION.MIN_LENGTH')).toBeInTheDocument();
      expect(request.called).toBe(false);
    });

    test('ユーザーIDが51文字だと最大文字数エラーが出ること', async () => {
      const request = watchLoginRequest();
      renderLogin();
      const user = userEvent.setup();
      const { tenantIdInput, usernameInput, passwordInput, submitButton } = getInputs();

      await user.type(tenantIdInput, FIXTURE_TENANT_ID);
      await user.type(usernameInput, 'a'.repeat(51));
      await user.type(passwordInput, 'pass');
      await user.click(submitButton);

      expect(screen.getByText('VALIDATION.MAX_LENGTH')).toBeInTheDocument();
      expect(request.called).toBe(false);
    });

    test('テナントIDが未入力だと必須エラーが出ること', async () => {
      const request = watchLoginRequest();
      renderLogin();
      const user = userEvent.setup();
      const { usernameInput, passwordInput, submitButton } = getInputs();

      await user.type(usernameInput, 'user');
      await user.type(passwordInput, 'pass');
      await user.click(submitButton);

      expect(screen.getAllByText('VALIDATION.REQUIRED')).toHaveLength(1);
      expect(request.called).toBe(false);
    });

    test('パスワード欄は全角文字を取り除き64文字までしか入力できないこと', async () => {
      renderLogin();
      const user = userEvent.setup();
      const { passwordInput } = getInputs();

      await user.type(passwordInput, 'あab');
      expect(passwordInput.value).toBe('ab');

      await user.clear(passwordInput);
      fireEvent.change(passwordInput, { target: { value: 'a'.repeat(70) } });
      expect(passwordInput.value).toHaveLength(64);
    });

    test('エラー表示後に入力を直すとエラーが消えること', async () => {
      renderLogin();
      const user = userEvent.setup();
      const { tenantIdInput, usernameInput, passwordInput, submitButton } = getInputs();

      await user.type(tenantIdInput, FIXTURE_TENANT_ID);
      await user.type(passwordInput, 'pass');
      await user.click(submitButton);
      expect(screen.getByText('VALIDATION.REQUIRED')).toBeInTheDocument();

      await user.type(usernameInput, 'user');
      expect(screen.queryByText('VALIDATION.REQUIRED')).not.toBeInTheDocument();
    });

    test('フォームにブラウザ標準の検証が付かないこと', () => {
      renderLogin();

      expect(getInputs().submitButton.closest('form')).toHaveAttribute('noValidate');
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
