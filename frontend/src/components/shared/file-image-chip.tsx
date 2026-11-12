import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from './class-names';
import { MatIcon } from './mat-icon';

interface FileImageChipProps {
  file: File;
  showRemoveBtn?: boolean;
  onRemove?: () => void;
  className?: string;
}

/**
 * 移植元 core/utils/file.helpers.ts の getFilePreviewUrl のうち File の分岐。
 * 画像ならオブジェクト URL、それ以外は空文字。
 */
function createPreviewUrl(file: File): string {
  return file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
}

/** 移植元 `<app-file-image-chip>`（shared/components/file-image）。添付画像のサムネイル */
export function FileImageChip({ file, showRemoveBtn = true, onRemove, className }: FileImageChipProps) {
  const { t } = useTranslation();
  const [previewUrl, setPreviewUrl] = useState('');

  // 移植元は描画のたびに URL.createObjectURL を呼んで解放しない。
  // React では file ごとに 1 回だけ作り、差し替え・破棄時に revoke してメモリを残さない。
  useEffect(() => {
    const url = createPreviewUrl(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- オブジェクト URL は副作用（作成と解放）を伴うので effect で作る
    setPreviewUrl(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  return (
    <div className={cx('app-file-image-chip w-16 h-16', className)}>
      <div className="inline-flex rounded-lg border border-border-strong bg-white h-16 w-16 shrink-0 relative overflow-hidden">
        <img
          src={previewUrl || undefined}
          alt={file.name}
          className="absolute inset-0 rounded-lg object-cover w-full h-full"
        />
        {showRemoveBtn && (
          <button
            type="button"
            className="flex h-4 w-4 cursor-pointer bg-text-strong text-white transition-opacity rounded-full shrink-0 justify-center items-center hover:opacity-80 absolute top-0.75 right-0.75"
            aria-label={t('CHAT.INPUT.REMOVE_FILE')}
            onClick={() => onRemove?.()}
          >
            <MatIcon icon="close" className="icon-12 text-white!" />
          </button>
        )}
      </div>
    </div>
  );
}
