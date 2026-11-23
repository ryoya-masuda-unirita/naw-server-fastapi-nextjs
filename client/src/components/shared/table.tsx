import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from './checkbox';
import { cx } from './class-names';
import { AppMatIcon } from './icons/app-mat-icon';
import type { SortEvent, TableColumn } from './types';

interface TableProps<T extends object> {
  data?: T[];
  columns?: TableColumn<T>[];
  selectable?: boolean;
  sortable?: boolean;
  isLoading?: boolean;
  /** i18n キー */
  emptyMessage?: string;
  /** 行末の操作列（移植元 actionsTemplate） */
  renderActions?: (row: T) => ReactNode;
  /** モバイル表示の行の中身（移植元 mobileRowTemplate）。省略すると列を順に並べる */
  renderMobileRow?: (row: T) => ReactNode;
  actionsWidth?: string;
  selectionWidth?: string;
  selectedClass?: string;
  hoverClass?: string;
  /** デスクトップ表示の各行に付ける data-testid */
  rowTestid?: string;
  onSortChange?: (sort: SortEvent) => void;
  onSelectionChange?: (selected: T[]) => void;
  onRowClick?: (row: T) => void;
}

/**
 * 行の並びが同じか（要素の同一性で比べる）。
 * `data={query.data ?? []}` のように親が毎回新しい配列を渡しても、中身が同じなら選択を保ち、
 * 選択クリアの通知 → 親の再レンダー → 新しい配列 … の無限ループにならないようにする。
 * 移植元は signal の値の参照で判定しているが、React では配列が毎回作り直されやすいため中身で比べる。
 */
function sameRows<T>(a: T[] | null, b: T[]): boolean {
  return a !== null && a.length === b.length && a.every((row, i) => row === b[i]);
}

const EMPTY_ROWS: never[] = [];

function getRowKey(row: object, index: number): string | number {
  const id = (row as { id?: unknown }).id;
  return typeof id === 'string' || typeof id === 'number' ? id : index;
}

/** 'user.name' のようなドット区切りの field で値を取り出す（移植元 getCellValue） */
function getCellValue(row: object, field: string): ReactNode {
  if (!field) return '';
  let value: unknown = row;
  for (const f of field.split('.')) {
    value = value ? (value as Record<string, unknown>)[f] : null;
  }
  return value as ReactNode;
}

function nextSort(current: SortEvent, field: string): SortEvent {
  if (current.field !== field) return { field, direction: 'asc' };
  if (current.direction === 'asc') return { field, direction: 'desc' };
  if (current.direction === 'desc') return { field: '', direction: '' };
  return { field, direction: 'asc' };
}

const ALIGN_CLASS: Record<NonNullable<TableColumn['align']>, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

