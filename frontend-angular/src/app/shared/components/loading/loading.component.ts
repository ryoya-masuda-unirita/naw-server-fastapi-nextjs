import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-loading',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './loading.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex items-center justify-center',
  },
})
export class LoadingComponent {
  // Inputs
  readonly message = input<string>('CHAT.LOADING');
  readonly showMessage = input<boolean>(true);
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly logoSrc = input<string>('/logo-min.svg');

  readonly padding = input<string>('py-8');

  // Computed size class
  getSizeClass(): string {
    const sizeMap = {
      sm: 'w-8',
      md: 'w-12',
      lg: 'w-16',
    };
    return sizeMap[this.size()];
  }

  getGapClass(): string {
    const gapMap = {
      sm: 'gap-3',
      md: 'gap-6',
      lg: 'gap-8',
    };
    return gapMap[this.size()];
  }
}
