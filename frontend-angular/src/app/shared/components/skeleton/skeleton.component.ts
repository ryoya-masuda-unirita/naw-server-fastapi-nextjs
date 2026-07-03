import { ChangeDetectionStrategy, Component, input, computed } from '@angular/core';

export type SkeletonVariant = 'text' | 'circle' | 'rect';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  template: ``,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'hostClasses()',
    '[style.width]': 'width()',
    '[style.height]': 'height()',
  },
})
export class SkeletonComponent {
  readonly variant = input<SkeletonVariant>('rect');
  readonly width = input<string>('100%');
  readonly height = input<string>('1rem');
  /** Custom border-radius class; only used when variant is 'rect' */
  readonly rounded = input<string>('rounded');

  readonly hostClasses = computed(() => {
    const shape =
      this.variant() === 'circle'
        ? 'rounded-full'
        : this.variant() === 'text'
          ? 'rounded'
          : this.rounded();

    return `block bg-gray-200 animate-pulse shrink-0 ${shape}`;
  });
}
