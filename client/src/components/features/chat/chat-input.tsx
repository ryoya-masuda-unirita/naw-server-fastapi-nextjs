import { useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import {
  useChatInputControls,
  type ChatInputControls,
  type ChatSendPayload,
} from '@/hooks/use-chat-input-controls';
import { ChatClaude } from './chat-claude';
import { ChatError } from './chat-error';

/** 入力欄の textarea が伸びる上限（px。移植元と同じ） */
const TEXTAREA_MAX_HEIGHT_PX = 200;
/** IME の確定 Enter で送信してしまわないよう、確定直後の Enter を無視する時間（移植元と同じ） */
const COMPOSITION_END_GUARD_MS = 100;

interface ChatInputProps {
  roomId: string | null;
  defaultAssistantId: string | null;
  isError?: boolean;
  onSend: (payload: ChatSendPayload) => void;
  /**
   * 以下は、別 Issue の部品を移植元と同じ位置に差し込むための口。未指定なら空の領域になる。
   * いずれも入力欄の状態（`ChatInputControls`）を受け取る。
   */
  /** ドラッグ時に出す添付の領域（#287。移植元の `chat-input-file-upload` の中身） */
  renderDropzone?: (controls: ChatInputControls) => ReactNode;
  /** 添付ファイルのチップ列（#287） */
  renderAttachments?: (controls: ChatInputControls) => ReactNode;
  /** textarea の上に出すメンション候補（#286） */
  renderMention?: (controls: ChatInputControls) => ReactNode;
  /** 「＋」メニュー（添付・Web 検索・ライブラリ作成・テンプレート。#286・#287） */
  renderAddMenu?: (controls: ChatInputControls) => ReactNode;
  /** 有効な機能ウィジェットとアシスタント選択（#286） */
  renderToolbar?: (controls: ChatInputControls) => ReactNode;
  /** ファイルがドロップされたとき（添付の絞り込みと追加は #287） */
  onDropFiles?: (files: File[], controls: ChatInputControls) => void;
  /**
   * textarea のキー入力を先に受け取る。true を返すとこの入力欄では何もしない
   * （メンション候補の上下・Enter・Esc を #286 が処理するため）
   */
  onTextareaKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>, controls: ChatInputControls) => boolean;
}

/** 移植元 `<app-chat-input>`。メッセージの入力欄と送信ボタン */
export function ChatInput({
  roomId,
  defaultAssistantId,
  isError = false,
  onSend,
  renderDropzone,
  renderAttachments,
  renderMention,
  renderAddMenu,
  renderToolbar,
  onDropFiles,
  onTextareaKeyDown,
}: ChatInputProps) {
  const { t } = useTranslation();
  const controls = useChatInputControls({ roomId, defaultAssistantId });
  const {
    messageContent,
    setMessageContent,
    attachedFiles,
    setAttachedFiles,
    selectedAssistant,
    webSearchActive,
    templateActive,
    createLibraryActive,
    setCreateLibraryActive,
  } = controls;
  const [isDragging, setIsDragging] = useState(false);
  // 移植元はこの値を常に false のまま保つ（chat-claude は将来用の部品）
  const [isClaude] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isComposing = useRef(false);
  const justFinishedComposing = useRef(false);

  const isMentionPending = messageContent.startsWith('@');
  const canSend = !isMentionPending && (messageContent.trim().length > 0 || attachedFiles.length > 0);

  const autoResize = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, TEXTAREA_MAX_HEIGHT_PX)}px`;
  };

  const resetTextareaHeight = () => {
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleSend = () => {
    if (!canSend) return;

    onSend({
      content: messageContent,
      files: attachedFiles,
      assistantId: selectedAssistant?.id ?? null,
      useWebSearch: webSearchActive,
      additionalPrompt: templateActive?.systemPrompt,
      createLibrary: createLibraryActive,
    });

    setMessageContent('');
    setAttachedFiles([]);
    // ライブラリ作成は 1 回の送信ごとに解除する（Web 検索は維持）
    setCreateLibraryActive(false);
    resetTextareaHeight();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (onTextareaKeyDown?.(event, controls)) return;

    if (event.key === 'Enter' && !event.shiftKey) {
      if (justFinishedComposing.current) {
        justFinishedComposing.current = false;
        event.preventDefault();
        return;
      }
      if (isComposing.current || event.nativeEvent.isComposing) return;

      event.preventDefault();
      handleSend();
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) onDropFiles?.(files, controls);
  };

  return (
    <div className="chat-input">
      {isError && (
        <div className="flex flex-col items-center justify-center">
          <ChatError title={t('CHAT.MESSAGE.ERROR_TITLE')} message={t('CHAT.MESSAGE.ERROR_DESC')} />
        </div>
      )}
      <div
        className="chat-input-textarea-wrap relative rounded-xl border border-border-weak bg-bg-primary p-4 flex flex-col w-full z-9999"
        data-drag-over={isDragging}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="absolute top-0 left-0 z-99 bg-bg-primary opacity-0 pointer-events-none w-full h-full">
          {renderDropzone?.(controls)}
        </div>

        {renderAttachments?.(controls)}

        <div className="relative">
          {renderMention?.(controls)}

          <textarea
            ref={textareaRef}
            value={messageContent}
            onChange={(event) => {
              setMessageContent(event.target.value);
              autoResize(event.target);
            }}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => {
              isComposing.current = true;
              justFinishedComposing.current = false;
            }}
            onCompositionEnd={() => {
              isComposing.current = false;
              justFinishedComposing.current = true;
              setTimeout(() => {
                justFinishedComposing.current = false;
              }, COMPOSITION_END_GUARD_MS);
            }}
            rows={1}
            className="chat-input-textarea"
            data-testid="chat-input-textarea"
            placeholder={t('CHAT.INPUT.PLACEHOLDER')}
            aria-label={t('CHAT.INPUT.PLACEHOLDER')}
            style={{ height: 24 }}
          />
        </div>

        <div className="chat-input-bar min-w-0">
          <div className="chat-add-dropdown shrink-0 relative" data-chat-add-menu>
            {renderAddMenu?.(controls)}
          </div>

          <div className="flex flex-1 min-w-0 items-center gap-1">{renderToolbar?.(controls)}</div>

          <div className="chat-input-actions shrink-0 flex items-center gap-1">
            <button
              type="button"
              data-testid="chat-send-button"
              className="chat-input-send h-9 w-9 cursor-pointer bg-brand-primary text-white rounded-full flex justify-center items-center shrink-0"
              onClick={handleSend}
              disabled={!canSend}
              aria-label={t('CHAT.INPUT.SEND')}
            >
              <SvgIcon name="send" className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
      {isClaude && <ChatClaude />}

      <p className="text-note text-text-medium text-center">{t('CHAT.INPUT.DISCLAIMER')}</p>
    </div>
  );
}
