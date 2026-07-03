import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

@Component({
  selector: 'app-mat-icon',
  standalone: true,
  imports: [MatIcon],
  template: `<mat-icon>{{ icon() }}</mat-icon>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  styles: [
    `
      mat-icon {
        font-size: inherit !important;
        width: 1em !important;
        height: 1em !important;
        line-height: 1 !important;
      }
    `,
  ],
})
export class AppMatIconComponent {
  readonly icon = input.required<string>();
}
