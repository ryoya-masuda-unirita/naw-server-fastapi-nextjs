import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAssistants } from '@/hooks/use-assistants';
import { Button } from '@/components/shared/button';
import { CircularLoading } from '@/components/shared/circular-loading';
import { Dialog } from '@/components/shared/dialog';
import { FileChip } from '@/components/shared/file-chip';
import { FileChipDocument } from '@/components/shared/file-chip-document';
import { MarkdownView } from '@/components/shared/markdown-view';
import { Skeleton } from '@/components/shared/skeleton';
import { getFilePreviewUrl } from '@/lib/utils/file-preview';
import type { MessageVersionInfo } from '@/lib/chat/message-thread';
import type { FileAttachment } from '@/types/chat/file-attachment.type';
import type { Message } from '@/types/chat/message.type';
import { ChatMessageFooter } from './chat-message-footer';
import { ChatReasoningDisplay } from './chat-reasoning-display';
import { MessageErrorSection } from './message-error-section';
import { MessageReference } from './message-reference';

/** 削除確認に出す本文の最大文字数 */
const DELETE_PREVIEW_MAX_LENGTH = 80;
/** IME の確定 Enter で送信してしまわないよう、確定直後の Enter を無視する時間（移植元と同じ） */
const COMPOSITION_END_GUARD_MS = 100;
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];

export type RatingDirection = 'up' | 'down';

interface ChatMessageItemProps {
  message: Message;
  versionInfo?: MessageVersionInfo | null;
  isReadOnly?: boolean;
  onCopy?: (messageId: string) => void;
  onRegenerate?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onRate?: (data: { messageId: string; rating: RatingDirection }) => void;
  /** 編集の再送信。引数は編集後の本文 */
  onEditSend?: (newText: string) => void;
  onPrevVersion?: () => void;
  onNextVersion?: () => void;
}

function isImageFile(attachment: FileAttachment | File): boolean {
  if (attachment instanceof File) {
    return attachment.type.startsWith('image/');
  }
  const typeFromField = attachment.type?.toLowerCase() ?? '';
  if (IMAGE_EXTENSIONS.includes(typeFromField)) return true;
  const ext = attachment.name.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.includes(ext);
}

