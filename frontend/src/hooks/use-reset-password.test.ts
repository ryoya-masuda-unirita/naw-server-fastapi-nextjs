import { describe, test, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { useResetPasswordMutation } from './use-reset-password';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useResetPasswordMutation', () => {
  test('パスワードリセット成功時に AuthSessionResponse を返すこと', async () => {
    const { result } = renderHook(() => useResetPasswordMutation(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      username: 'user',
      oldPassword: 'oldpass',
      newPassword: 'NewPass123',
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.id).toBe('user');
    expect(result.current.data?.name).toBe('Reset User');
  });

  test('新パスワードが短い場合にエラーになること', async () => {
    const { result } = renderHook(() => useResetPasswordMutation(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      username: 'user',
      oldPassword: 'oldpass',
      newPassword: 'short',
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
