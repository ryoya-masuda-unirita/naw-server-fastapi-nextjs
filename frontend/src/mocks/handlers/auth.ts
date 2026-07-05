import { http, HttpResponse, delay } from 'msw';

const BASE_URL = 'http://localhost:8000';

export const authHandlers = [
  http.post(`${BASE_URL}/auth/login`, async ({ request }) => {
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

  http.post(`${BASE_URL}/auth/logout`, () => {
    return HttpResponse.text('Logout successful.');
  }),

  http.post(`${BASE_URL}/auth/password/reset`, async ({ request }) => {
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

  http.get(`${BASE_URL}/api/auth`, () => {
    return HttpResponse.json({
      id: 'user1',
      name: 'Test User',
      role: 'USER',
      tenant_id: 'tenant-1',
    });
  }),
];
