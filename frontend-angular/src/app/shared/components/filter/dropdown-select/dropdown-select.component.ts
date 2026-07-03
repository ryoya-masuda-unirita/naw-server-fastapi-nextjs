/**
 * Dropdown Select Component - Reusable dropdown with overlay
 *
 * Usage:
 * <app-dropdown-select
 *   [options]="options"
 *   [(value)]="selectedValue"
 *   [placeholder]="'Select an option'"
 *   (valueChange)="onValueChange($event)"
 * />
 */
import {
  Component,
  ChangeDetectionStrategy,
  input,
  model,
  output,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { OverlayModule } from '@angular/cdk/overlay';

export interface DropdownOption {
  label: string;
  value: string;
  icon?: string;
}

@Component({
  selector: 'app-dropdown-select',
  standalone: true,
  imports: [CommonModule, MatIconModule, TranslateModule, OverlayModule],
  template: `
    <!-- Trigger Button -->
    <div
      cdkOverlayOrigin
      #trigger="cdkOverlayOrigin"
      (click)="toggleOpen()"
      class="relative flex items-center justify-between w-full h-10 px-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors"
      [class.ring-2]="isOpen()"
      [class.ring-primary]="isOpen()"
    >
      <span class="text-sm text-text-default truncate">
        @if (translateLabels()) {
          {{ selectedLabel() | translate }}
        } @else {
          {{ selectedLabel() }}
        }
      </span>
      <mat-icon
        class="text-gray-400 !w-4 !h-4 !text-[16px] transition-transform duration-200 flex-shrink-0"
        [class.rotate-180]="isOpen()"
      >
        expand_more
      </mat-icon>
    </div>

    <!-- Dropdown Panel -->
    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="trigger"
      [cdkConnectedOverlayOpen]="isOpen()"
      [cdkConnectedOverlayHasBackdrop]="true"
      [cdkConnectedOverlayWidth]="panelWidth()"
      (backdropClick)="close()"
    >
      <div
        class="min-w-[200px] mt-2 bg-white rounded-lg shadow-lg border border-slate-100 overflow-hidden py-1 animate-fade-in max-h-[300px] overflow-y-auto"
      >
        @for (option of options(); track option.value) {
          <div
            (click)="selectOption(option)"
            class="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors group"
          >
            <div class="flex items-center gap-2">
              <!-- Checkmark for selected -->
              @if (value() === option.value) {
                <mat-icon class="text-primary !w-4 !h-4 !text-[16px]">check</mat-icon>
              } @else {
                <div class="w-4"></div>
              }

              @if (option.icon) {
                <mat-icon class="!w-4 !h-4 !text-[16px] text-text-lighter">{{
                  option.icon
                }}</mat-icon>
              }

              <span class="text-sm text-text-default group-hover:text-primary">
                @if (translateLabels()) {
                  {{ option.label | translate }}
                } @else {
                  {{ option.label }}
                }
              </span>
            </div>
          </div>
        }
      </div>
    </ng-template>
  `,
  styles: [
    `
      .animate-fade-in {
        animation: fadeIn 0.15s ease-out;
      }
      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DropdownSelectComponent {
  // Inputs
  readonly options = input.required<DropdownOption[]>();
  readonly placeholder = input<string>('');
  readonly translateLabels = input<boolean>(true);
  readonly panelWidth = input<string | number>('auto');

  // Two-way binding
  readonly value = model<string>('');

  // Outputs
  readonly valueChange = output<string>();

  // Internal state
  readonly isOpen = signal(false);

  // Computed
  readonly selectedLabel = computed(() => {
    const option = this.options().find((o) => o.value === this.value());
    return option ? option.label : this.placeholder() || this.options()[0]?.label || '';
  });

  toggleOpen() {
    this.isOpen.set(!this.isOpen());
  }

  close() {
    this.isOpen.set(false);
  }

  selectOption(option: DropdownOption) {
    this.value.set(option.value);
    this.valueChange.emit(option.value);
    this.close();
  }
}
