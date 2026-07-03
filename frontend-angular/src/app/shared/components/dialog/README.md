# Dialog Component

A reusable dialog component for confirmation dialogs, alerts, and user interactions.

## Overview

The Dialog component provides a standardized way to display modal dialogs throughout the application. It uses Angular Material's dialog system as the foundation and includes customizable buttons using the shared Button component.

## Usage

### Basic Usage

```typescript
import { inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { DialogComponent, DialogData } from '@shared/components/dialog/dialog.component';

export class ExampleComponent {
  private readonly dialog = inject(MatDialog);

  openDialog(): void {
    const dialogRef = this.dialog.open(DialogComponent, {
      width: '400px',
      data: {
        title: 'Confirm Action',
        message: 'Are you sure you want to perform this action?',
        confirmText: 'Yes',
        cancelText: 'No',
        showCancel: true
      } as DialogData
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log('User confirmed');
      } else {
        console.log('User cancelled');
      }
    });
  }
}
```

### Alert Dialog (No Cancel Button)

```typescript
openAlert(): void {
  this.dialog.open(DialogComponent, {
    width: '350px',
    data: {
      title: 'Information',
      message: 'This operation completed successfully.',
      confirmText: 'OK',
      showCancel: false
    } as DialogData
  });
}
```

### Delete Confirmation

```typescript
openDeleteConfirmation(): void {
  const dialogRef = this.dialog.open(DialogComponent, {
    width: '400px',
    data: {
      title: 'Delete Item',
      message: 'This action cannot be undone. Are you sure?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      showCancel: true
    } as DialogData
  });

  dialogRef.afterClosed().subscribe(result => {
    if (result) {
      // Perform delete operation
    }
  });
}
```

## API

### DialogData Interface

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `title` | `string` | ✅ | - | Dialog title displayed in the header |
| `message` | `string` | ✅ | - | Main content message |
| `confirmText` | `string` | ❌ | `'削除'` | Text for the confirm button |
| `cancelText` | `string` | ❌ | `'キャンセル'` | Text for the cancel button |
| `showCancel` | `boolean` | ❌ | `true` | Whether to show the cancel button |

### Return Values

The dialog returns a `boolean` value:
- `true` - User clicked the confirm button
- `false` - User clicked the cancel button or closed the dialog
- `undefined` - Dialog was closed programmatically

## Component Structure

```
dialog/
├── README.md                    # This file
├── dialog.component.ts          # Component logic
├── dialog.component.html        # Template
└── dialog.component.scss        # Styles
```

## Dependencies

- `@angular/material/dialog` - Dialog foundation
- `@shared/components/button` - Custom button component
- Angular 21 standalone component architecture

## Button Variants

- **Cancel Button**: Uses `variant="outline"` for a secondary appearance
- **Confirm Button**: Uses `variant="solid"` for a primary appearance

## Styling

The component includes custom styles for:
- Dialog header and title formatting
- Content message styling with horizontal padding
- Centered button layout
- Responsive button spacing

## Examples

### Success Dialog
```typescript
{
  title: 'Success',
  message: 'Your changes have been saved successfully.',
  confirmText: 'Continue',
  showCancel: false
}
```

### Warning Dialog
```typescript
{
  title: 'Warning',
  message: 'You have unsaved changes. Do you want to continue?',
  confirmText: 'Yes, Continue',
  cancelText: 'Go Back',
  showCancel: true
}
```

### Error Dialog
```typescript
{
  title: 'Error',
  message: 'An unexpected error occurred. Please try again.',
  confirmText: 'Retry',
  cancelText: 'Cancel',
  showCancel: true
}
```

## TODO

- [ ] **Update border-radius to 32px** for modern rounded design
- [ ] Add internationalization support for default button texts
- [ ] Consider adding icon support for different dialog types (success, warning, error)
- [ ] Add animation transitions for better UX
- [ ] Support for custom button colors based on dialog type

## Best Practices

1. **Keep messages concise** - Users should quickly understand the action
2. **Use clear button labels** - Avoid generic "OK/Cancel", be specific about the action
3. **Consider the context** - Use appropriate confirmation dialogs for destructive actions
4. **Test accessibility** - Ensure proper focus management and screen reader support

## Migration Notes

If migrating from Material buttons to this component:
- Replace `mat-button` with `<app-button variant="outline">`
- Replace `mat-raised-button` with `<app-button variant="solid">`
- Update event handlers from `(click)` to `(buttonClick)`
