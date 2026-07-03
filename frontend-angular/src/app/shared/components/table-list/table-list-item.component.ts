import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CheckboxComponent } from '@shared/components/checkbox/checkbox.component';

/**
 * Row of `<app-table-list>`. Mirrors the Astro `<TableListItem>` component
 * (`lime0422/src/components/TableListItem.astro`).
 *
 * - Default slot is wrapped in `.table-list-row-content`.
 * - Right-side slot: project a child with `slot="right"` (lands in `.table-list-actions`).
 * - `[showCheckbox]` prepends a `.table-list-checkbox` containing `<app-checkbox>`.
 *   Use `[checked]` + `(checkedChange)` to drive selection state from the parent.
 *   The header row supports indeterminate via `[indeterminate]`.
 */
@Component({
  selector: 'app-table-list-item',
  standalone: true,
  imports: [CheckboxComponent],
  template: `
    @if (showCheckbox()) {
      <div class="table-list-checkbox" (click)="$event.stopPropagation()">
        <app-checkbox
          [checked]="checked()"
          [indeterminate]="indeterminate()"
          (checkedChange)="checkedChange.emit($event)"
          [isHeader]="isHeader()"
        />
      </div>
    }
    <div class="table-list-row-content">
      <ng-content />
    </div>
    @if (hasActions()) {
      <div class="table-list-actions">
        <ng-content select="[slot=right]" />
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'rowClass()',
    '(click)': 'onRowClick()',
  },
})
export class TableListItemComponent {
  readonly isHeader = input<boolean>(false);
  readonly showCheckbox = input<boolean>(false);
  readonly checked = input<boolean>(false);
  readonly indeterminate = input<boolean>(false);
  readonly hasActions = input<boolean>(true);

  readonly checkedChange = output<boolean>();

  readonly rowClass = computed(
    () => `table-list-row ${this.isHeader() ? 'table-list-row--header' : 'table-list-row--data'}`,
  );

  onRowClick(): void {
    if (!this.isHeader() && this.showCheckbox()) {
      this.checkedChange.emit(!this.checked());
    }
  }
}
