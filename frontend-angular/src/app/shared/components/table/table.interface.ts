import { TemplateRef } from '@angular/core';

export interface TableColumn {
  field: string;
  header: string;
  /** Tailwind width class(es) (e.g. 'w-40 md:w-50'). Omit for flex-fill. */
  width?: string;
  sortable?: boolean;
  template?: TemplateRef<any>;
  align?: 'left' | 'center' | 'right';
  /** Show a right border divider on this column */
  hasBorder?: boolean;
}

export interface SortEvent {
  field: string;
  direction: 'asc' | 'desc' | '';
}