/** 回答 HTML の最初の要素の文字列（削除確認の本文用）。移植元 extractFirstTagText */
function extractFirstTagText(html: string): string {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const first = tmp.firstElementChild;
  return (first?.textContent ?? tmp.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function ImageChip({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="file-chip file-chip--image">
      <img src={src} alt={alt} className="file-chip__img" />
    </div>
  );
}

/** 移植元 `<app-chat-message-item>`。ユーザーの質問（編集つき）とアシスタントの回答 */
export function ChatMessageItem({
  message,
  versionInfo = null,
  isReadOnly = false,
  onCopy,
  onRegenerate,
  onDelete,
  onRate,
  onEditSend,
  onPrevVersion,
  onNextVersion,
}: ChatMessageItemProps) {
  const { t } = useTranslation();
  const { data: assistants, isPending: isAssistantsPending } = useAssistants();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const isComposing = useRef(false);
  const justFinishedComposing = useRef(false);

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isPendingAssistant = isAssistant && message.status === 'PENDING' && !message.answer?.trim();
  const hasReasoning = (message.reasoning?.sections.length ?? 0) > 0;
  const hasAttachments = Number(message.attachmentFiles?.length) > 0 || Number(message.files?.length) > 0;

  const showPagination = (versionInfo?.total ?? 0) > 1;
  const assistantName = useMemo(() => {
    const id = message.assistantId;
    if (!id) return '';
    return (assistants ?? []).find((a) => a.id === id)?.name ?? '';
  }, [assistants, message.assistantId]);
  // アシスタント一覧の初回読み込み中は、名前が解決できないので「不明なアシスタント」の代わりにプレースホルダーを出す
  const assistantNamePending = !!message.assistantId && !assistantName && isAssistantsPending;
  // 削除済み等で解決できないアシスタントの回答（とそれに紐づくメッセージ）は、再送信先が分からないので編集・再生成を禁止する
  const isAssistantUnresolved = !assistantNamePending && !assistantName;
  const thumbsUpActive = message.rating === 'GOOD';
  const thumbsDownActive = message.rating === 'BAD';

  const openEdit = () => {
    if (isAssistantUnresolved) return;
    setEditText(message.question);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditText('');
  };

  const submitEdit = () => {
    const text = editText.trim();
    if (!text || isAssistantUnresolved) return;
    onEditSend?.(text);
    setIsEditing(false);
    setEditText('');
  };

  const handleEditKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    if (justFinishedComposing.current) {
      justFinishedComposing.current = false;
      event.preventDefault();
      return;
    }
    if (isComposing.current || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submitEdit();
  };

  const handleCopy = () => {
    const text = isUser ? message.question : message.answer;
    void navigator.clipboard.writeText(text);
    onCopy?.(message.id);
  };

  const deleteText = isUser ? message.question : extractFirstTagText(message.answer);
  const deleteBody =
    deleteText.length > DELETE_PREVIEW_MAX_LENGTH
      ? `${deleteText.slice(0, DELETE_PREVIEW_MAX_LENGTH)}…`
      : deleteText;

  const footerHandlers = {
    onCopy: handleCopy,
    onThumbsUp: () => onRate?.({ messageId: message.messageId, rating: 'up' }),
    onThumbsDown: () => onRate?.({ messageId: message.messageId, rating: 'down' }),
    onRegenerate: () => {
      if (!isAssistantUnresolved) onRegenerate?.(message.id);
    },
    onDelete: () => setIsDeleteOpen(true),
  };

  const deleteDialog = (
    <Dialog
      open={isDeleteOpen}
      title={t(isUser ? 'CHAT.MESSAGE.DELETE_USER_TITLE' : 'CHAT.MESSAGE.DELETE_ASSISTANT_TITLE')}
      message={deleteBody}
      confirmText={t('COMMON.DELETE')}
      cancelText={t('COMMON.CANCEL')}
      confirmDanger
      confirmIcon="delete"
      buttonAlign="center"
      showConfirm
      showCancel
      dialogWidth="800px"
      onClose={(confirmed) => {
        setIsDeleteOpen(false);
        if (confirmed) onDelete?.(message.messageId);
      }}
    />
  );

  if (isUser) {
    return (
      <article data-testid="chat-message-item" className="chat-message chat-message--user max-w-full min-w-0">
        {hasAttachments && (
          <div className="chat-user-attachments">
            {message.attachmentFiles?.map((attachment) =>
              isImageFile(attachment) ? (
                <ImageChip key={attachment.id} src={getFilePreviewUrl(attachment)} alt={attachment.name} />
              ) : (
                <FileChipDocument key={attachment.id} name={attachment.name} />
              ),
            )}
            {message.files?.map((file, index) =>
              isImageFile(file) ? (
                <ImageChip key={index} src={getFilePreviewUrl(file)} alt={file.name} />
              ) : (
                // 移植元は showRemoveBtn の既定（true）のまま描画する（押しても何も起きない）。見た目を揃えてそのまま移す
                <FileChip key={index} file={file} />
              ),
            )}
          </div>
        )}

        {message.question && (
          <div className="chat-user-bubble max-w-full min-w-0" hidden={isEditing}>
            <p className="chat-user-text whitespace-pre-wrap wrap-break-word">{message.question}</p>
          </div>
        )}

        <ChatMessageFooter
          {...footerHandlers}
          hidden={isEditing}
          isUser
          isReadOnly={isReadOnly}
          assistantUnresolved={isAssistantUnresolved}
          showPagination={showPagination}
          versionCurrent={versionInfo?.current ?? 1}
          versionTotal={versionInfo?.total ?? 1}
          canPrevVersion={versionInfo?.canPrev ?? false}
          canNextVersion={versionInfo?.canNext ?? false}
          thumbsUpActive={thumbsUpActive}
          thumbsDownActive={thumbsDownActive}
          onOpenEdit={openEdit}
          onPrevVersion={onPrevVersion}
          onNextVersion={onNextVersion}
        />

        <div className="chat-user-edit" hidden={!isEditing || isReadOnly}>
          <div className="chat-user-edit-field">
            <textarea
              className="chat-user-textarea"
              rows={5}
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
              onKeyDown={handleEditKeyDown}
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
            />
          </div>
          <div className="chat-user-edit-footer">
            <p className="chat-edit-note">
              {t('CHAT.MESSAGE.EDIT_NOTE')}
              {hasAttachments && (
                <>
                  <br />
                  {t('CHAT.MESSAGE.EDIT_NOTE_ATTACHMENT')}
                </>
              )}
            </p>
            <div className="flex items-center gap-2 shrink-0 w-full justify-end">
              <Button variant="text" size="sm" classProps="text-sm! px-3! py-2!" heightPx={37.59} onClick={cancelEdit}>
                {t('COMMON.CANCEL')}
              </Button>
              <Button variant="solid" size="sm" classProps="text-sm! px-3! py-2!" heightPx={37.59} onClick={submitEdit}>
                {t('CHAT.MESSAGE.RESEND')}
              </Button>
            </div>
          </div>
        </div>
        {deleteDialog}
      </article>
    );
  }

  if (!isAssistant) return null;

  return (
    <article data-testid="chat-message-item" className="chat-message chat-message--assistant">
      <div className="chat-message-sender">
        {assistantNamePending ? (
          <Skeleton variant="text" width="8rem" height="0.875rem" />
        ) : (
          assistantName || t('CHAT.MESSAGE.UNKNOWN_ASSISTANT')
        )}
      </div>
      {hasReasoning && message.reasoning && <ChatReasoningDisplay reasoning={message.reasoning} />}
      {isPendingAssistant ? (
        <div className="chat-message-bubble">
          <CircularLoading />
        </div>
      ) : (
        <div data-testid="chat-response-container" className="chat-message-bubble">
          {message.status === 'ERROR' ? (
            <MessageErrorSection errorMessage={message.message ?? ''} />
          ) : (
            <>
              <MarkdownView data={message.answer} />
              {!!message.referenceFilePaths?.length && (
                <MessageReference referenceFilePaths={message.referenceFilePaths} />
              )}
            </>
          )}
        </div>
      )}

      {!isPendingAssistant && (
        <ChatMessageFooter
          {...footerHandlers}
          isReadOnly={isReadOnly}
          assistantUnresolved={isAssistantUnresolved}
          thumbsUpActive={thumbsUpActive}
          thumbsDownActive={thumbsDownActive}
        />
      )}
      {deleteDialog}
    </article>
  );
}
