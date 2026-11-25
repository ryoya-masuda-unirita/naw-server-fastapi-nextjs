import { describe, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LibraryPageItem, TagItem } from '@/types/admin/library.types';
import { AssistantRowMenu } from './assistants/assistant-row-menu';
import { LibraryItemMenu } from './library/library-item-menu';
import { TagItemMenu } from './library/tag-item-menu';
import { UserListMenu } from './users/user-list-menu';

const LIBRARY_ITEM: LibraryPageItem = {
  id: 'l1',
  title: '就業規則',
  userId: 'u1',
  updatedAt: '2026-11-01T09:00:00',
  tags: [],
  sharedGroups: [],
};
const TAG_ITEM: TagItem = { id: 't1', name: '人事', updatedAt: '2026-11-01T09:00:00' };

/** メニューを開き、パネルの中身を返す */
async function openMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'COMMON.OPEN_MENU' }));
  return { user, menu: await screen.findByRole('menu') };
}

/**
 * 行のメニューの項目は、`role="menu"` の中で `menuitem` でなければならない
 * （axe の aria-required-children）。ボタンのままだと、スクリーンリーダーがメニューとして読まない。
 */
describe('行のメニューの項目', () => {
  test('ユーザー: 編集・削除が menuitem で、button が混ざらないこと', async () => {
    const onEdit = vi.fn();
    render(<UserListMenu onEdit={onEdit} onDelete={vi.fn()} />);
    const { user, menu } = await openMenu();

    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2);
    expect(within(menu).queryAllByRole('button')).toHaveLength(0);

    await user.click(within(menu).getByTestId('admin-users-edit-button'));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  test('アシスタント・カテゴリ: 編集・削除が menuitem で、button が混ざらないこと', async () => {
    render(<AssistantRowMenu editLabelKey="ADMIN.ASSISTANT.EDIT" testid="assistant-menu-a1" onEdit={vi.fn()} onDelete={vi.fn()} />);
    const { menu } = await openMenu();

    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2);
    expect(within(menu).queryAllByRole('button')).toHaveLength(0);
  });

  test('ライブラリ: 設定・リンクのコピー・削除が menuitem で、button が混ざらないこと', async () => {
    render(
      <LibraryItemMenu item={LIBRARY_ITEM} onEditSettings={vi.fn()} onCopyLink={vi.fn()} onDeleteItem={vi.fn()} />,
    );
    const { menu } = await openMenu();

    expect(within(menu).getAllByRole('menuitem')).toHaveLength(3);
    expect(within(menu).queryAllByRole('button')).toHaveLength(0);
  });

  test('ライブラリのタグ: 設定・削除が menuitem で、button が混ざらないこと', async () => {
    render(<TagItemMenu item={TAG_ITEM} onEditSettings={vi.fn()} onDeleteItem={vi.fn()} />);
    const { menu } = await openMenu();

    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2);
    expect(within(menu).queryAllByRole('button')).toHaveLength(0);
  });
});
