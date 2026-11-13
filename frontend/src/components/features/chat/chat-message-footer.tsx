import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SvgIcon } from '@/components/shared/icons/svg-icon';

/** コピー済みのチェック表示を戻すまでの時間（移植元と同じ 2 秒） */
const COPIED_RESET_MS = 2000;

const ACTION_BUTTON_BASE =
  'inline-flex items-center justify-center transition-colors duration-200 rounded-full text-text-weak hover:bg-bg-brand-weak w-7 h-7';

interface ChatMessageFooterProps {
  showPagination?: boolean;
  versionCurrent?: number;
  versionTotal?: number;
  canPrevVersion?: boolean;
  canNextVersion?: boolean;
  isUser?: boolean;
  isReadOnly?: boolean;
  assistantUnresolved?: boolean;
  thumbsUpActive?: boolean;
  thumbsDownActive?: boolean;
  /** 親（chat-message-item）が非表示にするときに使う（移植元の `[hidden]` バインド） */
  hidden?: boolean;
  onCopy: () => void;
  onThumbsUp: () => void;
  onThumbsDown: () => void;
  onRegenerate: () => void;
  onDelete: () => void;
  onOpenEdit?: () => void;
  onPrevVersion?: () => void;
  onNextVersion?: () => void;
}

/** 移植元 `<app-chat-message-footer>`。コピー・評価・編集・再生成・削除・版の切り替え */
export function ChatMessageFooter({
  showPagination = false,
  versionCurrent = 1,
  versionTotal = 1,
  canPrevVersion = false,
  canNextVersion = false,
  isUser = false,
  isReadOnly = false,
  assistantUnresolved = false,
  thumbsUpActive = false,
  thumbsDownActive = false,
  hidden = false,
  onCopy,
  onThumbsUp,
  onThumbsDown,
  onRegenerate,
  onDelete,
  onOpenEdit,
  onPrevVersion,
  onNextVersion,
}: ChatMessageFooterProps) {
  const { t } = useTranslation();
  const [isCopied, setIsCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const handleCopy = () => {
    setIsCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setIsCopied(false), COPIED_RESET_MS);
    onCopy();
  };

  const unresolvedTitle = assistantUnresolved
    ? t('CHAT.MESSAGE.ASSISTANT_UNRESOLVED_ACTION_DISABLED')
    : undefined;

  return (
    <div className="chat-message-footer" hidden={hidden}>
      <div className="chat-message-actions">
        <div className="chat-pagination" hidden={!showPagination || isReadOnly}>
          <button
            type="button"
            className={`chat-message-action${canPrevVersion ? '' : ' opacity-40 cursor-not-allowed'}`}
            disabled={!canPrevVersion}
            aria-label={t('CHAT.MESSAGE.PREV_VERSION')}
            onClick={() => onPrevVersion?.()}
          >
            <SvgIcon name="chevronLeft" className="w-5 h-5" />
          </button>
          <span className="chat-pagination-label">
            {versionCurrent}/{versionTotal}
          </span>
          <button
            type="button"
            className={`chat-message-action${canNextVersion ? '' : ' opacity-40 cursor-not-allowed'}`}
            disabled={!canNextVersion}
            aria-label={t('CHAT.MESSAGE.NEXT_VERSION')}
            onClick={() => onNextVersion?.()}
          >
            <SvgIcon name="chevronRight" className="w-5 h-5" />
          </button>
        </div>
        <button
          type="button"
          data-copy-btn
          className={`${ACTION_BUTTON_BASE} cursor-pointer${isCopied ? ' chat-message-action--copied' : ''}`}
          aria-label="コピー"
          onClick={handleCopy}
        >
          <span data-icon-default>
            <SvgIcon name="copy" className="w-5 h-5" />
          </span>
          <span data-icon-copied>
            <SvgIcon name="check" className="w-5 h-5" />
          </span>
        </button>
        <button
          type="button"
          data-thumbs-up-btn
          className={`${ACTION_BUTTON_BASE} disabled:cursor-not-allowed${thumbsUpActive ? ' is-on' : ' cursor-pointer'}`}
          disabled={thumbsUpActive}
          aria-label="良い"
          hidden={isUser || isReadOnly}
          onClick={() => {
            if (!thumbsUpActive) onThumbsUp();
          }}
        >
          <span data-icon-default>
            <SvgIcon name="thumbsUpOutline" className="w-5 h-5" />
          </span>
          <span data-icon-on className="text-primary!">
            <SvgIcon name="thumbsUp" className="w-5 h-5" />
          </span>
        </button>
        <button
          type="button"
          data-thumbs-down-btn
          className={`${ACTION_BUTTON_BASE} disabled:cursor-not-allowed${thumbsDownActive ? ' is-on' : ' cursor-pointer'}`}
          disabled={thumbsDownActive}
          aria-label="良くない"
          hidden={isUser || isReadOnly}
          onClick={() => {
            if (!thumbsDownActive) onThumbsDown();
          }}
        >
          <span data-icon-default>
            <SvgIcon name="thumbsDownOutline" className="w-5 h-5" />
          </span>
          <span data-icon-on className="text-primary!">
            <SvgIcon name="thumbsDown" className="w-5 h-5" />
          </span>
        </button>
        <button
          type="button"
          className={`${ACTION_BUTTON_BASE} cursor-pointer disabled:cursor-not-allowed disabled:opacity-40`}
          aria-label={t('CHAT.MESSAGE.EDIT')}
          title={unresolvedTitle}
          disabled={assistantUnresolved}
          hidden={!isUser || isReadOnly}
          onClick={() => {
            if (!assistantUnresolved) onOpenEdit?.();
          }}
        >
          <SvgIcon name="edit" className="w-5 h-5" />
        </button>
        <button
          type="button"
          className={`${ACTION_BUTTON_BASE} cursor-pointer disabled:cursor-not-allowed disabled:opacity-40`}
          aria-label="再生成"
          title={unresolvedTitle}
          disabled={assistantUnresolved}
          hidden={isUser || isReadOnly}
          onClick={() => {
            if (!assistantUnresolved) onRegenerate();
          }}
        >
          <SvgIcon name="renew" className="w-5 h-5" />
        </button>
        <button
          type="button"
          className={`${ACTION_BUTTON_BASE} cursor-pointer`}
          aria-label="削除"
          hidden={isReadOnly}
          onClick={onDelete}
        >
          <SvgIcon name="delete" className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
