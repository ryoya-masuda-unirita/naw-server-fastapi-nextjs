import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { server } from '@/test/setup';
import { mockPath } from '@/mocks/utils';
import { API_PATHS } from '@/lib/constants/api-paths';
import { ROUTES } from '@/lib/constants/routes';
import { useToastStore } from '@/components/shared/toast-store';
import { useAuthStore } from '@/store/auth-store';
import { PwResetPage } from './pw-reset';

const FIXTURE_NEW_PASSWORD = 'NewPass123';

function LocationProbe() {
  const location = useLocation();
  return createElement('div', { 'data-testid': 'location' }, location.pathname);
}

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
        { initialEntries: [`${ROUTES.AUTH.PW_RESET}${search}`] },
        createElement(
          Routes,
          null,
          createElement(Route, { path: ROUTES.AUTH.PW_RESET, element: createElement(PwResetPage) }),
          createElement(Route, { path: '*', element: createElement(LocationProbe) })
        )
      )
    ) as ReactNode
  );
};

const getInputs = () => {
  const inputs = document.querySelectorAll('input') as NodeListOf<HTMLInputElement>;
  return {
    username: inputs[0],
    oldPassword: inputs[1],
    newPassword: inputs[2],
    confirmPassword: inputs[3],
  };
};

const getSubmitButton = () => screen.getByRole('button', { name: /AUTH\.PW_RESET\.SUBMIT/i });

const mockResetError = (status: number, message?: string) => {
  server.use(
    http.post(mockPath(API_PATHS.AUTH.PASSWORD_RESET), () =>
      HttpResponse.json(message === undefined ? {} : { message }, { status })
    )
  );
};

beforeEach(() => {
  useToastStore.getState().clear();
  useAuthStore.setState({ user: null });
});

