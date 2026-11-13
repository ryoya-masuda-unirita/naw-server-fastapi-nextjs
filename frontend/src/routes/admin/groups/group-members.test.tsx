import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FIXTURE_TENANT_ADMIN, renderApp, setAuthUser } from '@/test/render-app';

describe('GroupMembersPage（旧ルートのグループメンバー）', () => {
  beforeEach(() => {
    setAuthUser(FIXTURE_TENANT_ADMIN);
  });

  afterEach(() => {
    setAuthUser(null);
  });

  test('モックのメンバーがヘッダーのグループ名・タブ付きで表示されること', async () => {
    renderApp('/admin/groups/g1/members');

    expect(await screen.findByRole('heading', { name: 'チームA' })).toBeInTheDocument();
    expect(screen.getByText('所属ユーザー')).toBeInTheDocument();
    expect(screen.getByText('所属アシスタント')).toBeInTheDocument();
    expect(screen.getAllByText('由宇名前').length).toBeGreaterThanOrEqual(5);
    expect(screen.getAllByText('グループ管理者').length).toBeGreaterThanOrEqual(2);
  });

  test('ユーザーの追加ボタンでチームの編集ダイアログが開き、現在の名前が入ること', async () => {
    const user = userEvent.setup();
    renderApp('/admin/groups/g1/members');

    await user.click((await screen.findAllByText('ADMIN_CONSOLE.ADD_USER'))[0]);

    expect(screen.getByRole('dialog', { name: 'チームの編集' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('ADMIN_CONSOLE.GROUP_NAME_PLACEHOLDER')).toHaveValue('チームA');
  });

  test('ダイアログの削除を押すと削除の確認が重ねて開き、キャンセルで閉じること', async () => {
    const user = userEvent.setup();
    renderApp('/admin/groups/g1/members');

    await user.click((await screen.findAllByText('ADMIN_CONSOLE.ADD_USER'))[0]);
    await user.click(screen.getByText('COMMON.DELETE'));
    expect(screen.getByRole('dialog', { name: '削除の確認' })).toBeInTheDocument();

    await user.click(screen.getAllByTestId('dialog-cancel-button')[1]);

    expect(screen.queryByRole('dialog', { name: '削除の確認' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'チームの編集' })).toBeInTheDocument();
  });

  test('一般のグループメンバーは自分のグループ以外を開けないこと', async () => {
    setAuthUser({
      id: 'u1',
      name: '一般',
      role: 'USER',
      groups: [{ groupId: 'g1', groupAdmin: false }],
    });
    renderApp('/admin/groups/g2/members');

    expect(screen.queryByText('所属ユーザー')).not.toBeInTheDocument();
  });
});
