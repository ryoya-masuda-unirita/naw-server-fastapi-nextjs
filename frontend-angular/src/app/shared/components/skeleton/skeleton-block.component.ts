import { ChangeDetectionStrategy, Component, input, computed } from '@angular/core';
import { SkeletonComponent } from './skeleton.component';

@Component({
  selector: 'app-skeleton-block',
  standalone: true,
  imports: [SkeletonComponent],
  template: `
    @for (i of rows(); track i) {
      <div class="flex items-center gap-3 px-3 py-2.5">
        <app-skeleton width="1.25rem" height="1.25rem" />
        <app-skeleton variant="text" height="1rem" />
        <app-skeleton variant="circle" width="1.25rem" height="1.25rem" />
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-1' },
})
export class SkeletonBlockComponent {
  readonly length = input.required<number>();

  readonly rows = computed(() => Array.from({ length: this.length() }, (_, i) => i));
}
