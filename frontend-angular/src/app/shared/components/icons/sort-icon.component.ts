import { Component, ChangeDetectionStrategy, input } from '@angular/core';

@Component({
  selector: 'app-sort-icon',
  standalone: true,
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <rect
        x="2"
        y="5"
        width="20"
        height="2"
        rx="1"
        class="transition-transform duration-300 ease-in-out origin-left"
        [style.transform]="direction() === 'asc' ? 'scaleX(0.4)' : 'scaleX(1)'"
      ></rect>
      <rect x="2" y="11" width="14" height="2" rx="1"></rect>
      <rect
        x="2"
        y="17"
        width="20"
        height="2"
        rx="1"
        class="transition-transform duration-300 ease-in-out origin-left"
        [style.transform]="direction() === 'asc' ? 'scaleX(1)' : 'scaleX(0.4)'"
      ></rect>
    </svg>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
})
export class SortIconComponent {
  readonly direction = input<'asc' | 'desc'>('desc');
}
