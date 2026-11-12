import { describe, test, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { matchRoutes } from 'react-router-dom';
import { routes } from './index';
import {
  FIXTURE_GENERAL_USER,
  FIXTURE_TENANT_ADMIN,
  renderApp,
  setAuthUser,
} from '@/test/render-app';

// 画面の中身に依存しないテストにする（各画面の移植でこのファイルを直さなくて済むように）。
// パスの定義は matchRoutes で、遷移は URL で確かめる。

/** URL に一致したルートのパターン（例: /admin/groups/:id/users）。どのルートにも一致しなければ null */
const matchedPattern = (url: string): string | null => {
  const matches = matchRoutes(routes, url);
  if (!matches) return null;
  const pattern = matches
    .map((match) => match.route.path)
    .filter((path): path is string => path !== undefined)
    .join('/')
    .replace(/\/+/g, '/');
  return pattern;
};

beforeEach(() => {
  setAuthUser(null);
});

describe('routes', () => {
  describe('パスの定義（移植元と同じパス）', () => {
    test.each([
      ['/auth/login', '/auth/login'],
      ['/auth/password/reset', '/auth/password/reset'],
      ['/dashboard', '/dashboard'],
      ['/chat/new', '/chat/new'],
      ['/chat/assistant', '/chat/assistant'],
      ['/chat/room1', '/chat/:roomId'],
      ['/chat/viewer/c1', '/chat/viewer/:chatId'],
      ['/chat/share/s1', '/chat/share/:shareId'],
      ['/chat-shared-history/room1', '/chat-shared-history/:roomId'],
      ['/feedback-preview/room1', '/feedback-preview/:roomId'],
      ['/library', '/library'],
      ['/library/lib1', '/library/:id'],
      ['/users', '/users'],
      ['/users/new', '/users/new'],
      ['/users/u1', '/users/:id'],
      ['/users/u1/edit', '/users/:id/edit'],
      ['/reports', '/reports'],
      ['/settings', '/settings'],
      ['/admin/users', '/admin/users'],
      ['/admin/groups', '/admin/groups'],
      ['/admin/groups/g1/users', '/admin/groups/:id/users'],
      ['/admin/groups/g1/templates', '/admin/groups/:id/templates'],
      ['/admin/groups/g1/assistants', '/admin/groups/:id/assistants'],
      ['/admin/groups/g1/members', '/admin/groups/:id/members'],
      ['/admin/tenant', '/admin/tenant'],
      ['/admin/chat-history', '/admin/chat-history'],
      ['/admin/chat-history/room1', '/admin/chat-history/:roomId'],
      ['/admin/assistants', '/admin/assistants'],
      ['/admin/templates', '/admin/templates'],
      ['/admin/feedback', '/admin/feedback'],
      ['/admin/training-data', '/admin/training-data'],
      ['/admin/training-data/t1', '/admin/training-data/:id'],
    ])('%s は %s に一致すること', (url, pattern) => {
      expect(matchedPattern(url)).toBe(pattern);
    });

    test('用語集のルートは定義せず、該当なし（*）になること', () => {
      expect(matchedPattern('/glossary')).toBe('/*');
      expect(matchedPattern('/glossary/g1/term-words')).toBe('/*');
    });
  });

  describe('未ログイン', () => {
    test('ダッシュボードを開くとログイン画面になること', () => {
      const { router } = renderApp('/dashboard');

      expect(router.state.location.pathname).toBe('/auth/login');
      expect(screen.getByRole('button', { name: /AUTH\.LOGIN\.SUBMIT/i })).toBeInTheDocument();
    });

    test('定義のないパスを開くとログイン画面になること', () => {
      const { router } = renderApp('/unknown/path');

      expect(router.state.location.pathname).toBe('/auth/login');
    });

    test('/auth を開くとログイン画面になること', () => {
      const { router } = renderApp('/auth');

      expect(router.state.location.pathname).toBe('/auth/login');
    });

    test('チャットビューアを開くとログイン画面になること', () => {
      const { router } = renderApp('/chat/viewer/c1');

      expect(router.state.location.pathname).toBe('/auth/login');
    });

    test('パスワードリセット画面が /auth/password/reset で開けること', () => {
      renderApp('/auth/password/reset?username=u1');

      expect(screen.getByRole('button', { name: /AUTH\.PW_RESET\.SUBMIT/i })).toBeInTheDocument();
    });
  });

  describe('ログイン済み', () => {
    beforeEach(() => {
      setAuthUser(FIXTURE_TENANT_ADMIN);
    });

    test('ダッシュボードがサイドバー付きで出ること', async () => {
      const { router } = renderApp('/dashboard');

      expect(screen.getByAltText('SecuAiGent')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole('main')).not.toBeEmptyDOMElement());
      expect(router.state.location.pathname).toBe('/dashboard');
    });

    test.each([
      ['/', '/dashboard'],
      ['/auth/login', '/dashboard'],
      ['/chat', '/dashboard'],
      ['/unknown/path', '/dashboard'],
      ['/admin/groups/g1', '/admin/groups/g1/users'],
    ])('%s を開くと %s になること', async (path, expected) => {
      const { router } = renderApp(path);

      // グループ詳細のタブへのリダイレクトは、遅延読み込みの親画面が出てから起きる
      await waitFor(() => expect(router.state.location.pathname).toBe(expected));
    });

    test('チャットビューア・共有チャットはサイドバーなしで出ること', async () => {
      const { container, router } = renderApp('/chat/share/s1');

      await waitFor(() => expect(container).not.toBeEmptyDOMElement());
      expect(screen.queryByAltText('SecuAiGent')).not.toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/chat/share/s1');
    });

    test('一般ユーザーもライブラリを開けること', async () => {
      setAuthUser(FIXTURE_GENERAL_USER);
      const { router } = renderApp('/library');

      await waitFor(() => expect(screen.getByRole('main')).not.toBeEmptyDOMElement());
      expect(router.state.location.pathname).toBe('/library');
    });
  });
});
