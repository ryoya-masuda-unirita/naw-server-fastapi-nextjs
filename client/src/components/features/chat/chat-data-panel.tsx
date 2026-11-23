import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useViewerStore } from '@/store/viewer-store';
import { renderChatSummary } from './render-chat-summary';

export const VIEWER_WIDTH_EXPANDED = 400;
export const VIEWER_WIDTH_COLLAPSED = 52;
export const VIEWER_WIDTH_MIN = 280;
export const VIEWER_WIDTH_MAX = 1018;

interface ChatDataPanelProps {
  roomId: string | null;
  isReadOnly?: boolean;
  onCollapseChange?: (collapsed: boolean) => void;
  /**
   * パネルの中身（移植元の `<app-chat-summary>`）。未指定ならビューワー（`ChatSummary`）。
   * 折りたたみの切り替えは渡された `onCollapseChange` で通知する
   */
  renderSummary?: (params: {
    roomId: string | null;
    isReadOnly: boolean;
    onCollapseChange: (collapsed: boolean) => void;
  }) => ReactNode;
}

/** 移植元 `<app-chat-data-panel>`。チャット画面の右に出すビューワーの枠（幅のドラッグ変更・折りたたみ） */
export function ChatDataPanel({
  roomId,
  isReadOnly = false,
  onCollapseChange,
  renderSummary = renderChatSummary,
}: ChatDataPanelProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLElement | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [panelWidth, setPanelWidth] = useState(VIEWER_WIDTH_EXPANDED);
  const [isResizing, setIsResizing] = useState(false);
  /** ドラッグ中の後始末。ドラッグ中にパネルが消えても、リスナーとカーソルを戻すため */
  const stopResizeRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopResizeRef.current?.(), []);

  // ルームが替わったらそのルームのライブラリ一覧を読む。モバイルのビューワー（ChatWindow）もこの一覧を使うので、
  // パネルが hidden でも読み込む（移植元の effect）
  useEffect(() => {
    if (roomId) void useViewerStore.getState().loadList(roomId);
  }, [roomId]);

  const handleCollapseChange = (collapsed: boolean) => {
    setIsCollapsed(collapsed);
    onCollapseChange?.(collapsed);
  };

  const startResize = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panelRef.current?.getBoundingClientRect().width ?? panelWidth;
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (e: globalThis.MouseEvent) => {
      const dx = startX - e.clientX;
      setPanelWidth(Math.min(VIEWER_WIDTH_MAX, Math.max(VIEWER_WIDTH_MIN, startWidth + dx)));
    };

    const onMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      stopResizeRef.current = null;
    };
    stopResizeRef.current = onMouseUp;

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <aside
      ref={panelRef}
      className={`hidden md:flex flex-col shrink-0 relative bg-white border-l border-t border-b border-border-weak rounded-tl-2xl rounded-bl-2xl duration-300 h-screen${
        isResizing ? ' transition-none!' : ''
      }`}
      style={{
        width: isCollapsed ? VIEWER_WIDTH_COLLAPSED : panelWidth,
        boxShadow: 'var(--shadow-viewer)',
      }}
      // 移植元が日本語をハードコードしているので、そのまま移す
      aria-label="ビューワー"
    >
      {!isCollapsed && (
        <div
          className="absolute left-0 top-0 bottom-0 w-1 z-10 cursor-col-resize transition-colors duration-100 hover:bg-brand-primary/30"
          role="separator"
          aria-orientation="vertical"
          aria-label={t('CHAT.VIEWER.RESIZE_LABEL')}
          title="ドラッグしてサイズを変更"
          onMouseDown={startResize}
        />
      )}

      {renderSummary({ roomId, isReadOnly, onCollapseChange: handleCollapseChange })}
    </aside>
  );
}
