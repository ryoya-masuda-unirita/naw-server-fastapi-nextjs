import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Tab } from './tab';
import type { TabItem } from './types';

const FIXTURE_TABS: TabItem[] = [
  { id: 'assistant', label: 'ADMIN.ASSISTANT.TAB' },
  { id: 'category', label: 'ADMIN.CATEGORY.TAB', icon: 'folder' },
  { id: 'disabled', label: 'ADMIN.DISABLED.TAB', disabled: true },
];

describe('Tab', () => {
  test('activeTabId がなければ先頭のタブを選択中にすること', () => {
    render(<Tab tabs={FIXTURE_TABS} />);
    const first = screen.getByRole('tab', { name: 'ADMIN.ASSISTANT.TAB' });
    expect(first).toHaveAttribute('aria-current', 'page');
    expect(first).toHaveClass('text-brand-primary!');
  });

  test('クリックで選択中が変わり onTabChange が呼ばれること', async () => {
    const onTabChange = vi.fn();
    render(<Tab tabs={FIXTURE_TABS} onTabChange={onTabChange} />);
    await userEvent.click(screen.getByRole('tab', { name: /ADMIN\.CATEGORY\.TAB/ }));
    expect(onTabChange).toHaveBeenCalledWith(FIXTURE_TABS[1]);
    expect(screen.getByRole('tab', { name: /ADMIN\.CATEGORY\.TAB/ })).toHaveAttribute('aria-current', 'page');
  });

  test('無効なタブは押せないこと', async () => {
    const onTabChange = vi.fn();
    render(<Tab tabs={FIXTURE_TABS} onTabChange={onTabChange} />);
    const disabled = screen.getByRole('tab', { name: 'ADMIN.DISABLED.TAB' });
    expect(disabled).toBeDisabled();
    expect(disabled).toHaveClass('opacity-40');
    await userEvent.click(disabled);
    expect(onTabChange).not.toHaveBeenCalled();
  });

  test('activeTabId を指定するとそのタブを選択中にすること', () => {
    render(<Tab tabs={FIXTURE_TABS} activeTabId="category" />);
    expect(screen.getByRole('tab', { name: /ADMIN\.CATEGORY\.TAB/ })).toHaveAttribute('aria-current', 'page');
  });

  test('route を持つタブはリンクになること', () => {
    render(
      <MemoryRouter>
        <Tab tabs={[{ id: 'users', label: 'TAB.USERS', route: '/admin/groups/1/users' }]} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('tab', { name: 'TAB.USERS' })).toHaveAttribute('href', '/admin/groups/1/users');
  });

  test('fullWidth のときタブを均等幅にすること', () => {
    render(<Tab tabs={FIXTURE_TABS} fullWidth />);
    expect(screen.getByRole('tab', { name: 'ADMIN.ASSISTANT.TAB' })).toHaveClass('flex-1');
  });
});
