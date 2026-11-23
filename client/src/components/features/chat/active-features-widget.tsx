import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { MatIcon } from '@/components/shared/icons/mat-icon';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import type { ChatInputTemplate } from '@/hooks/use-chat-input-controls';
import type { ActiveFeature } from '@/lib/chat/active-feature';
import { useChatInputUiStore } from '@/store/chat-input-ui-store';
import { ChatInputIcon } from './chat-input-icons';
import './chat-multi-panel.css';

const PANEL_GAP = 8;
const PANEL_MAX_HEIGHT = 320;
const PANEL_MIN_HEIGHT = 120;

const CLOSE_BUTTON_CLASS =
  'flex h-4 w-4 bg-text-strong rounded-full justify-center items-center hover:bg-bg-brand-weak transition-colors';

interface ActiveFeaturesWidgetProps {
  webSearchActive?: boolean;
  templateActive?: ChatInputTemplate | null;
  createLibraryActive?: boolean;
  activeCount?: number;
  onClearWebSearch: () => void;
  onClearTemplate: () => void;
  onClearCreateLibrary: () => void;
  onClearFeature: (feature: ActiveFeature) => void;
}

/** ボタンの上に出す複数機能パネルの位置（移植元 updatePanelPosition） */
function computePanelStyle(button: HTMLButtonElement): CSSProperties {
  const rect = button.getBoundingClientRect();
  const maxHeight = Math.max(Math.min(rect.top - PANEL_GAP, PANEL_MAX_HEIGHT), PANEL_MIN_HEIGHT);
  return {
    bottom: `${window.innerHeight - rect.top + PANEL_GAP}px`,
    right: `${window.innerWidth - rect.right}px`,
    maxHeight: `${maxHeight}px`,
  };
}

/**
 * 移植元 `<app-active-features-widget>`。入力欄で有効にしている機能（Web 検索・テンプレート・ライブラリ作成）を
 * 1 つなら名前付きで、2 つ以上なら件数付きのボタンとパネルで出す。
 */
export function ActiveFeaturesWidget({
  webSearchActive = false,
  templateActive = null,
  createLibraryActive = false,
  activeCount = 0,
  onClearWebSearch,
  onClearTemplate,
  onClearCreateLibrary,
  onClearFeature,
}: ActiveFeaturesWidgetProps) {
  const { t } = useTranslation();
  const isMultiPanelOpen = useChatInputUiStore((s) => s.isMultiPanelOpen);
  const setMultiPanelOpen = useChatInputUiStore((s) => s.setMultiPanelOpen);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | undefined>(undefined);

  // パネルを開くたびに、ボタンの位置から置き直す
  useEffect(() => {
    if (!isMultiPanelOpen || !buttonRef.current) return;
    setPanelStyle(computePanelStyle(buttonRef.current));
  }, [isMultiPanelOpen]);

  // パネルの外側をクリックしたら閉じる
  useEffect(() => {
    if (!isMultiPanelOpen) return;
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-chat-multi-wrap]')) setMultiPanelOpen(false);
    };
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, [isMultiPanelOpen, setMultiPanelOpen]);

  // 機能が 2 つ未満になったらパネルを閉じる（移植元は @if でパネルごと消える）
  useEffect(() => {
    if (activeCount < 2 && isMultiPanelOpen) setMultiPanelOpen(false);
  }, [activeCount, isMultiPanelOpen, setMultiPanelOpen]);

  const manageLabel = t('CHAT.INPUT.MANAGE_ACTIVE_FEATURES');

  const clearSingle = () => {
    if (webSearchActive) onClearWebSearch();
    else if (templateActive) onClearTemplate();
    else onClearCreateLibrary();
  };

  return (
    <>
      {activeCount === 1 && (
        <div className="chat-active-button min-w-0" data-chat-active-btn aria-label={manageLabel}>
          {webSearchActive && (
            <>
              <ChatInputIcon name="globe" />
              <span className="chat-active-button-text text-sm">{t('CHAT.INPUT.WEB_SEARCH')}</span>
            </>
          )}
          {templateActive && (
            <>
              <ChatInputIcon name="template" />
              <span className="chat-active-button-text text-sm">{templateActive.label}</span>
            </>
          )}
          {createLibraryActive && (
            <>
              <SvgIcon name="library" />
              <span className="chat-active-button-text text-sm">
                {t('CHAT.INPUT.CREATE_LIBRARY')}
              </span>
            </>
          )}

          <button
            type="button"
            className={CLOSE_BUTTON_CLASS}
            aria-label={t('COMMON.CLOSE')}
            onClick={(event) => {
              event.stopPropagation();
              clearSingle();
            }}
          >
            <MatIcon name="close" size={12} className="text-white!" />
          </button>
        </div>
      )}

      {activeCount >= 2 && (
        <div className="relative z-10!" data-chat-multi-wrap="">
          {isMultiPanelOpen && (
            <div
              className="chat-multi-backdrop is-visible md:hidden!"
              onClick={() => setMultiPanelOpen(false)}
              aria-hidden="true"
            ></div>
          )}

          <button
            ref={buttonRef}
            type="button"
            className="chat-active-button shrink-0"
            data-chat-active-btn
            aria-label={manageLabel}
            onClick={() => setMultiPanelOpen(!isMultiPanelOpen)}
          >
            <MatIcon name="page_info" size={16} className="text-primary!" />
            <span className="chat-active-badge">{activeCount}</span>
          </button>

          {isMultiPanelOpen && (
            <div className="chat-multi-panel" role="menu" aria-label={manageLabel} style={panelStyle}>
              {webSearchActive && (
                <div className="chat-multi-item text-primary">
                  <ChatInputIcon name="globe" size={16} />
                  <span className="flex-1 text-xs">{t('CHAT.INPUT.WEB_SEARCH')}</span>
                  <button
                    type="button"
                    className={CLOSE_BUTTON_CLASS}
                    aria-label={t('COMMON.CLOSE')}
                    onClick={() => onClearFeature('web')}
                  >
                    <MatIcon name="close" size={12} className="text-white!" />
                  </button>
                </div>
              )}
              {templateActive && (
                <div className="chat-multi-item text-primary">
                  <ChatInputIcon name="template" size={16} />
                  <span className="flex-1 text-xs truncate">{templateActive.label}</span>
                  <button
                    type="button"
                    className={CLOSE_BUTTON_CLASS}
                    aria-label={t('COMMON.CLOSE')}
                    onClick={() => onClearFeature('template')}
                  >
                    <MatIcon name="close" size={12} className="text-white!" />
                  </button>
                </div>
              )}
              {createLibraryActive && (
                <div className="chat-multi-item text-primary">
                  <SvgIcon name="library" className="w-4! h-4! shrink-0" />
                  <span className="flex-1 text-xs">{t('CHAT.INPUT.CREATE_LIBRARY')}</span>
                  <button
                    type="button"
                    className={CLOSE_BUTTON_CLASS}
                    aria-label={t('COMMON.CLOSE')}
                    onClick={() => onClearFeature('library')}
                  >
                    <MatIcon name="close" size={12} className="text-white!" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
