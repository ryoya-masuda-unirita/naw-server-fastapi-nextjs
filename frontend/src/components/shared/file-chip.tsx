import { useTranslation } from 'react-i18next';
import { cx } from './class-names';
import { AppMatIcon, MatIcon } from './mat-icon';

/** 移植元 FileChipComponent.getFileTypeLabel。MIME タイプ（なければ拡張子）から種別ラベルを作る */
function getFileTypeLabel(file: File): string {
  if (file.type.includes('pdf')) return 'PDF';
  if (file.type.includes('word') || file.type.includes('document')) return 'DOC';
  if (file.type.includes('sheet') || file.type.includes('excel')) return 'XLS';
  if (file.type.startsWith('image/')) {
    const format = file.type.split('/')[1]?.toUpperCase();
    return format || 'IMG';
  }
  return file.name.split('.').pop()?.toUpperCase() || 'FILE';
}

interface FileChipProps {
  file: File;
  showRemoveBtn?: boolean;
  onRemove?: () => void;
  className?: string;
}

/** 移植元 `<app-file-chip>`（shared/components/file/file-chip）。チャット入力の添付ファイル表示 */
export function FileChip({ file, showRemoveBtn = true, onRemove, className }: FileChipProps) {
  const { t } = useTranslation();
  return (
    <span className={cx('app-file-chip', className)}>
      <div
        data-testid="chat-attached-file-item"
        className="inline-flex rounded-lg border border-border-strong bg-white items-start gap-4 max-w-60 p-1"
      >
        <div className="flex items-center gap-3 py-2 pr-4 pl-2">
          <div className="flex h-10 w-10 rounded-lg bg-brand-primary shrink-0 justify-center items-center">
            <AppMatIcon icon="attach_file" className="text-xs! text-white! leading-none" />
          </div>
          <div className="flex flex-col items-start min-w-0">
            <span className="text-(length:--text-note) font-medium text-text-strong truncate max-w-30 overflow-hidden">
              {file.name}
            </span>
            <span className="text-[10px] leading-[1.4] font-medium text-text-weak">{getFileTypeLabel(file)}</span>
          </div>
        </div>
        {showRemoveBtn && (
          <button
            type="button"
            className="flex h-4 w-4 cursor-pointer bg-text-strong text-white transition-opacity rounded-full shrink-0 justify-center items-center hover:opacity-80"
            aria-label={t('CHAT.INPUT.REMOVE_FILE')}
            onClick={() => onRemove?.()}
          >
            <MatIcon icon="close" className="icon-12 text-white!" />
          </button>
        )}
      </div>
    </span>
  );
}
