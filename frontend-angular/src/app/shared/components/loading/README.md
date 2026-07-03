# Loading Component

Shared loading component có thể tái sử dụng cho toàn bộ ứng dụng.

## Sử dụng

### Import

```typescript
import { LoadingComponent } from '@shared/components/loading/loading.component';

@Component({
  // ...
  imports: [LoadingComponent],
})
```

### Cơ bản

```html
<app-loading />
```

### Với tùy chọn tùy chỉnh

```html
<!-- Không hiển thị message -->
<app-loading [showMessage]="false" />

<!-- Custom message -->
<app-loading [message]="'COMMON.PROCESSING'" />

<!-- Kích thước khác nhau -->
<app-loading [size]="'sm'" />  <!-- small -->
<app-loading [size]="'md'" />  <!-- medium (default) -->
<app-loading [size]="'lg'" />  <!-- large -->

<!-- Custom padding -->
<app-loading [padding]="'py-4'" />

<!-- Custom logo -->
<app-loading [logoSrc]="'/custom-logo.png'" />
```

### Kết hợp với điều kiện

```html
@if (isLoading()) {
  <app-loading />
}
```

## Inputs

| Input | Type | Default | Mô tả |
|-------|------|---------|-------|
| `message` | `string` | `'CHAT.LOADING'` | Translation key cho loading message |
| `showMessage` | `boolean` | `true` | Hiển thị hoặc ẩn message |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Kích thước logo |
| `logoSrc` | `string` | `'/logo-short.png'` | Đường dẫn đến logo image |
| `padding` | `string` | `'py-8'` | Tailwind padding class |

## Ví dụ sử dụng trong dự án

### Chat Loading
```html
@if (isLoading()) {
  <app-loading />
}
```

### Data Table Loading
```html
@if (loadingData()) {
  <app-loading [message]="'COMMON.LOADING_DATA'" [size]="'sm'" />
}
```

### Full Page Loading
```html
<div class="min-h-screen flex items-center justify-center">
  <app-loading [size]="'lg'" />
</div>
```
