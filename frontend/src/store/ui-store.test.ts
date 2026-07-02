import { describe, test, expect, beforeEach } from 'vitest';
import { useUiStore } from './ui-store';

beforeEach(() => {
  useUiStore.setState({ sidebarCollapsed: false, sidebarMobileOpen: false });
});

describe('useUiStore', () => {
  describe('初期状態', () => {
    test('sidebarCollapsed が false であること', () => {
      expect(useUiStore.getState().sidebarCollapsed).toBe(false);
    });

    test('sidebarMobileOpen が false であること', () => {
      expect(useUiStore.getState().sidebarMobileOpen).toBe(false);
    });
  });

  describe('toggleSidebar', () => {
    test('呼ぶたびに sidebarCollapsed が反転すること', () => {
      useUiStore.getState().toggleSidebar();
      expect(useUiStore.getState().sidebarCollapsed).toBe(true);

      useUiStore.getState().toggleSidebar();
      expect(useUiStore.getState().sidebarCollapsed).toBe(false);
    });
  });

  describe('toggleMobileSidebar', () => {
    test('呼ぶたびに sidebarMobileOpen が反転すること', () => {
      useUiStore.getState().toggleMobileSidebar();
      expect(useUiStore.getState().sidebarMobileOpen).toBe(true);
    });
  });

  describe('closeMobileSidebar', () => {
    test('sidebarMobileOpen が false になること', () => {
      useUiStore.setState({ sidebarMobileOpen: true });
      useUiStore.getState().closeMobileSidebar();
      expect(useUiStore.getState().sidebarMobileOpen).toBe(false);
    });
  });
});
