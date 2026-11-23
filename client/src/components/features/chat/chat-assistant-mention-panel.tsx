import { useTranslation } from 'react-i18next';
import type { Assistant } from '@/types/chat/assistant.type';
import { ChatInputIcon } from './chat-input-icons';
import './chat-assistant-mention-panel.css';

interface ChatAssistantMentionPanelProps {
  assistants: Assistant[];
  activeIndex?: number;
  isEmpty?: boolean;
  selectedAssistantId?: string | null;
  onAssistantSelect: (assistant: Assistant) => void;
  onHoverIndex: (index: number) => void;
}

/** 移植元 `<app-chat-assistant-mention-panel>`。「@」で始まる入力に出す、アシスタントの候補 */
export function ChatAssistantMentionPanel({
  assistants,
  activeIndex = 0,
  isEmpty = false,
  selectedAssistantId = null,
  onAssistantSelect,
  onHoverIndex,
}: ChatAssistantMentionPanelProps) {
  const { t } = useTranslation();

  return (
    <div
      className="chat-assistant-mention-panel block absolute left-0 right-0 bottom-full mb-1 z-100"
    >
      <div className="mention-panel" role="listbox" aria-label={t('CHAT.INPUT.SELECT_ASSISTANT')}>
        {isEmpty ? (
          <p className="mention-panel__empty px-4 py-3 text-(length:--text-note) text-text-medium">
            {t('CHAT.INPUT.ASSISTANT_MENTION_EMPTY')}
          </p>
        ) : (
          <div className="flex flex-col min-w-0 max-h-80 overflow-y-auto">
            {assistants.map((assistant, index) => {
              const isActive = activeIndex === index;
              const isSelected = selectedAssistantId === assistant.id;
              return (
                <button
                  key={assistant.id}
                  type="button"
                  className="mention-option flex h-auto gap-1 items-start cursor-pointer w-full px-4 py-2 text-left rounded-sm text-(length:--text-note) text-text-strong transition-colors duration-150 shrink-0 hover:bg-bg-brand-weak"
                  role="option"
                  aria-selected={isActive}
                  data-active={isActive ? 'true' : undefined}
                  onClick={() => onAssistantSelect(assistant)}
                  onMouseEnter={() => onHoverIndex(index)}
                >
                  <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <div className="flex items-start gap-2 w-full">
                      <span
                        className={`flex h-5 w-5 shrink-0 justify-center items-center${isSelected ? '' : ' opacity-0'}`}
                        data-testid="chat-mention-option-check"
                        aria-hidden="true"
                      >
                        <ChatInputIcon name="check" className="w-5 h-5" />
                      </span>
                      <span
                        className={`flex-1 min-w-0 truncate text-note${isSelected || isActive ? ' text-primary' : ''}`}
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
        )}
      </div>
    </div>
  );
}
