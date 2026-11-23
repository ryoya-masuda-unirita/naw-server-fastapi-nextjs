import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CircularLoading } from '@/components/shared/circular-loading';
import { cx } from '@/components/shared/class-names';
import { dropdownService } from '@/components/shared/dropdown-service';
import { MatIcon } from '@/components/shared/icons/mat-icon';
import { MarkdownView } from '@/components/shared/markdown-view';
import { ROUTES } from '@/lib/constants/routes';
import { printHtmlContent } from '@/lib/utils/print-html-content';
import { useViewerStore } from '@/store/viewer-store';
import type { ViewerListItem } from '@/types/chat/viewer.type';
import { ChatSaveLibraryDialog } from './chat-save-library-dialog';

const MENU_WIDTH = 280;
const MENU_GAP = 4;

const CHECK_PATH =
  'M7.33021 13.2307L3.85521 9.75573L2.67188 10.9307L7.33021 15.5891L17.3302 5.58906L16.1552 4.41406L7.33021 13.2307Z';
const NEW_TAB_PATH =
  'M4.5 17C4.0875 17 3.73437 16.8531 3.44062 16.5594C3.14687 16.2656 3 15.9125 3 15.5V4.5C3 4.0875 3.14687 3.73438 3.44062 3.44063C3.73437 3.14688 4.0875 3 4.5 3H10V4.5H4.5V15.5H15.5V10H17V15.5C17 15.9125 16.8531 16.2656 16.5594 16.5594C16.2656 16.8531 15.9125 17 15.5 17H4.5ZM8.0625 13L7 11.9375L14.4375 4.5H12V3H17V8H15.5V5.5625L8.0625 13Z';
const SAVE_LIBRARY_PATH =
  'M5.99711 16.4984V7.49841C5.99711 7.08063 6.14294 6.72619 6.43461 6.43508C6.72627 6.14397 7.08044 5.99841 7.49711 5.99841H16.4971C16.9096 5.99841 17.2627 6.14528 17.5565 6.43903C17.8502 6.73278 17.9971 7.08591 17.9971 7.49841V13.9984L13.9971 17.9984H7.49711C7.08461 17.9984 6.73148 17.8515 6.43773 17.5578C6.14398 17.264 5.99711 16.9109 5.99711 16.4984ZM2.03877 5.35258C1.96933 4.9498 2.05613 4.5748 2.29919 4.22758C2.54225 3.88035 2.86516 3.67202 3.26794 3.60258L12.1221 2.01924C12.5249 1.9498 12.8964 2.0366 13.2367 2.27966C13.577 2.52271 13.7818 2.84563 13.8513 3.24841L14.0804 4.49841H12.5596L12.3721 3.49841L3.51794 5.08174L4.49711 10.5609V15.3109C4.27488 15.2137 4.08391 15.0673 3.92419 14.8717C3.76447 14.6762 3.66377 14.4545 3.62211 14.2067L2.03877 5.35258ZM7.49711 7.49841V16.4984H12.9971V12.9984H16.4971V7.49841H7.49711Z';
const SAVE_PDF_PATH =
  'M10 13L6 9L7.0625 7.9375L9.25 10.125V3H10.75V10.125L12.9375 7.9375L14 9L10 13ZM5.49417 16C5.08139 16 4.72917 15.8531 4.4375 15.5594C4.14583 15.2656 4 14.9125 4 14.5V13H5.5V14.5H14.5V13H16V14.5C16 14.9125 15.8531 15.2656 15.5592 15.5594C15.2653 15.8531 14.9119 16 14.4992 16H5.49417Z';

function PathIcon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <path d={d} fill="currentColor" />
    </svg>
  );
}

interface ChatSummaryProps {
  chatId: string | null;
  isDetailPage?: boolean;
  isReadOnly?: boolean;
  headerOptions?: ViewerListItem[];
  /** 折りたたみが変わったとき（手動・自動の両方）。ビューワーを包む枠の幅を変えるために使う */
  onCollapseChange?: (collapsed: boolean) => void;
  onOpenNewTab?: () => void;
  onSaveLibrary?: () => void;
  onSavePdf?: () => void;
}

interface MenuPosition {
  top: string;
  left: string;
}

const MENU_HIDDEN_POSITION: MenuPosition = { top: '0px', left: '0px' };

