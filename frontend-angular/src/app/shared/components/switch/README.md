# Switch Component

Reusable toggle switch component với Tailwind CSS.

## Usage

```html
<!-- Basic usage -->
<app-switch [(checked)]="isEnabled" />

<!-- With label -->
<app-switch [(checked)]="isEnabled" label="Enable feature" />

<!-- Different sizes -->
<app-switch [(checked)]="isEnabled" size="sm" />
<app-switch [(checked)]="isEnabled" size="md" />
<app-switch [(checked)]="isEnabled" size="lg" />

<!-- Without icon -->
<app-switch [(checked)]="isEnabled" [showIcon]="false" />

<!-- Disabled state -->
<app-switch [(checked)]="isEnabled" [disabled]="true" />

<!-- Event handling -->
<app-switch [checked]="isEnabled" (checkedChange)="onToggle($event)" />
```

## Inputs

| Input      | Type                   | Default | Description                 |
| ---------- | ---------------------- | ------- | --------------------------- |
| `checked`  | `boolean`              | `false` | Current state of the switch |
| `label`    | `string`               | `''`    | Label text (optional)       |
| `size`     | `'sm' \| 'md' \| 'lg'` | `'md'`  | Size of the switch          |
| `showIcon` | `boolean`              | `true`  | Show icon inside thumb      |
| `disabled` | `boolean`              | `false` | Disabled state              |

## Outputs

| Output          | Type      | Description                       |
| --------------- | --------- | --------------------------------- |
| `checkedChange` | `boolean` | Emitted when switch state changes |

## Sizes

- **sm**: 40x20px track, 16x16px thumb
- **md**: 56x28px track, 24x24px thumb (default)
- **lg**: 64x32px track, 28x28px thumb

## Styling

Component uses primary color `#29738f` for active state. Customize via CSS variables if needed.
