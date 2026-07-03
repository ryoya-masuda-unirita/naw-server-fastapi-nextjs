import {
  Component,
  computed,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { UiStore } from '@core/stores/ui.store';
import { SvgIconComponent } from '@app/shared/components/icons/svg-icon.component';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-search-input',
  standalone: true,
  imports: [TranslateModule, SvgIconComponent, NgClass],
  templateUrl: './search-input.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
    '[style.width]': 'hostWidth()',
  },
})
export class SearchInputComponent {
  private readonly uiStore = inject(UiStore);
  private readonly isMobile = this.uiStore.isMobile;

  // Inputs
  readonly size = input<'default' | 'small'>('default');

  readonly hostWidth = computed(() =>
    this.size() === 'small' && !this.isMobile() ? '160px' : '100%',
  );
  readonly value = input<string>('');
  readonly placeholder = input<string>('');
  readonly ariaLabel = input<string>('');
  readonly maxLength = input<number | null>(null);
  readonly showSearchIcon = input<boolean>(true);
  readonly showClearButton = input<boolean>(true);
  readonly inputClass = input<string>('');

  // State
  readonly isFocused = signal(false);

  // Outputs
  readonly valueChange = output<string>();
  readonly cleared = output<void>();
  readonly searchClick = output<void>();

  handleInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.valueChange.emit(value);
  }

  handleClear(): void {
    this.valueChange.emit('');
    this.cleared.emit();
  }

  handleSearch(): void {
    this.searchClick.emit();
  }

  onFocus(): void {
    this.isFocused.set(true);
  }

  onBlur(): void {
    this.isFocused.set(false);
  }
}
