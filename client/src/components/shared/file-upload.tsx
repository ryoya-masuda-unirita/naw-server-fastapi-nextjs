import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import './file-upload.css';
import { Button } from './button';
import { cx } from './class-names';
import { SvgIcon } from './icons/svg-icon';

// webkitdirectory は React の型定義に無いので、属性としてそのまま渡す
const FOLDER_INPUT_ATTRS = { webkitdirectory: '' };

interface FileUploadProps {
  /** ファイル選択 input の id（フォルダ選択は `${id}-folder`） */
  id?: string;
  /** 'full' のときファイル選択・フォルダ選択のボタンを出す */
  variant?: 'simple' | 'full';
  onFilesSelected?: (files: File[]) => void;
  className?: string;
}

/** 移植元 `<app-file-upload>`（shared/components/file/file-upload）。ドロップかボタンでファイルを受け取る */
export function FileUpload({ id = 'file-upload', variant = 'simple', onFilesSelected, className }: FileUploadProps) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

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
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      onFilesSelected?.(Array.from(event.dataTransfer.files));
    }
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    if (input.files && input.files.length > 0) {
      onFilesSelected?.(Array.from(input.files));
      // 同じファイルを続けて選んでも change が発火するよう空にする
      input.value = '';
    }
  };

  return (
    <div className={cx('app-file-upload', className)}>
      <div
        className={cx('file-upload', variant === 'full' && 'file-upload--full')}
        data-drag-over={isDragging}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div>
          <input
            ref={fileInputRef}
            type="file"
            id={id}
            className="sr-only"
            multiple
            onChange={handleFileSelect}
          />
          <input
            ref={folderInputRef}
            type="file"
            id={`${id}-folder`}
            className="sr-only"
            {...FOLDER_INPUT_ATTRS}
            onChange={handleFileSelect}
          />
          <div className="file-upload__content">
            <p className="file-upload__title text-sm text-text-strong">
              {t(variant === 'full' ? 'FILE_UPLOAD.DROP_FILE_OR_FOLDER' : 'CHAT.INPUT.DROP_FILES')}
            </p>
            {variant === 'full' && (
              <div className="file-upload__buttons">
                <Button
                  variant="outline"
                  size="md"
                  classProps="!text-sm !px-3"
                  heightPx={36}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <SvgIcon name="file" className="icon-20" />
                  <span>{t('COMMON.SELECT_FILE')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="md"
                  classProps="!text-sm !px-3"
                  heightPx={36}
                  onClick={() => folderInputRef.current?.click()}
                >
                  <SvgIcon name="folder" className="icon-20" />
                  <span>{t('COMMON.SELECT_FOLDER')}</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
