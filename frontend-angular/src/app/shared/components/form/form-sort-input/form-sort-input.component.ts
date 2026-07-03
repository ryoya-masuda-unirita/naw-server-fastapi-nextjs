import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  model,
  output,
  signal,
  computed,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { TranslateModule } from '@ngx-translate/core';
import { UiStore } from '@core/stores/ui.store';
import { AppMatIconComponent } from '@shared/components/icons/mat-icon.component';
import { SvgIconComponent } from '@app/shared/components/icons/svg-icon.component';

export interface SortOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-form-sort-input',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatMenuModule,
    TranslateModule,
    AppMatIconComponent,
    SvgIconComponent,
  ],
  templateUrl: './form-sort-input.component.html',
  styleUrl: './form-sort-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block relative',
  },
})
export class FormSortInputComponent {
  // Inputs
  readonly placeholder = input<string>('更新日時順');
  readonly disabled = input<boolean>(false);
  readonly size = input<'sm' | 'md'>('md');
  readonly width = input<string>('100%');

  // Config options
  readonly fields = model<SortOption[]>([
    { label: '更新日時順', value: 'updatedAt' },
    { label: '用語順', value: 'term' },
  ]);

  readonly orders = input<SortOption[]>([
    { label: '昇順', value: 'asc' },
    { label: '降順', value: 'desc' },
  ]);

  // Two-way bindings for state
  readonly selectedField = model<string | null>(null);
  readonly selectedOrder = model<string | null>(null);

  // Outputs
  readonly fieldChange = output<string | null>();
  readonly orderChange = output<string | null>();
  readonly clear = output<void>();

  // State
  readonly isMenuOpen = signal<boolean>(false);
  readonly isDrawerVisible = signal<boolean>(false);

  // Dependencies
  private readonly uiStore = inject(UiStore);
  readonly isMobile = this.uiStore.isMobile;

  // Computed properties
  readonly activeFieldLabel = computed(() => {
    const value = this.selectedField();
    if (!value) return '';
    const field = this.fields().find((f) => f.value === value);
    return field ? field.label : value;
  });

  onSelectField(value: string): void {
    if (this.selectedField() !== value) {
      this.selectedField.set(value);
      this.fieldChange.emit(value);
    }
  }

  onSelectOrder(value: string): void {
    if (this.selectedOrder() !== value) {
      this.selectedOrder.set(value);
      this.orderChange.emit(value);
    }
  }

  onClear(event: Event): void {
    event.stopPropagation();
    this.selectedField.set(null);
    this.selectedOrder.set(null);
    this.fieldChange.emit(null);
    this.orderChange.emit(null);
    this.clear.emit();
  }

  onMenuOpened(): void {
    this.isMenuOpen.set(true);
  }

  onMenuClosed(): void {
    this.isMenuOpen.set(false);
  }

  onTriggerClick(): void {
    if (this.disabled() || !this.isMobile()) return;
    this.openDrawer();
  }

  openDrawer(): void {
    this.isDrawerVisible.set(true);
    requestAnimationFrame(() => this.isMenuOpen.set(true));
  }

  closeDrawer(): void {
    this.isMenuOpen.set(false);
    setTimeout(() => this.isDrawerVisible.set(false), 300);
  }
}
