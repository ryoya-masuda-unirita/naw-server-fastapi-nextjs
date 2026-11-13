import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import './cdk-overlay.css';
import { cx } from './class-names';
import { AppMatIcon } from './icons/app-mat-icon';
import { SvgIcon } from './icons/svg-icon';
import { useIsMobile } from './use-is-mobile';

/** 移植元 CDK の ConnectedPosition と同じ形 */
export interface ConnectedPosition {
  originX: 'start' | 'center' | 'end';
  originY: 'top' | 'center' | 'bottom';
  overlayX: 'start' | 'center' | 'end';
  overlayY: 'top' | 'center' | 'bottom';
  offsetX?: number;
  offsetY?: number;
}

const DEFAULT_POSITIONS: ConnectedPosition[] = [
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -4 },
];

/** 閉じるときに DOM から外すまでの待ち時間（移植元: 閉じるトランジションの最大 300ms） */
const CLOSE_TRANSITION_MS = 300;

function axisPoint(start: number, size: number, align: 'start' | 'center' | 'end' | 'top' | 'bottom'): number {
  if (align === 'start' || align === 'top') return start;
  if (align === 'end' || align === 'bottom') return start + size;
  return start + size / 2;
}

/**
 * CDK の FlexibleConnectedPositionStrategy と同じく、候補位置を順に試して
 * 画面内に収まる最初の位置を使う（どれも収まらなければ先頭の位置）。
 */
function computePanelPosition(
  origin: DOMRect,
  panelWidth: number,
  panelHeight: number,
  positions: ConnectedPosition[],
): { top: number; left: number } {
  const candidates = positions.map((pos) => {
    const ox = axisPoint(origin.left, origin.width, pos.originX);
    const oy = axisPoint(origin.top, origin.height, pos.originY);
    const left = ox - (pos.overlayX === 'start' ? 0 : pos.overlayX === 'end' ? panelWidth : panelWidth / 2) + (pos.offsetX ?? 0);
    const top = oy - (pos.overlayY === 'top' ? 0 : pos.overlayY === 'bottom' ? panelHeight : panelHeight / 2) + (pos.offsetY ?? 0);
    return { top, left };
  });
  const fits = candidates.find(
    ({ top, left }) =>
      top >= 0 && left >= 0 && top + panelHeight <= window.innerHeight && left + panelWidth <= window.innerWidth,
  );
  return fits ?? candidates[0];
}

/** 親から開閉するための操作（移植元の `@ViewChild(ContextMenuComponent)` で呼んでいたもの） */
export interface ContextMenuHandle {
  open: () => void;
  close: () => void;
  toggle: () => void;
}

interface ContextMenuProps {
  /**
   * メニューの中身（移植元 menuTpl）。モバイルのドロワーは中身のクリックで閉じないので、
   * 移植元の `contextMenu.close()` と同じく項目から閉じたいときは関数で受け取った close を呼ぶ。
   */
  menu: ReactNode | ((controls: { close: () => void }) => ReactNode);
  ref?: Ref<ContextMenuHandle>;
  /** 既定のトリガーボタンの代わりに出す要素（移植元 customTrigger） */
  customTrigger?: ReactNode;
  /** 既定トリガーのアイコン（material-symbols 名）。省略すると歯車の SVG アイコン */
  triggerIcon?: string;
  triggerTestid?: string;
  menuMinWidth?: string;
  /** メニューのパネルに付けるクラス */
  panelClass?: string;
  /** メニュー内をクリックしたら閉じる（操作メニュー向け） */
  closeOnContentClick?: boolean;
  overlayPositions?: ConnectedPosition[];
  hasPaddingButton?: boolean;
  className?: string;
}

/**
 * 移植元 `<app-context-menu>`。デスクトップはトリガーに接続したドロップダウン、モバイルは下からのドロワーで出す。
 */
