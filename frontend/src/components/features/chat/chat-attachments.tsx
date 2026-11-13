import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FileChip } from '@/components/shared/file-chip';
import { FileImageChip } from '@/components/shared/file-image-chip';
import type { ChatInputControls } from '@/hooks/use-chat-input-controls';
import { CHAT_ATTACHMENT_ACCEPT } from '@/lib/constants/chat-attachment';
import { CHAT_FILE_INPUT_ID, addAttachedFiles } from '@/lib/utils/chat-attachment';

const CLIP_ICON_PATH =
  'M13.3307 4.9987V14.582C13.3307 16.4237 11.8391 17.9154 9.9974 17.9154C8.15573 17.9154 6.66406 16.4237 6.66406 14.582V4.16536C6.66406 3.01536 7.5974 2.08203 8.7474 2.08203C9.8974 2.08203 10.8307 3.01536 10.8307 4.16536V12.9154C10.8307 13.3737 10.4557 13.7487 9.9974 13.7487C9.53906 13.7487 9.16406 13.3737 9.16406 12.9154V4.9987H7.91406V12.9154C7.91406 14.0654 8.8474 14.9987 9.9974 14.9987C11.1474 14.9987 12.0807 14.0654 12.0807 12.9154V4.16536C12.0807 2.3237 10.5891 0.832031 8.7474 0.832031C6.90573 0.832031 5.41406 2.3237 5.41406 4.16536V14.582C5.41406 17.1154 7.46406 19.1654 9.9974 19.1654C12.5307 19.1654 14.5807 17.1154 14.5807 14.582V4.9987H13.3307Z';

function ClipIcon({ className }: { className?: string }) {
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
      <path d={CLIP_ICON_PATH} fill="currentColor" />
    </svg>
  );
}

/** ドラッグ時に出す添付の領域（移植元 chat-input のドロップ領域の中身）。ファイル選択の input もここに置く */
export function ChatAttachmentDropzone({ controls }: { controls: ChatInputControls }) {
  const { t } = useTranslation();

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    if (input.files && input.files.length > 0) {
      addAttachedFiles(Array.from(input.files), controls);
      // 同じファイルを続けて選んでも change が発火するよう空にする
      input.value = '';
    }
  };

  return (
    <div className="rounded-2xl border border-dashed border-brand-primary bg-bg-brand-weak w-full p-4 transition-colors duration-200">
      <input
        data-testid="chat-attach-file-input"
        type="file"
        id={CHAT_FILE_INPUT_ID}
        name="files"
        accept={CHAT_ATTACHMENT_ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={handleFileSelect}
      />
      <label htmlFor={CHAT_FILE_INPUT_ID} className="cursor-pointer flex flex-col items-center gap-1">
        <span
          className="flex h-8 w-8 text-brand-primary rounded-full justify-center items-center"
          aria-hidden="true"
        >
          <ClipIcon className="w-4 h-4" />
        </span>
        <span className="text-center text-(length:--text-label) font-medium text-brand-secondary">
          {t('CHAT.INPUT.DROP_FILES')}
        </span>
      </label>
    </div>
  );
}

/** 添付ファイルのチップ列。画像はサムネイル、それ以外はファイル名と種別 */
export function ChatAttachmentChips({ controls }: { controls: ChatInputControls }) {
  const { attachedFiles, setAttachedFiles } = controls;
  if (attachedFiles.length === 0) return null;

  const removeFile = (index: number) => {
    setAttachedFiles((files) => files.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-wrap gap-3 mb-3">
      {attachedFiles.map((file, index) =>
        file.type.startsWith('image/') ? (
          <FileImageChip
            // 同じ名前のファイルを複数添付できるため、位置を含めて鍵にする（移植元も track $index）
            key={`${index}-${file.name}`}
            file={file}
            showRemoveBtn
            onRemove={() => removeFile(index)}
          />
        ) : (
          <FileChip
            key={`${index}-${file.name}`}
            file={file}
            showRemoveBtn
            onRemove={() => removeFile(index)}
          />
        ),
      )}
    </div>
  );
}

/**
 * ＋メニューの「画像またはファイルを添付」の項目。ファイル選択を開き、`onSelected`（メニューを閉じる処理）を呼ぶ。
 * ＋メニュー本体（#286）が、メニューの先頭にこの項目を置く。
 */
export function ChatAttachMenuItem({ onSelected }: { onSelected?: () => void }) {
  const { t } = useTranslation();

  const handleClick = () => {
    document.getElementById(CHAT_FILE_INPUT_ID)?.click();
    onSelected?.();
  };

  return (
    <button
      type="button"
      data-testid="chat-attach-menu-item"
      className="dropdown-item flex min-h-9 items-center gap-2 cursor-pointer rounded-lg w-full px-2 py-1 text-(length:--text-label) font-medium text-text-strong transition-colors duration-150"
      role="menuitem"
      onClick={handleClick}
    >
      <span className="flex h-5 w-5 shrink-0 justify-center items-center">
        <ClipIcon />
      </span>
      {t('CHAT.INPUT.ATTACH_IMAGE_FILE')}
    </button>
  );
}
