import { describe, test, expect } from 'vitest';
import { ADMIN_LAYOUT_CONFIG } from '@/lib/constants/layout';
import { resolveSidebarMode } from './sidebar-mode';

describe('resolveSidebarMode', () => {
  test.each([
    ['/admin/users', 'admin'],
    ['/admin/groups/g1/users', 'admin'],
    ['/admin/tenant', 'admin'],
    ['/admin/feedback', 'admin'],
    ['/admin/management', 'admin'],
    ['/library/lib1', 'back'],
    ['/chat-shared-history/room1', 'back'],
    ['/feedback-preview/room1', 'back'],
    ['/library', 'default'],
    ['/dashboard', 'default'],
    ['/chat/room1', 'default'],
    ['/users', 'default'],
  ])('%s は %s モードになること', (url, expected) => {
    expect(resolveSidebarMode(url, ADMIN_LAYOUT_CONFIG)).toBe(expected);
  });
});
