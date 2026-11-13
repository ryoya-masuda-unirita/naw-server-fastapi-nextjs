import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useUiStore } from '@/store/ui-store';
import { ChatHeader } from './chat-header';

beforeEach(() => {
  useUiStore.setState({ sidebarMobileOpen: false });
});

describe('ChatHeader', () => {
  test('タイトルを表示し、名前変更・共有・評価の各ボタンが通知すること', async () => {
    const onRenameClick = vi.fn();
    const onShareClick = vi.fn();
    const onLikeClick = vi.fn();
    render(
      <ChatHeader title="部屋A" onRenameClick={onRenameClick} onShareClick={onShareClick} onLikeClick={onLikeClick} />,
    );
    const user = userEvent.setup();

    expect(screen.getByRole('heading', { name: '部屋A' })).toBeInTheDocument();
    // PC 用のボタン（モバイルのメニュー内にも同名の項目があるので、先頭を押す）
    await user.click(screen.getAllByRole('button', { name: 'HEADER.RENAME' })[0]);
    await user.click(screen.getByTestId('room-share-button'));
    await user.click(screen.getAllByRole('button', { name: 'HEADER.LIKE' })[0]);

    expect(onRenameClick).toHaveBeenCalledTimes(1);
    expect(onShareClick).toHaveBeenCalledTimes(1);
    expect(onLikeClick).toHaveBeenCalledTimes(1);
  });

  test('isHideName のときはタイトルと操作を隠すこと', () => {
    const { container } = render(<ChatHeader title="部屋A" isHideName />);

    expect(container.querySelector('.chat-page-header')).toHaveClass('hidden');
    expect(container.querySelector('.chat-page-header-actions')).toHaveClass('hidden');
  });

  test('ハンバーガーでモバイルのサイドバーを開くこと', async () => {
    render(<ChatHeader title="部屋A" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'HEADER.SIDEBAR_TOGGLE' }));

    expect(useUiStore.getState().sidebarMobileOpen).toBe(true);
  });

  test('モバイルのメニューを開いて「ビューワーを開く」を選ぶと通知してメニューが閉じること', async () => {
    const onSettingsClick = vi.fn();
    render(<ChatHeader title="部屋A" onSettingsClick={onSettingsClick} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'HEADER.MORE' }));
    expect(screen.getByRole('menu')).toBeVisible();
    await user.click(screen.getByRole('menuitem', { name: /HEADER.OPEN_VIEWER/ }));

    expect(onSettingsClick).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'HEADER.MORE' })).toHaveAttribute('aria-expanded', 'false');
  });

  test('読み取り専用では名前変更・共有・評価が隠れること', () => {
    render(<ChatHeader title="部屋A" isReadOnly />);

    expect(screen.getByTestId('room-share-button')).toHaveClass('md:hidden!');
    expect(screen.getAllByRole('button', { name: 'HEADER.RENAME' })[0]).toHaveClass('md:hidden!');
  });
});
