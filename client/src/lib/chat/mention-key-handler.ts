import type { KeyboardEvent } from 'react';
import type { ChatInputControls } from '@/hooks/use-chat-input-controls';
import { filterAssistants, parseLeadingMention } from '@/lib/chat/assistant-filter';
import { useChatInputUiStore } from '@/store/chat-input-ui-store';
import type { Assistant } from '@/types/chat/assistant.type';

/** 「@」で始まる入力を、候補の絞り込みに使うアシスタントの一覧にする。候補を閉じているときは空 */
export function selectMentionCandidates(controls: ChatInputControls, isDismissed: boolean): Assistant[] {
  if (!controls.messageContent.startsWith('@') || isDismissed) return [];
  return filterAssistants(parseLeadingMention(controls.messageContent).query, controls.assistants);
}

/** 候補を選んだとき: 本文から「@検索語」を消し、アシスタントを切り替えて入力欄に戻る（移植元 confirmMentionSelection） */
export function confirmMentionSelection(
  assistant: Assistant,
  controls: ChatInputControls,
  textarea: HTMLTextAreaElement | null,
): void {
  const { rest } = parseLeadingMention(controls.messageContent);
  controls.setMessageContent(rest);
  controls.setSelectedAssistant(assistant);
  const { setMentionDismissed, setMentionActiveIndex } = useChatInputUiStore.getState();
  setMentionDismissed(false);
  setMentionActiveIndex(0);
  if (textarea) {
    textarea.style.height = 'auto';
    textarea.focus();
  }
}

/**
 * textarea のキー入力のうち、メンション候補に関するもの（↑↓・Esc・Enter・Tab）を処理する（移植元 handleKeyDown の前半）。
 * 処理したら true を返す（`ChatInput` はそのキーで送信などをしない）。
 */
export function handleMentionKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  controls: ChatInputControls,
): boolean {
  const ui = useChatInputUiStore.getState();
  const isOpen = controls.messageContent.startsWith('@') && !ui.isMentionDismissed;
  if (!isOpen) return false;

  const filtered = selectMentionCandidates(controls, ui.isMentionDismissed);

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (filtered.length === 0) return true;
    ui.setMentionActiveIndex(Math.min(ui.mentionActiveIndex + 1, filtered.length - 1));
    return true;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (filtered.length === 0) return true;
    ui.setMentionActiveIndex(Math.max(ui.mentionActiveIndex - 1, 0));
    return true;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    ui.setMentionDismissed(true);
    return true;
  }

  if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
    // 日本語変換の確定キーは、変換の確定だけに使う
    if (event.nativeEvent.isComposing) return true;

    if (filtered.length > 0) {
      event.preventDefault();
      const target = filtered[Math.min(ui.mentionActiveIndex, filtered.length - 1)];
      confirmMentionSelection(target, controls, event.currentTarget);
    } else if (event.key === 'Enter') {
      event.preventDefault();
    }
    return true;
  }

  return false;
}
