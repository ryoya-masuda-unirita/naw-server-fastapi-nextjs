import { useSyncExternalStore } from 'react';

/** 移植元 UiStore.isMobile と同じく Tailwind の md ブレークポイント未満をモバイルとみなす */
const MOBILE_MAX_WIDTH = 768;

function subscribe(onChange: () => void): () => void {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

function getSnapshot(): boolean {
  return window.innerWidth < MOBILE_MAX_WIDTH;
}

/**
 * 画面幅がモバイルかどうか。移植元は UiStore.isMobile（resize で更新する signal）を
 * select・context-menu などがモバイル用ボトムドロワーへの切り替えに使っている。
 * ui-store はレイアウト側の担当なので、共通部品ではこのフックで同じ判定をする。
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
