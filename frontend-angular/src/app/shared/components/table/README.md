# Table Component

`TableComponent` is a reusable data table component that supports sorting, selection, dynamic columns, and custom templates.

## Import

```typescript
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn } from 'src/app/shared/components/table/table.interface';

@Component({
  standalone: true,
  imports: [TableComponent],
  ...
})
```

## Basic Usage

### 1. Define Columns and Data (TypeScript)
```typescript
columns: TableColumn[] = [
  { field: 'id', header: 'ID', width: '50px' },
  { field: 'name', header: 'Name', sortable: true },
  { field: 'email', header: 'Email' },
];

data = [
  { id: 1, name: 'User A', email: 'a@example.com' },
  { id: 2, name: 'User B', email: 'b@example.com' },
];
```

### 2. Use in Template (HTML)
```html
<app-table
  [data]="data"
  [columns]="columns"
  [sortable]="true"
  [selectable]="true"
  (sortChange)="onSort($event)"
  (selectionChange)="onSelectionChange($event)"
></app-table>
```

---

## API Reference

### Inputs

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `data` | `any[]` | `[]` | Array of data to display. |
| `columns` | `TableColumn[]` | `[]` | Column configuration definitions. |
| `selectable` | `boolean` | `false` | Whether to show row selection checkboxes. |
| `sortable` | `boolean` | `false` | Global flag to enable sorting (requires `sortable` in column config too). |
| `isLoading` | `boolean` | `false` | Whether to show the loading state. |
| `rowClickable` | `boolean` | `false` | Whether to enable row click events. |
| `showRowArrow` | `boolean` | `false` | Whether to show a navigation arrow (`chevron_right`) at the end of each row. |

### Outputs

| Event | Type | Description |
| --- | --- | --- |
| `sortChange` | `EventEmitter<SortEvent>` | Emitted when a sort header is clicked. |
| `selectionChange` | `EventEmitter<any[]>` | Emitted when the selection changes (returns array of selected rows). |
| `rowClick` | `EventEmitter<any>` | Emitted when a row is clicked (if `rowClickable` is true). |

---

## Column Configuration (`TableColumn` Interface)

Each item in the `columns` array allows the following configuration:

| Property | Type | Description |
| --- | --- | --- |
| `field` | `string` | Property key of the data object. |
| `header` | `string` | Text to display in the header. |
| `width` | `string` | Width of the column (e.g., `'25%'`, `'100px'`). |
| `align` | `'left' \| 'center' \| 'right'` | Text alignment (default: `'left'`). |
| `sortable` | `boolean` | Enable sorting for this specific column. |
| `sticky` | `'left' \| 'right'` | Pin the column to the left or right. |
| `hasRightBorder` | `boolean` | Helper to show a vertical divider border on the right. |
| `template` | `TemplateRef` | Custom template for cell content. |
| `headerClass` | `string` | Custom CSS class for the header cell (`th`). |
| `cellClass` | `string` | Custom CSS class for the body cell (`td`). |
| `headerFontSize` | `string` | Custom font size for the header (e.g., `'14px'`). |
| `cellFontSize` | `string` | Custom font size for the cell (e.g., `'14px'`). |

---

## Advanced Usage

### Custom Templates (Status Badges, Action Buttons)

**Component TS:**
```typescript
@ViewChild('statusTemplate', { static: true }) statusTemplate!: TemplateRef<any>;

ngOnInit() {
  this.columns = [
    { field: 'name', header: 'Name' },
    { field: 'status', header: 'Status', template: this.statusTemplate } // Assign template
  ];
}
```

**Component HTML:**
```html
<app-table [data]="data" [columns]="columns"></app-table>

<!-- Template Definition -->
<ng-template #statusTemplate let-row>
  <span [class.text-red-500]="row.status === 'ERROR'">
    {{ row.status }}
  </span>
</ng-template>
```

### Style Customization

**Changing Font Size:**
```typescript
{ field: 'title', header: 'Title', headerFontSize: '16px', cellFontSize: '18px' }
```

**Applying Classes to Specific Columns:**
```typescript
// Make text bold
{ field: 'total', header: 'Total', cellClass: 'font-bold' }
```
