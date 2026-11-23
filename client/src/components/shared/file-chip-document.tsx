import { cx } from './class-names';

interface FileChipDocumentProps {
  /** ファイル名（拡張子から種別ラベルを作る） */
  name: string;
  className?: string;
}

/** 移植元 `<app-file-chip-document>`（shared/components/file-chip-document）。見た目は index.css の `.file-chip*` */
export function FileChipDocument({ name, className }: FileChipDocumentProps) {
  const ext = name.split('.').pop()?.toUpperCase() ?? 'FILE';
  return (
    <div className={cx('app-file-chip-document file-chip file-chip--document', className)}>
      <div className="file-chip__inner">
        <div className="file-chip__icon">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-3 h-3 text-text-white"
            aria-hidden="true"
            preserveAspectRatio="xMidYMid meet"
          >
            <path
              d="M15.8333 4.16667V11.6667H11.6667V15.8333H4.16667V4.16667H15.8333ZM15.8333 2.5H4.16667C3.25 2.5 2.5 3.25 2.5 4.16667V15.8333C2.5 16.75 3.25 17.5 4.16667 17.5H12.5L17.5 12.5V4.16667C17.5 3.25 16.75 2.5 15.8333 2.5ZM10 11.6667H5.83333V10H10V11.6667ZM14.1667 8.33333H5.83333V6.66667H14.1667V8.33333Z"
              fill="currentColor"
            />
          </svg>
        </div>
        <div className="file-chip__text">
          <span className="file-chip__name">{name}</span>
          <span className="file-chip__ext">{ext}</span>
        </div>
      </div>
    </div>
  );
}
