import { describe, test, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type { User } from '@/types/auth';
import {
  FIXTURE_GENERAL_USER,
  FIXTURE_GROUP_ADMIN,
  FIXTURE_TENANT_ADMIN,
  renderApp,
  setAuthUser,
} from '@/test/render-app';

// 画面の中身に依存しないよう、遷移先の URL とメイン領域が描画されたかだけを確かめる

const expectAllowed = async (user: User, path: string) => {
  setAuthUser(user);
  const { router } = renderApp(path);

  await waitFor(() => expect(screen.getByRole('main')).not.toBeEmptyDOMElement());
  expect(router.state.location.pathname).toBe(path);
};

const expectRedirected = async (user: User | null, path: string, expected: string) => {
  setAuthUser(user);
  const { router } = renderApp(path);

  await waitFor(() => expect(router.state.location.pathname).toBe(expected));
};

beforeEach(() => {
  setAuthUser(null);
});

describe('権限ガード', () => {
  describe('管理コンソール（/admin 配下）', () => {
    test('一般ユーザーは新規チャットへ移ること', async () => {
      await expectRedirected(FIXTURE_GENERAL_USER, '/admin/groups', '/chat/new');
    });

    test('グループ管理者はグループ一覧を開けること', async () => {
      await expectAllowed(FIXTURE_GROUP_ADMIN, '/admin/groups');
    });

    test('未ログインはログイン画面へ移ること', async () => {
      await expectRedirected(null, '/admin/tenant', '/auth/login');
    });
  });

  describe('テナント管理者用の画面', () => {
    test.each([
      '/admin/users',
      '/admin/tenant',
      '/admin/chat-history',
      '/admin/chat-history/room1',
      '/admin/assistants',
      '/admin/templates',
      '/admin/feedback',
      '/admin/training-data',
      '/admin/training-data/t1',
    ])('グループ管理者が %s を開くとグループ一覧へ移ること', async (path) => {
      await expectRedirected(FIXTURE_GROUP_ADMIN, path, '/admin/groups');
    });

    test('一般ユーザーは管理コンソールのガードで新規チャットへ移ること', async () => {
      await expectRedirected(FIXTURE_GENERAL_USER, '/admin/tenant', '/chat/new');
    });

    test('テナント管理者はテナント画面を開けること', async () => {
      await expectAllowed(FIXTURE_TENANT_ADMIN, '/admin/tenant');
    });
  });

  describe('グループ詳細', () => {
    test('グループ管理者は自分の管理するグループを開けること', async () => {
      await expectAllowed(FIXTURE_GROUP_ADMIN, '/admin/groups/g1/users');
    });

    test('グループ管理者は管理していないグループを開くとグループ一覧へ移ること', async () => {
      await expectRedirected(FIXTURE_GROUP_ADMIN, '/admin/groups/g2/users', '/admin/groups');
    });

    test('旧グループメンバー画面も管理していないグループならグループ一覧へ移ること', async () => {
      await expectRedirected(FIXTURE_GROUP_ADMIN, '/admin/groups/g2/members', '/admin/groups');
    });

    test('テナント管理者はどのグループも開けること', async () => {
      await expectAllowed(FIXTURE_TENANT_ADMIN, '/admin/groups/g2/users');
    });
  });

  describe('旧ユーザー管理・レポート・設定', () => {
    test.each(['/users', '/users/new', '/users/u1', '/users/u1/edit', '/reports', '/settings'])(
      '一般ユーザーが %s を開くと画面を出さないこと',
      async (path) => {
        setAuthUser(FIXTURE_GENERAL_USER);
        const { router } = renderApp(path);

        // サイドバーまで描画されてから確かめる
        expect(await screen.findByAltText('SecuAiGent')).toBeInTheDocument();
        expect(screen.getByRole('main')).toBeEmptyDOMElement();
        expect(router.state.location.pathname).toBe(path);
      }
    );

    test('テナント管理者は開けること', async () => {
      await expectAllowed(FIXTURE_TENANT_ADMIN, '/reports');
    });
  });
});
