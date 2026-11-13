import type { ReactNode } from 'react';

/** 移植元 `src/types/common.ts` の SelectOption。select 系の部品が共通で使う選択肢 */
export interface SelectOption<T = string> {
  label: string;
  value: T;
  disabled?: boolean;
  description?: string;
  category?: string;
}

/** 移植元 `src/types/tab.type.ts` の TabItem */
export interface TabItem {
  id: string;
  /** i18n キー（表示時に翻訳する） */
  label: string;
  /** material-symbols のアイコン名 */
  icon?: string;
  disabled?: boolean;
  /** 指定すると `<Link>` で描画する（`#` 始まりは除く） */
  route?: string;
}

/**
 * 移植元 `table/table.interface.ts` の TableColumn。
 * 移植元の `template?: TemplateRef` は React では `render` 関数で表す。
 */
export interface TableColumn<T = unknown> {
  field: string;
  /** i18n キー */
  header: string;
  /** Tailwind の幅クラス（例: 'w-40 md:w-50'）。省略すると flex-1 */
  width?: string;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'center' | 'right';
  /** 列の右側に区切り線を出す */
  hasBorder?: boolean;
}

export interface SortEvent {
  field: string;
  direction: 'asc' | 'desc' | '';
}
