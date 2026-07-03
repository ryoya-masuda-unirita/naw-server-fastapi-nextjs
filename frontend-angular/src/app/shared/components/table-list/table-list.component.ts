import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Common list-style table wrapper. Mirrors the Astro `<TableList>` component
 * (`lime0422/src/components/TableList.astro`). Use together with
 * `<app-table-list-item>`. Styles live in `src/styles.css` under the
 * `table-list*` block (ported from `lime0422/src/styles/global.css`).
 */
@Component({
  selector: 'app-table-list',
  standalone: true,
  template: `<ng-content />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'table-list' },
})
export class TableListComponent {}
