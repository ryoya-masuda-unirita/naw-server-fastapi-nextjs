import { beforeEach, describe, expect, test } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';
import { apiClient, persistTenantId, resolveTenantId } from '@/lib/api-client';
import { ROUTES } from '@/lib/constants/routes';
import { useAuthStore } from '@/store/auth-store';
import { useApiErrorInterceptor } from './use-api-error-interceptor';

const FIXTURE_USER = { id: 'u1', name: 'User', role: 'USER' as const, groups: [] };

function Interceptor() {
  useApiErrorInterceptor();
  return null;
}

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/library']}>
      <Interceptor />
      <Routes>
        <Route path="/library" element={<div>library</div>} />
        <Route path={ROUTES.AUTH.LOGIN} element={<div>login</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('useApiErrorInterceptor', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: FIXTURE_USER, isAuthenticated: true });
    sessionStorage.setItem('AUTH_USER', JSON.stringify(FIXTURE_USER));
    persistTenantId('tenant-a');
  });

  test('API が 401 を返したらセッションを消してログイン画面へ戻ること', async () => {
    server.use(http.get('*/api/rooms', () => HttpResponse.json({}, { status: 401 })));
    renderWithRouter();

    await act(async () => {
      await apiClient.get('/api/rooms').catch(() => undefined);
    });

    expect(screen.getByText('login')).toBeInTheDocument();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(sessionStorage.getItem('AUTH_USER')).toBeNull();
    expect(resolveTenantId()).toBe('');
  });

  test('セッション確認（/api/auth）の 401 ではログイン画面へ移らないこと', async () => {
    server.use(http.get('*/api/auth', () => HttpResponse.json({}, { status: 401 })));
    renderWithRouter();

    await act(async () => {
      await apiClient.get('/api/auth').catch(() => undefined);
    });

    expect(screen.getByText('library')).toBeInTheDocument();
    expect(resolveTenantId()).toBe('tenant-a');
  });
});