export function ContextMenu({
  menu,
  customTrigger,
  triggerIcon,
  triggerTestid,
  menuMinWidth = 'min-w-60',
  panelClass = 'bg-bg-primary flex flex-col gap-1 p-4 rounded-lg shadow-default text-xs font-medium',
  closeOnContentClick = true,
  overlayPositions = DEFAULT_POSITIONS,
  hasPaddingButton = true,
  className,
  ref,
}: ContextMenuProps) {
  const isMobile = useIsMobile();
  // isVisible は DOM に置くか、isOpen は開いた見た目にするか（閉じるトランジションのため 2 段にしている）
  const [isVisible, setIsVisible] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement | HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // 閉じるトランジションが終わってから DOM から外す。途中で開き直したら cleanup でタイマーを取り消す
  useEffect(() => {
    if (isOpen || !isVisible) return;
    const timer = setTimeout(() => setIsVisible(false), CLOSE_TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [isOpen, isVisible]);

  // パネルの大きさが決まってから位置を決める必要があるので、描画後に DOM の style を直接設定する
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    if (!isOpen || isMobile || !panel || !trigger) return;
    const { top, left } = computePanelPosition(
      trigger.getBoundingClientRect(),
      panel.offsetWidth,
      panel.offsetHeight,
      overlayPositions,
    );
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
  }, [isOpen, isMobile, overlayPositions]);

  const open = () => {
    setIsVisible(true);
    // 要素を置いてからトランジションを始める
    requestAnimationFrame(() => setIsOpen(true));
  };

  const close = () => {
    setIsOpen(false);
  };

  const toggleOpen = () => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  };

  const toggle = (event: MouseEvent) => {
    event.stopPropagation();
    toggleOpen();
  };

  useImperativeHandle(ref, () => ({ open, close, toggle: toggleOpen }));

  const menuContent = typeof menu === 'function' ? menu({ close }) : menu;

  const handleContentClick = (event: MouseEvent) => {
    event.stopPropagation();
    if (closeOnContentClick) close();
  };

  return (
    <div className={cx('app-context-menu block', className)}>
      {customTrigger ? (
        <div ref={(el) => void (triggerRef.current = el)} onClick={toggle}>
          {customTrigger}
        </div>
      ) : (
        <button
          ref={(el) => void (triggerRef.current = el)}
          type="button"
          data-testid={triggerTestid}
          className={cx(
            'flex items-center justify-center p-1 rounded-full hover:bg-bg-brand-weak transition-colors',
            hasPaddingButton && 'md:p-2!',
          )}
          onClick={toggle}
        >
          {triggerIcon ? (
            <AppMatIcon icon={triggerIcon} className="text-[20px]! text-text-lighter" />
          ) : (
            <SvgIcon name="settings" className="w-5 h-5 text-text-lighter" />
          )}
        </button>
      )}

      {/* デスクトップ: CDK の connected overlay（透明な背景をクリックすると閉じる） */}
      {!isMobile &&
        isOpen &&
        createPortal(
          <div className="cdk-overlay-container">
            <div
              className="cdk-overlay-backdrop cdk-overlay-transparent-backdrop cdk-overlay-backdrop-showing"
              data-testid="context-menu-backdrop"
              onClick={close}
            />
            <div ref={panelRef} className="cdk-overlay-pane" style={{ position: 'fixed' }}>
              <div className={cx(panelClass, menuMinWidth)} role="menu" onClick={handleContentClick}>
                {menuContent}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* モバイル: 下からのドロワー */}
      {isMobile && isVisible && (
        <div
          className={cx(
            'fixed w-screen inset-0 z-200 flex flex-col justify-end transition-opacity duration-200',
            !isOpen && 'opacity-0 pointer-events-none',
          )}
          onClick={(e) => {
            close();
            e.stopPropagation();
          }}
        >
          <div className="absolute inset-0 bg-bg-overlay" />
          <div
            className={cx(
              'relative bg-bg-primary rounded-t-2xl shadow-default flex flex-col pb-safe transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
              !isOpen && 'translate-y-full',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-1 md:gap-2 p-4 text-xs font-medium" role="menu">
              {menuContent}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
