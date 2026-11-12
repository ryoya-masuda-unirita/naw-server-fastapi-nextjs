import { http, HttpResponse, delay } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';

export const authHandlers = [
  http.post(mockPath(API_PATHS.AUTH.LOGIN), async ({ request }) => {
    const body = await request.json() as { username: string; password: string };

    if (body.username === 'reset_user' && body.password === 'pass') {
      return HttpResponse.json({
        loginStatus: 'REQUIRES_PASSWORD_RESET',
        id: 'reset_user',
        name: 'Reset User',
        role: 'USER',
        reason: 'INITIAL',
      });
    }

    if (body.username === 'admin' && body.password === 'pass') {
      return HttpResponse.json({
        loginStatus: 'SUCCESS',
        id: 'admin',
        name: 'Admin User',
        role: 'ADMIN',
        token: 'mock-token',
        groups: [],
      });
    }

    if (body.username === 'user' && body.password === 'pass') {
      return HttpResponse.json({
        loginStatus: 'SUCCESS',
        id: 'user1',
        name: 'Test User',
        role: 'USER',
        token: 'mock-token',
        groups: [{ groupId: 'g1', groupAdmin: false }],
      });
    }

    return HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 });
  }),

  http.post(mockPath(API_PATHS.AUTH.LOGIN_KEY), async ({ request }) => {
    const body = await request.json() as { loginKey: string };

    if (body.loginKey === 'valid-login-key') {
      return HttpResponse.json({
        loginStatus: 'SUCCESS',
        id: 'user1',
        name: 'Test User',
        role: 'USER',
        token: 'mock-token',
        groups: [],
      });
    }

    return HttpResponse.json({ message: 'Invalid login key' }, { status: 401 });
  }),

  http.post(mockPath(API_PATHS.AUTH.LOGOUT), () => {
    return HttpResponse.text('Logout successful.');
  }),

  http.post(mockPath(API_PATHS.AUTH.PASSWORD_RESET), async ({ request }) => {
    const body = await request.json() as { username: string; oldPassword: string; newPassword: string };

    if (body.newPassword.length < 8) {
      return HttpResponse.json({ message: 'Password too short' }, { status: 400 });
    }

    await delay(50);

    return HttpResponse.json({
      id: body.username,
      name: 'Reset User',
      role: 'USER',
      token: 'new-token',
      groups: [],
    });
  }),

  http.get(mockPath(API_PATHS.AUTH.SESSION), () => {
    return HttpResponse.json({
      id: 'user1',
      name: 'Test User',
      role: 'USER',
    });
  }),
];
