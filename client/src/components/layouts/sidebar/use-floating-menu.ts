import { useEffect, useState } from 'react';

/** この幅以上をデスクトップとみなす（移植元 desktopBreakpointPx） */
const DESKTOP_BREAKPOINT_PX = 768;
/** ビューポートの上下に空ける余白（移植元 viewportMarginPx） */
export const VIEWPORT_MARGIN_PX = 8;

interface Viewport {
  isDesktop: boolean;
  height: number;
}

function readViewport(): Viewport {
  return { isDesktop: window.innerWidth >= DESKTOP_BREAKPOINT_PX, height: window.innerHeight };
}

/**
 * `chat-room-menu`・`chat-context-menu` が共通で持つ表示の制御（移植元は同じ処理を 2 つのコンポーネントに持つ）。
 * デスクトップは開閉で即座に出し入れし、モバイルは下からのスライド（閉じるときは animationend まで残す）。
 */
export function useFloatingMenu(isOpen: boolean) {
  const [viewport, setViewport] = useState<Viewport>(readViewport);
  // 閉じるアニメーションが終わったか。開くたびに false に戻し、閉じて animationend が来たら true にする
  const [animationEnded, setAnimationEnded] = useState(!isOpen);
  const [previousIsOpen, setPreviousIsOpen] = useState(isOpen);

  if (previousIsOpen !== isOpen) {
    setPreviousIsOpen(isOpen);
    if (isOpen) setAnimationEnded(false);
  }

  useEffect(() => {
    const onResize = () => setViewport(readViewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const { isDesktop, height: viewportHeight } = viewport;
  const visible = isOpen || (!isDesktop && !animationEnded);

  const animationClass = (() => {
    if (isDesktop) return '';
    if (isOpen) return 'animate-slide-up';
    return visible ? 'animate-slide-down' : '';
  })();

  return {
    isDesktop,
    viewportHeight,
    visible,
    animationClass,
    desktopMaxHeightPx: Math.max(0, viewportHeight - VIEWPORT_MARGIN_PX * 2),
    onAnimationEnd: () => {
      if (!isOpen) setAnimationEnded(true);
    },
  };
}