/** 移植元 `<app-table>`（shared/components/table） */
export function Table<T extends object>({
  data = EMPTY_ROWS,
  columns = [],
  selectable = false,
  sortable = false,
  isLoading = false,
  emptyMessage = 'COMMON.NO_DATA',
  renderActions,
  renderMobileRow,
  actionsWidth = 'w-25',
  selectionWidth = 'w-6',
  selectedClass = 'bg-secondary',
  hoverClass = 'hover:bg-bg-brand-weak',
  rowTestid,
  onSortChange,
  onSelectionChange,
  onRowClick,
}: TableProps<T>) {
  const { t } = useTranslation();
  // 選択はデータに紐づけて持ち、データが入れ替わったら空として扱う（移植元はデータ変更時に選択をクリアする）
  const [selection, setSelection] = useState<{ data: T[]; selected: T[] }>({ data, selected: [] });
  const selected = sameRows(selection.data, data) ? selection.selected : EMPTY_ROWS;
  const [currentSort, setCurrentSort] = useState<SortEvent>({ field: '', direction: '' });

  const onSelectionChangeRef = useRef(onSelectionChange);
  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  });
  // 移植元はデータが変わるたびに空の選択を通知する（初回表示も含む）
  const notifiedDataRef = useRef<T[] | null>(null);
  useEffect(() => {
    if (sameRows(notifiedDataRef.current, data)) return;
    notifiedDataRef.current = data;
    onSelectionChangeRef.current?.([]);
  }, [data]);

  const updateSelection = (next: T[]) => {
    setSelection({ data, selected: next });
    onSelectionChange?.(next);
  };

  const isSelected = (row: T) => selected.includes(row);
  const isAllSelected = selected.length === data.length;
  const hasValue = selected.length > 0;

  const masterToggle = () => {
    updateSelection(isAllSelected ? [] : [...data]);
  };

  const toggleSelection = (row: T) => {
    updateSelection(isSelected(row) ? selected.filter((r) => r !== row) : [...selected, row]);
  };

  const handleSort = (column: TableColumn<T>) => {
    if (!sortable || !column.sortable) return;
    const sort = nextSort(currentSort, column.field);
    setCurrentSort(sort);
    onSortChange?.(sort);
  };

  const rowStateClass = (row: T) => cx(selectable && hoverClass, isSelected(row) && selectedClass);

  const headerCheckbox = (
    <Checkbox
      checked={isAllSelected}
      indeterminate={hasValue && !isAllSelected}
      isHeader
      onCheckedChange={masterToggle}
    />
  );

  const rowCheckbox = (row: T) => (
    // 移植元はチェックボックスのクリックを行クリック（rowClick）に伝えない。contents で余計な箱を作らない
    <span className="contents" onClick={(e) => e.stopPropagation()}>
      <Checkbox checked={isSelected(row)} onCheckedChange={() => toggleSelection(row)} />
    </span>
  );

  return (
    <div className="app-table block">
      {/* ===== Mobile View ===== */}
      <div className="flex flex-col md:hidden" data-testid="table-mobile">
        {selectable && (
          <div className="flex items-center gap-2 py-1.5">
            <div className="flex items-center justify-center shrink-0">{headerCheckbox}</div>
          </div>
        )}
        {data.map((row, index) => (
          <div
            key={getRowKey(row, index)}
            className={cx('table-list-row table-list-row--data', rowStateClass(row))}
            tabIndex={0}
            role="button"
            onClick={() => onRowClick?.(row)}
            onKeyUp={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onRowClick?.(row);
            }}
          >
            {selectable && <div className="flex items-center pt-px pl-px">{rowCheckbox(row)}</div>}
            <div className="table-list-row-content">
              {renderMobileRow
                ? renderMobileRow(row)
                : columns.map((col) =>
                    col.render ? (
                      <span key={col.field} className="contents">
                        {col.render(row)}
                      </span>
                    ) : (
                      <div key={col.field} className="table-list-date flex-1 w-30 md:w-auto font-medium!">
                        {getCellValue(row, col.field)}
                      </div>
                    ),
                  )}
            </div>
            {renderActions && <div className="table-list-actions">{renderActions(row)}</div>}
          </div>
        ))}
        {data.length === 0 && !isLoading && (
          <div className="px-4 py-8 text-center text-text-muted">{t(emptyMessage)}</div>
        )}
      </div>

      {/* ===== Desktop View ===== */}
      <div className="hidden md:flex md:flex-col" data-testid="table-desktop">
        <div className="flex items-center gap-6 px-2">
          {selectable && (
            <div className={cx('shrink-0 flex items-center justify-center', selectionWidth)}>{headerCheckbox}</div>
          )}
          {columns.map((col) => {
            const canSort = sortable && !!col.sortable;
            const isSorted = currentSort.field === col.field;
            return (
              <div
                key={col.field}
                className={cx(
                  'py-1.5 text-xs font-medium text-text-muted',
                  !col.width && 'flex-1',
                  !!col.width && 'shrink-0',
                  canSort && 'cursor-pointer',
                  ALIGN_CLASS[col.align ?? 'left'],
                  col.width,
                )}
                role="columnheader"
                onClick={() => handleSort(col)}
              >
                <div className="flex items-center gap-1">
                  <span>{t(col.header)}</span>
                  {canSort && (
                    <AppMatIcon
                      icon={isSorted && currentSort.direction === 'desc' ? 'arrow_downward' : 'arrow_upward'}
                      className={cx(
                        'text-base! leading-none transition-colors',
                        isSorted ? 'text-primary' : 'text-text-lighter',
                      )}
                    />
                  )}
                </div>
              </div>
            );
          })}
          {renderActions && <div className={cx('shrink-0', actionsWidth)} />}
        </div>

        {data.map((row, index) => (
          <div
            key={getRowKey(row, index)}
            data-testid={rowTestid}
            className={cx(
              'flex items-center gap-6 px-2 py-3 border-b border-border-light transition-colors',
              rowStateClass(row),
            )}
            role="row"
            onClick={() => onRowClick?.(row)}
          >
            {selectable && (
              <div className={cx('shrink-0 flex items-center justify-center', selectionWidth)}>
                {rowCheckbox(row)}
              </div>
            )}
            {columns.map((col) => (
              <div
                key={col.field}
                className={cx(
                  'min-w-0',
                  !col.width && 'flex-1',
                  !!col.width && 'shrink-0',
                  col.hasBorder && 'border-border-light self-stretch',
                  ALIGN_CLASS[col.align ?? 'left'],
                  col.width,
                )}
              >
                <div className="flex items-center h-full">
                  {col.render ? (
                    col.render(row)
                  ) : (
                    <span className="text-xs font-medium text-text-muted truncate block">
                      {getCellValue(row, col.field)}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {renderActions && (
              <div className={cx('shrink-0 flex items-center gap-2', actionsWidth)}>{renderActions(row)}</div>
            )}
          </div>
        ))}

        {data.length === 0 && !isLoading && (
          <div className="px-8 py-16 text-center text-text-muted">{t(emptyMessage)}</div>
        )}
      </div>

      {isLoading && <div className="p-4 text-center text-text-muted">Loading...</div>}
    </div>
  );
}
