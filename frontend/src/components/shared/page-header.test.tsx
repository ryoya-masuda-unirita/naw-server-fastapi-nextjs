import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useUiStore } from '@/store/ui-store';
import { PageHeader } from './page-header';
import type { TabItem } from './types';

function renderHeader(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

beforeEach(() => {
  useUiStore.setState({ sidebarMobileOpen: false });
});

describe('PageHeader', () => {
  test('タイトルを表示し、titleKey があれば翻訳キーを優先すること', () => {
    const { rerender } = renderHeader(<PageHeader title="ユーザー管理" />);
    expect(screen.getByRole('heading', { name: 'ユーザー管理' })).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <PageHeader title="ユーザー管理" titleKey="ADMIN.USERS.TITLE" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'ADMIN.USERS.TITLE' })).toBeInTheDocument();
  });

  test('サイドバーの開閉ボタンでモバイルサイドバーを切り替えること', async () => {
    renderHeader(<PageHeader title="t" />);
    await userEvent.click(screen.getByTitle('HEADER.SIDEBAR_TOGGLE'));
    expect(useUiStore.getState().sidebarMobileOpen).toBe(true);
  });

  test('共有・いいね・設定ボタンで各イベントが呼ばれること', async () => {
    const onShareClick = vi.fn();
    const onLikeClick = vi.fn();
    const onSettingsClick = vi.fn();
    renderHeader(
      <PageHeader title="t" onShareClick={onShareClick} onLikeClick={onLikeClick} onSettingsClick={onSettingsClick} />,
    );
    await userEvent.click(screen.getByTitle('HEADER.SHARE'));
    await userEvent.click(screen.getByTitle('HEADER.LIKE'));
    await userEvent.click(screen.getByTitle('HEADER.SETTINGS'));
    expect(onShareClick).toHaveBeenCalledTimes(1);
    expect(onLikeClick).toHaveBeenCalledTimes(1);
    expect(onSettingsClick).toHaveBeenCalledTimes(1);
  });

  test('showActions が false なら操作ボタンを出さないこと', () => {
    renderHeader(<PageHeader title="t" showActions={false} />);
    expect(screen.queryByTitle('HEADER.SHARE')).not.toBeInTheDocument();
  });

  test('more_vert のメニューから名前変更を選べること', async () => {
    const onRenameClick = vi.fn();
    renderHeader(<PageHeader title="t" settingsIcon="more_vert" onRenameClick={onRenameClick} />);
    const toggle = screen.getByTitle('HEADER.SETTINGS');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(screen.getByRole('menuitem', { name: /HEADER\.RENAME/ }));
    expect(onRenameClick).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('more_vert のメニューは画面の他の場所をクリックすると閉じること', async () => {
    renderHeader(<PageHeader title="t" settingsIcon="more_vert" />);
    const toggle = screen.getByTitle('HEADER.SETTINGS');
    await userEvent.click(toggle);
    await userEvent.click(document.body);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('タブを渡すとタブを表示して切り替えを通知すること', async () => {
    const tabs: TabItem[] = [
      { id: 'api', label: 'TENANT.API' },
      { id: 'usage', label: 'TENANT.USAGE' },
    ];
    const onTabChange = vi.fn();
    renderHeader(<PageHeader title="t" tabs={tabs} activeTabId="api" onTabChange={onTabChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'TENANT.USAGE' }));
    expect(onTabChange).toHaveBeenCalledWith(tabs[1]);
  });

  test('actions に渡した要素を右側に表示すること', () => {
    renderHeader(<PageHeader title="t" showActions={false} actions={<button type="button">新規作成</button>} />);
    expect(screen.getByRole('button', { name: '新規作成' })).toBeInTheDocument();
  });

  test('sticky の既定で上部に固定されること', () => {
    renderHeader(<PageHeader title="t" />);
    expect(screen.getByRole('banner')).toHaveClass('sticky', 'top-0', 'z-50');
  });
});