describe('PwResetPage', () => {
  describe('初期表示', () => {
    test('4つの入力フィールドと送信ボタンが表示されること', () => {
      renderPwReset();

      expect(document.querySelectorAll('input')).toHaveLength(4);
      expect(getSubmitButton()).toBeInTheDocument();
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
        const { username, oldPassword } = getInputs();
        expect(username.value).toBe('testuser');
        expect(oldPassword.value).toBe('oldpass');
      });
    });

    test('クエリに username がなければログイン中のユーザーの ID が入ること', () => {
      useAuthStore.setState({
        user: { id: 'logged-in-user', name: 'Logged In', role: 'USER', groups: [] },
      });
      renderPwReset();

      expect(getInputs().username.value).toBe('logged-in-user');
    });

    test('ログインID欄は編集できないこと', () => {
      renderPwReset('?username=testuser');

      expect(getInputs().username).toBeDisabled();
    });

    test('フォームにブラウザ標準の検証が付かないこと', () => {
      renderPwReset();

      expect(getSubmitButton().closest('form')).toHaveAttribute('noValidate');
    });
  });

  describe('入力チェック', () => {
    test('旧パスワード・新パスワード・再入力が未入力だと、それぞれの欄に必須エラーが出ること', async () => {
      renderPwReset('?username=testuser');
      const user = userEvent.setup();

      await user.click(getSubmitButton());

      expect(screen.getAllByText('VALIDATION.REQUIRED')).toHaveLength(3);
    });

    test('旧パスワードだけ未入力だと必須エラーが1つ出ること', async () => {
      renderPwReset('?username=testuser');
      const user = userEvent.setup();
      const inputs = getInputs();

      await user.type(inputs.newPassword, FIXTURE_NEW_PASSWORD);
      await user.type(inputs.confirmPassword, FIXTURE_NEW_PASSWORD);
      await user.click(getSubmitButton());

      expect(screen.getAllByText('VALIDATION.REQUIRED')).toHaveLength(1);
    });

    test('新パスワードだけ未入力だと、新パスワード欄に必須、再入力欄に不一致が出ること', async () => {
      renderPwReset('?username=testuser');
      const user = userEvent.setup();
      const inputs = getInputs();

      await user.type(inputs.oldPassword, 'oldpass');
      await user.type(inputs.confirmPassword, FIXTURE_NEW_PASSWORD);
      await user.click(getSubmitButton());

      expect(screen.getAllByText('VALIDATION.REQUIRED')).toHaveLength(1);
      expect(screen.getByText('VALIDATION.PASSWORD_MISMATCH')).toBeInTheDocument();
    });

    test('再入力だけ未入力だと、必須ではなく不一致が出ること', async () => {
      renderPwReset('?username=testuser');
      const user = userEvent.setup();
      const inputs = getInputs();

      await user.type(inputs.oldPassword, 'oldpass');
      await user.type(inputs.newPassword, FIXTURE_NEW_PASSWORD);
      await user.click(getSubmitButton());

      expect(screen.getByText('VALIDATION.PASSWORD_MISMATCH')).toBeInTheDocument();
      expect(screen.queryByText('VALIDATION.REQUIRED')).not.toBeInTheDocument();
    });

    test('newPassword と confirmPassword が異なる場合に不一致エラーが出てリクエストを送らないこと', async () => {
      let called = false;
      server.use(
        http.post(mockPath(API_PATHS.AUTH.PASSWORD_RESET), () => {
          called = true;
          return HttpResponse.json({});
        })
      );
      renderPwReset('?username=testuser');
      const user = userEvent.setup();
      const inputs = getInputs();

      await user.type(inputs.oldPassword, 'oldpass');
      await user.type(inputs.newPassword, FIXTURE_NEW_PASSWORD);
      await user.type(inputs.confirmPassword, 'DifferentPass');
      await user.click(getSubmitButton());

      expect(screen.getByText('VALIDATION.PASSWORD_MISMATCH')).toBeInTheDocument();
      expect(called).toBe(false);
    });

    test('新パスワード欄は全角文字を取り除き64文字までしか入力できないこと', async () => {
      renderPwReset('?username=testuser');
      const user = userEvent.setup();
      const { newPassword } = getInputs();

      await user.type(newPassword, 'あab');
      expect(newPassword.value).toBe('ab');
    });
  });

  describe('パスワードリセット成功', () => {
    test('成功メッセージのトーストを出してダッシュボードへ遷移すること', async () => {
      renderPwReset('?username=testuser');
      const user = userEvent.setup();
      const inputs = getInputs();

      await user.type(inputs.oldPassword, 'oldpass');
      await user.type(inputs.newPassword, FIXTURE_NEW_PASSWORD);
      await user.type(inputs.confirmPassword, FIXTURE_NEW_PASSWORD);
      await user.click(getSubmitButton());

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.APP.DASHBOARD);
      });
      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0]).toMatchObject({ type: 'success', message: 'AUTH.PW_RESET.SUCCESS' });
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });
  });

  describe('パスワードリセット失敗', () => {
    const submitWithValidInputs = async () => {
      renderPwReset('?username=testuser');
      const user = userEvent.setup();
      const inputs = getInputs();

      await user.type(inputs.oldPassword, 'oldpass');
      await user.type(inputs.newPassword, FIXTURE_NEW_PASSWORD);
      await user.type(inputs.confirmPassword, FIXTURE_NEW_PASSWORD);
      await user.click(getSubmitButton());
    };

    test('403 のとき backend のメッセージがログインID欄の下に出ること', async () => {
      mockResetError(403, 'ログインIDまたは旧パスワードが正しくありません。');

      await submitWithValidInputs();

      expect(
        await screen.findByText('ログインIDまたは旧パスワードが正しくありません。')
      ).toBeInTheDocument();
      expect(screen.queryByText('HTTP 403')).not.toBeInTheDocument();
    });

    test('400 のとき backend のメッセージが新パスワード欄の下に出ること', async () => {
      mockResetError(400, '新パスワードは8文字以上で入力してください。');

      await submitWithValidInputs();

      expect(
        await screen.findByText('新パスワードは8文字以上で入力してください。')
      ).toBeInTheDocument();
      expect(screen.queryByText('HTTP 400')).not.toBeInTheDocument();
    });

    test('429 のとき試行回数上限の文言が出ること', async () => {
      mockResetError(429);

      await submitWithValidInputs();

      expect(await screen.findByText('AUTH.LOGIN.PASSWORD_RATELIMIT')).toBeInTheDocument();
    });

    test('失敗してもトーストは出ず、入力を直すとエラーが消えること', async () => {
      mockResetError(403, 'ログインIDまたは旧パスワードが正しくありません。');

      await submitWithValidInputs();
      await screen.findByText('ログインIDまたは旧パスワードが正しくありません。');
      const user = userEvent.setup();
      await user.type(getInputs().oldPassword, 'x');

      expect(
        screen.queryByText('ログインIDまたは旧パスワードが正しくありません。')
      ).not.toBeInTheDocument();
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });
  });
});
