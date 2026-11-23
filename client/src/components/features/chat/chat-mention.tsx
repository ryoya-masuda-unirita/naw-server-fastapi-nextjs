import { useEffect, useRef } from 'react';
import type { ChatInputControls } from '@/hooks/use-chat-input-controls';
import { filterAssistants, parseLeadingMention } from '@/lib/chat/assistant-filter';
import { confirmMentionSelection, selectMentionCandidates } from '@/lib/chat/mention-key-handler';
import { useChatInputUiStore } from '@/store/chat-input-ui-store';
import { ChatAssistantMentionPanel } from './chat-assistant-mention-panel';

interface ChatMentionProps {
  controls: ChatInputControls;
}

/** textarea の上に出す、アシスタントのメンション候補（`ChatInput` の `renderMention` に渡す） */
export function ChatMention({ controls }: ChatMentionProps) {
  const { messageContent, assistants, selectedAssistant } = controls;
  const isDismissed = useChatInputUiStore((s) => s.isMentionDismissed);
  const activeIndex = useChatInputUiStore((s) => s.mentionActiveIndex);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  // 一覧の再取得で Esc の「閉じた」状態が戻らないよう、effect の依存は入力だけにして一覧は ref で読む
  const assistantsRef = useRef(assistants);
  useEffect(() => {
    assistantsRef.current = assistants;
  }, [assistants]);

  // 入力が変わるたびに候補を開き直し、選択位置を候補の数に収める（移植元 syncMentionState）
  useEffect(() => {
    const { setMentionDismissed, setMentionActiveIndex } = useChatInputUiStore.getState();
    setMentionDismissed(false);
    if (!messageContent.startsWith('@')) {
      setMentionActiveIndex(0);
      return;
    }
    const count = filterAssistants(
      parseLeadingMention(messageContent).query,
      assistantsRef.current,
    ).length;
    const { mentionActiveIndex } = useChatInputUiStore.getState();
    if (mentionActiveIndex >= count) setMentionActiveIndex(Math.max(0, count - 1));
  }, [messageContent]);

  // ルームを移って入力欄が消えたら、候補の状態を持ち越さない
  useEffect(() => () => useChatInputUiStore.getState().reset(), []);

  const isOpen = messageContent.startsWith('@') && !isDismissed;
  if (!isOpen) return null;

  const filtered = selectMentionCandidates(controls, isDismissed);

  return (
    <div ref={anchorRef} className="contents">
      <ChatAssistantMentionPanel
        assistants={filtered}
        activeIndex={activeIndex}
        isEmpty={filtered.length === 0}
        selectedAssistantId={selectedAssistant?.id ?? null}
        onAssistantSelect={(assistant) =>
          confirmMentionSelection(
            assistant,
            controls,
            anchorRef.current?.parentElement?.querySelector('textarea') ?? null,
          )
        }
        onHoverIndex={(index) => useChatInputUiStore.getState().setMentionActiveIndex(index)}
      />
    </div>
  );
}
