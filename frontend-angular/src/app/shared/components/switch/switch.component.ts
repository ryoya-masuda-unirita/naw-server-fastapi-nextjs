import { Component, input, model, output, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-switch',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './switch.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex items-center',
    '(click)': 'toggle($event)',
  },
})
export class SwitchComponent {
  // Inputs
  readonly label = input<string>('');
  readonly disabled = input<boolean>(false);
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly showIcon = input<boolean>(true);

  // Two-way binding
  readonly checked = model<boolean>(false);

  // Outputs
  readonly checkedChange = output<boolean>();

  // Computed sizes
  readonly switchSize = computed(() => {
    const sizes = {
      sm: {
        track: 'w-10 h-5',
        thumb: 'w-4 h-4',
        translate: 'translate-x-5',
        iconLine: 'w-2 h-0.5',
      },
      md: {
        track: 'w-14 h-7',
        thumb: 'w-6 h-6',
        translate: 'translate-x-7',
        iconLine: 'w-3 h-0.5',
      },
      lg: {
        track: 'w-19.5 h-9',
        thumb: 'w-6 h-6',
        translate: 'translate-x-10',
        iconLine: 'w-3.5 h-0.5',
      },
    };
    return sizes[this.size()];
  });

  toggle(event: Event) {
    event.stopPropagation();
    if (!this.disabled()) {
      const newValue = !this.checked();
      this.checked.set(newValue);
      this.checkedChange.emit(newValue);
    }
  }
}
