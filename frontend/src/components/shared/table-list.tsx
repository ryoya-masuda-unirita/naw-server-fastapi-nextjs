import type { ReactNode } from 'react';
import { Checkbox } from './checkbox';
import { cx } from './class-names';

interface TableListProps {
  children?: ReactNode;
  className?: string;
}

/**
 * 移植元 `<app-table-list>`。一覧表の外枠で、行は `<TableListItem>` を並べる。
 * 見た目は index.css の `.table-list*`。
 */
export function TableList({ children, className }: TableListProps) {
  return <div className={cx('table-list', className)}>{children}</div>;
}

interface TableListItemProps {
  /** 行の中身（`.table-list-row-content` に入る） */
  children?: ReactNode;
  /** 右端の操作（移植元の `slot="right"`。`.table-list-actions` に入る） */
  actions?: ReactNode;
  isHeader?: boolean;
  showCheckbox?: boolean;
  checked?: boolean;
  indeterminate?: boolean;
  /** false にすると `.table-list-actions` を出さない */
  hasActions?: boolean;
  dataTestid?: string;
  className?: string;
  onCheckedChange?: (checked: boolean) => void;
}

/** 移植元 `<app-table-list-item>`。チェックボックス付きのデータ行は行クリックでも選択を切り替える */
export function TableListItem({
  children,
  actions,
  isHeader = false,
  showCheckbox = false,
  checked = false,
  indeterminate = false,
  hasActions = true,
  dataTestid,
  className,
  onCheckedChange,
}: TableListItemProps) {
  const handleRowClick = () => {
    if (!isHeader && showCheckbox) {
      onCheckedChange?.(!checked);
    }
  };

  return (
    <div
      className={cx('table-list-row', isHeader ? 'table-list-row--header' : 'table-list-row--data', className)}
      data-testid={dataTestid}
      onClick={handleRowClick}
    >
      {showCheckbox && (
        <div className="table-list-checkbox" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={checked}
            indeterminate={indeterminate}
            isHeader={isHeader}
            onCheckedChange={(value) => onCheckedChange?.(value)}
          />
        </div>
      )}
      <div className="table-list-row-content">{children}</div>
      {hasActions && <div className="table-list-actions">{actions}</div>}
    </div>
  );
}
