import { create } from 'zustand';

interface UiStore {
  sidebarCollapsed: boolean;
  sidebarMobileOpen: boolean;
  toggleSidebar: () => void;
  toggleMobileSidebar: () => void;
  closeMobileSidebar: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  sidebarCollapsed: false,
  sidebarMobileOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleMobileSidebar: () => set((state) => ({ sidebarMobileOpen: !state.sidebarMobileOpen })),
  closeMobileSidebar: () => set({ sidebarMobileOpen: false }),
}));