/** 移植元 `<app-chat-summary>`（shared/components/features/chat/chat-summary）。ライブラリ（Markdown）のビューワー */
export function ChatSummary({
  chatId,
  isDetailPage = false,
  isReadOnly = false,
  headerOptions = [],
  onCollapseChange,
  onOpenNewTab,
  onSaveLibrary,
  onSavePdf,
}: ChatSummaryProps) {
  const { t } = useTranslation();
  const activeLibrary = useViewerStore((s) => s.activeLibrary);
  const streamingLibraryTitle = useViewerStore((s) => s.streamingLibraryTitle);
  const isLibraryStreaming = useViewerStore((s) => s.isLibraryStreaming);
  const streamingRoomId = useViewerStore((s) => s.streamingRoomId);
  const listLoadedRoomId = useViewerStore((s) => s.listLoadedRoomId);
  const isListLoading = useViewerStore((s) => s.isLoadingList);
  const hasListLoadError = useViewerStore((s) => s.listLoadError);
  const hasContentLoadError = useViewerStore((s) => s.contentLoadError);
  const isContentLoading = useViewerStore((s) => s.isLoading);
  const markdownData = useViewerStore((s) => s.markdownContent);

  const [isCollapsed, setIsCollapsed] = useState(false);
  /** 自動折りたたみによる状態か（手動操作と区別する） */
  const [autoCollapsed, setAutoCollapsed] = useState(false);
  const [isTitleMenuOpen, setIsTitleMenuOpen] = useState(false);
  const [titleMenuStyle, setTitleMenuStyle] = useState<MenuPosition>(MENU_HIDDEN_POSITION);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [moreMenuStyle, setMoreMenuStyle] = useState<MenuPosition>(MENU_HIDDEN_POSITION);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const titleMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const moreMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const markdownContentRef = useRef<HTMLDivElement>(null);

  /** このビューワーが表示しているルームに対するライブラリストリーミングかどうか */
  const isStreamingForThisViewer = isLibraryStreaming && streamingRoomId === chatId;

  const activeDoc = useMemo<ViewerListItem>(() => {
    if (isStreamingForThisViewer && streamingLibraryTitle) {
      return { id: '', title: streamingLibraryTitle };
    }
    return activeLibrary ?? { id: '', title: '' };
  }, [isStreamingForThisViewer, streamingLibraryTitle, activeLibrary]);

  const canSaveLibrary =
    !isReadOnly && !isDetailPage && !isStreamingForThisViewer && !!activeDoc.id;

  const isViewerEmpty =
    !isListLoading && !hasListLoadError && headerOptions.length === 0 && !isStreamingForThisViewer;

  /** 一覧取得完了後にのみ自動折りたたみを評価する */
  const shouldAutoCollapse =
    !isDetailPage &&
    !isStreamingForThisViewer &&
    !(chatId && listLoadedRoomId !== chatId) &&
    isViewerEmpty;

  // ライブラリのストリーミング開始時は本文を表示できるよう自動展開する
  // （onCollapseChange の伝播で chat-data-panel 側の折りたたみも解除される）
  useEffect(() => {
    if (isStreamingForThisViewer && isCollapsed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsCollapsed(false);
      onCollapseChange?.(false);
    }
  }, [isStreamingForThisViewer, isCollapsed, onCollapseChange]);

  // ライブラリが1件も存在しないルームでは、一覧取得完了後にビューワーを閉じる
  useEffect(() => {
    if (shouldAutoCollapse) {
      if (!isCollapsed) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsCollapsed(true);
        setAutoCollapsed(true);
        onCollapseChange?.(true);
      }
      return;
    }

    if (autoCollapsed && isCollapsed && !isViewerEmpty) {
      setIsCollapsed(false);
      setAutoCollapsed(false);
      onCollapseChange?.(false);
    }
  }, [shouldAutoCollapse, isCollapsed, autoCollapsed, isViewerEmpty, onCollapseChange]);

  const closeMenus = () => {
    setIsTitleMenuOpen(false);
    setIsMoreMenuOpen(false);
  };

  const toggleCollapse = () => {
    closeMenus();
    dropdownService.notifyClosed();
    setAutoCollapsed(false);
    const next = !isCollapsed;
    setIsCollapsed(next);
    onCollapseChange?.(next);
  };

  const toggleTitleMenu = () => {
    if (isTitleMenuOpen) {
      setIsTitleMenuOpen(false);
      dropdownService.notifyClosed();
      return;
    }

    const rect = titleMenuTriggerRef.current?.getBoundingClientRect();
    if (rect) {
      setTitleMenuStyle({ top: `${rect.bottom + MENU_GAP}px`, left: `${rect.left}px` });
    }
    setIsMoreMenuOpen(false);
    setIsTitleMenuOpen(true);

    dropdownService.open(() => setIsTitleMenuOpen(false));
  };

  const selectDocument = (doc: ViewerListItem) => {
    useViewerStore.getState().selectLibrary(doc);
    setIsTitleMenuOpen(false);
    dropdownService.notifyClosed();
  };

  const toggleMoreMenu = () => {
    if (isMoreMenuOpen) {
      setIsMoreMenuOpen(false);
      dropdownService.notifyClosed();
      return;
    }

    const rect = moreMenuTriggerRef.current?.getBoundingClientRect();
    if (rect) {
      setMoreMenuStyle({ top: `${rect.bottom + MENU_GAP}px`, left: `${rect.right - MENU_WIDTH}px` });
    }
    setIsTitleMenuOpen(false);
    setIsMoreMenuOpen(true);

    dropdownService.open(() => setIsMoreMenuOpen(false));
  };

  const openInNewTab = () => {
    onOpenNewTab?.();
    setIsMoreMenuOpen(false);
    dropdownService.notifyClosed();

    if (!chatId) return;
    const libraryId = activeDoc.id;
    const path = ROUTES.APP.CHAT_VIEWER(chatId);
    window.open(libraryId ? `${path}?libraryId=${libraryId}` : path, '_blank');
  };

  const handleSaveToLibrary = () => {
    setIsMoreMenuOpen(false);
    dropdownService.notifyClosed();
    setIsSaveDialogOpen(true);
  };

  const handleSaveToPdf = () => {
    setIsMoreMenuOpen(false);
    dropdownService.notifyClosed();
    const title = activeDoc.title || t('CHAT.VIEWER.TITLE');
    printHtmlContent(markdownContentRef.current, title);
    onSavePdf?.();
  };

  const handleMarkdownContentClick = (event: MouseEvent<HTMLDivElement>) => {
    if (isReadOnly) return;

    // Markdown 内のボタン（ドロップダウンメニュー内を除く）は PDF 保存として扱う
    const clickedButton = (event.target as HTMLElement).closest('button');
    const isDropdownButton = clickedButton?.closest('.dropdown-menu');

    if (clickedButton && !isDropdownButton) {
      handleSaveToPdf();
    }
  };

  const menuStyle = (position: MenuPosition): CSSProperties => ({
    top: position.top,
    left: position.left,
    width: `${MENU_WIDTH}px`,
  });

  const renderContent = () => {
    if (isListLoading) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <CircularLoading />
        </div>
      );
    }
    if (hasListLoadError) {
      return (
        <p className="text-sm text-text-medium text-center">{t('CHAT.VIEWER.LOAD_ERROR')}</p>
      );
    }
    if (isViewerEmpty) {
      return <p className="text-sm text-text-medium text-center">{t('CHAT.VIEWER.EMPTY')}</p>;
    }
    if (hasContentLoadError) {
      return (
        <p className="text-sm text-text-medium text-center">
          {t('CHAT.VIEWER.CONTENT_LOAD_ERROR')}
        </p>
      );
    }
    if (isContentLoading) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <CircularLoading />
        </div>
      );
    }
    return <MarkdownView data={markdownData} className="chat-message-bubble viewer-markdown" />;
  };

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      {/* Title Dropdown Menu */}
      <div
        className={cx('dropdown-menu dropdown-menu--bordered', isTitleMenuOpen && 'is-open')}
        role="menu"
        hidden={!isTitleMenuOpen}
        style={menuStyle(titleMenuStyle)}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dropdown-menu-full">
          {headerOptions.map((doc) => (
            <button
              key={doc.id}
              type="button"
              className={cx(
                'flex items-center gap-2 h-9 w-full px-4 rounded-[4px] text-brand-secondary text-left',
                activeDoc.id === doc.id ? 'bg-bg-brand-weak' : 'hover:bg-bg-secondary',
              )}
              role="menuitem"
              onClick={() => selectDocument(doc)}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={cx('w-5 h-5 shrink-0', activeDoc.id !== doc.id && 'opacity-0')}
                aria-hidden="true"
                preserveAspectRatio="xMidYMid meet"
              >
                <path d={CHECK_PATH} fill="currentColor" />
              </svg>
              <span className="flex-1 min-w-0 truncate text-[12px] leading-[1.4]">{doc.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* More Options Dropdown Menu */}
      <div
        className={cx('dropdown-menu dropdown-menu--bordered', isMoreMenuOpen && 'is-open')}
        role="menu"
        hidden={!isMoreMenuOpen}
        style={menuStyle(moreMenuStyle)}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={cx('dropdown-item', (isDetailPage || isReadOnly) && 'hidden')}
          role="menuitem"
          onClick={openInNewTab}
        >
          <span className="dropdown-item-icon">
            <PathIcon d={NEW_TAB_PATH} />
          </span>
          {t('CHAT.VIEWER.OPEN_NEW_TAB')}
        </button>

        <div className={cx('dropdown-divider', (isDetailPage || isReadOnly) && 'hidden')} />

        <button
          type="button"
          data-testid="library-save-button"
          className={cx('dropdown-item', isReadOnly && 'hidden')}
          role="menuitem"
          onClick={handleSaveToLibrary}
          disabled={!canSaveLibrary}
        >
          <span className="dropdown-item-icon">
            <PathIcon d={SAVE_LIBRARY_PATH} />
          </span>
          {t('CHAT.VIEWER.SAVE_LIBRARY')}
        </button>

        <button
          type="button"
          className={cx('dropdown-item', isReadOnly && 'hidden')}
          role="menuitem"
          onClick={(event) => {
            event.stopPropagation();
            handleSaveToPdf();
          }}
        >
          <span className="dropdown-item-icon">
            <PathIcon d={SAVE_PDF_PATH} />
          </span>
          {t('CHAT.VIEWER.SAVE_PDF')}
        </button>
      </div>

      {/* Header */}
      <div className="shrink-0 px-6 overflow-hidden!">
        <div
          className={cx(
            'flex items-center w-full h-14',
            !isCollapsed && 'border-b border-border-weak justify-between pt-1',
            isCollapsed && 'justify-center',
          )}
        >
          {!isCollapsed && (
            <div className="dropdown min-w-0">
              <button
                ref={titleMenuTriggerRef}
                type="button"
                className="dropdown-trigger flex items-center gap-1 min-w-0 max-w-full px-2 py-1 rounded-md hover:bg-bg-secondary"
                aria-label={t('CHAT.VIEWER.CHANGE_DOC')}
                aria-haspopup="menu"
                aria-expanded={isTitleMenuOpen}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleTitleMenu();
                }}
              >
                <span className="text-h2 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {activeDoc.title}
                </span>
                <span className="flex justify-center items-center shrink-0 text-text-lighter">
                  <MatIcon name="keyboard_arrow_down" size={20} className="text-text-medium!" />
                </span>
              </button>
            </div>
          )}

          <div className="flex items-center gap-1 shrink-0">
            {!isCollapsed && !isReadOnly && (
              <button
                ref={moreMenuTriggerRef}
                type="button"
                data-testid="library-summary-more-button"
                className="inline-flex items-center justify-center transition-colors duration-200 cursor-pointer rounded-full text-text-weak hover:bg-bg-brand-weak w-9 h-9"
                aria-label={t('CHAT.VIEWER.MORE_OPTIONS')}
                aria-haspopup="menu"
                aria-expanded={isMoreMenuOpen}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleMoreMenu();
                }}
              >
                <MatIcon name="more_vert" size={20} />
              </button>
            )}

            {!isDetailPage && (
              <button
                type="button"
                className={cx(
                  'inline-flex items-center justify-center transition-colors duration-200 cursor-pointer rounded-full text-brand-primary hover:bg-bg-brand-weak hover:text-brand-secondary w-9 h-9',
                  isCollapsed ? 'bg-bg-brand-weak' : 'bg-transparent',
                )}
                aria-label={isCollapsed ? t('CHAT.VIEWER.OPEN') : t('CHAT.VIEWER.CLOSE')}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleCollapse();
                }}
              >
                <span className="flex justify-center items-center text-primary">
                  <MatIcon name="dock_to_right" size={20} />
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Markdown Content */}
      {!isCollapsed && (
        <div
          ref={markdownContentRef}
          className="w-full overflow-y-auto! flex-1 p-6 flex flex-col gap-6"
          onClick={handleMarkdownContentClick}
        >
          {renderContent()}
        </div>
      )}

      {isSaveDialogOpen && (
        <ChatSaveLibraryDialog
          libraryId={activeDoc.id}
          initialName={activeDoc.title}
          onSaved={(name) => {
            useViewerStore.getState().updateLibraryTitle(activeDoc.id, name);
            onSaveLibrary?.();
          }}
          onClose={() => setIsSaveDialogOpen(false)}
        />
      )}
    </div>
  );
}

/** ビューワーの資料の一覧を store から渡す `ChatSummary`。`ChatDataPanel`・`ChatWindow` の既定のビューワー */
export function ChatSummaryConnected({
  roomId,
  isReadOnly,
  onCollapseChange,
}: {
  roomId: string | null;
  isReadOnly: boolean;
  onCollapseChange: (collapsed: boolean) => void;
}) {
  const viewers = useViewerStore((s) => s.viewers);
  return (
    <ChatSummary
      chatId={roomId}
      headerOptions={viewers}
      isReadOnly={isReadOnly}
      onCollapseChange={onCollapseChange}
    />
  );
}
