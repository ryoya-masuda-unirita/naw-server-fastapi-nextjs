import { useRef, useState, useEffect, useCallback, type CSSProperties } from 'react';
import { dropdownService } from '@/components/shared/dropdown-service';
import type { Assistant } from '@/types/chat/assistant.type';
import { ChatInputIcon } from './chat-input-icons';
import './chat-assistant-selector.css';

const PANEL_WIDTH = 320;
const PANEL_PAD = 8;
const PANEL_MAX_HEIGHT = 320;
const PANEL_MIN_HEIGHT = 120;
/** ボタンとパネルの間の隙間(px) */
const PANEL_GAP = 4;

interface ChatAssistantSelectorProps {
  assistants: Assistant[];
  selectedAssistant: Assistant | null;
  onAssistantSelect: (assistant: Assistant) => void;
}

/** パネルをボタンの上に、画面からはみ出さないように置く位置（移植元 updatePanelPosition） */
function computePanelStyle(button: HTMLButtonElement): CSSProperties {
  const rect = button.getBoundingClientRect();
  const panelWidth = Math.min(PANEL_WIDTH, window.innerWidth - PANEL_PAD * 2);
  const maxHeight = Math.max(Math.min(rect.top - PANEL_PAD, PANEL_MAX_HEIGHT), PANEL_MIN_HEIGHT);
  const left = Math.min(
    Math.max(PANEL_PAD, rect.right - panelWidth),
    window.innerWidth - panelWidth - PANEL_PAD,
  );

  return {
    bottom: `${window.innerHeight - rect.top + PANEL_GAP}px`,
    left: `${left}px`,
    width: `${panelWidth}px`,
    maxHeight: `${maxHeight}px`,
  };
}

/** 移植元 `<app-chat-assistant-selector>`。入力欄の右下にある、アシスタントを選ぶドロップダウン */
export function ChatAssistantSelector({
  assistants,
  selectedAssistant,
  onAssistantSelect,
}: ChatAssistantSelectorProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    bottom: '0px',
    left: '0px',
    width: `${PANEL_WIDTH}px`,
    maxHeight: `${PANEL_MAX_HEIGHT}px`,
  });

  const close = useCallback(() => setIsOpen(false), []);

  // 自分の外側をクリックしたら閉じる（移植元の `document:click`）
  useEffect(() => {
    if (!isOpen) return;
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('.chat-assistant-selector')) close();
    };
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, [isOpen, close]);

  const toggle = () => {
    if (isOpen) {
      setIsOpen(false);
      dropdownService.notifyClosed();
      return;
    }
    if (triggerRef.current) setPanelStyle(computePanelStyle(triggerRef.current));
    setIsOpen(true);
    dropdownService.open(close);
  };

  const select = (assistant: Assistant) => {
    onAssistantSelect(assistant);
    setIsOpen(false);
    dropdownService.notifyClosed();
  };

  return (
    <div
      className="chat-assistant-selector flex min-w-0 max-w-full justify-end items-center ml-auto relative [&>*]:min-w-0 [&>*]:max-w-full"
    >
      <div
        className="dl-wrap block relative min-w-0"
        data-dl-variant="chat"
        data-open={isOpen ? 'true' : 'false'}
      >
        <button
          ref={triggerRef}
          data-testid="assistant-select-button"
          type="button"
          className={`dl-trigger text-sm! dl-trigger--chat hover:bg-bg-brand-weak!${isOpen ? ' bg-bg-brand-weak!' : ''}`}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          onClick={(event) => {
            event.stopPropagation();
            toggle();
          }}
        >
          <span className="dl-trigger__value">{selectedAssistant?.name || ''}</span>
          <ChatInputIcon name="chevronDown" className="dl-trigger__chevron" />
        </button>

        <div
          className="dl-panel dl-panel--up dl-panel--chat-fixed"
          role="listbox"
          hidden={!isOpen}
          style={panelStyle}
        >
          <div className="flex flex-col min-w-0 min-h-0">
            <div className="flex flex-col overflow-y-auto min-h-0">
              {assistants.map((assistant) => {
                const isSelected = selectedAssistant?.id === assistant.id;
                return (
                  <button
                    key={assistant.id}
                    type="button"
                    data-testid="assistant-option-item"
                    className="dl-option dl-option--rich flex h-auto gap-1 items-start cursor-pointer w-full px-4 py-2 text-left rounded-sm text-(length:--text-note) text-text-strong transition-colors duration-150 shrink-0 hover:bg-bg-brand-weak"
                    role="option"
                    aria-selected={isSelected}
                    data-selected={isSelected ? 'true' : undefined}
                    onClick={() => select(assistant)}
                  >
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <div className="flex items-start gap-2 w-full">
                        <span
                          className={`dl-option__check flex h-5 w-5 shrink-0 justify-center items-center ${isSelected ? '' : 'opacity-0'}`}
                          aria-hidden="true"
                        >
                          <ChatInputIcon name="check" className="w-5 h-5" />
                        </span>
                        <span
                          className={`flex-1 min-w-0 truncate text-note${isSelected ? ' text-primary' : ''}`}
                        >
                          {assistant.name}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 items-start w-full pl-7">
                        <p className="text-(length:--text-note-small) leading-[1.4] text-text-medium line-clamp-2 w-full">
                          {assistant.description}
                        </p>
                        {assistant.category && (
                          <span className="inline-flex rounded-sm border border-border-strong px-1 py-0.5 text-(length:--text-note-small) font-medium whitespace-nowrap text-text-medium self-start">
                            {assistant.category}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
