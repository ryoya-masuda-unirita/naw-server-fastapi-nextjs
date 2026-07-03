/**
 * Date Range Select Component - Reusable dropdown with presets and custom date picker
 *
 * Usage:
 * <app-date-range-select
 *   [options]="periodOptions"
 *   [(period)]="currentPeriod"
 *   [(customRange)]="customRange"
 *   (change)="onPeriodChange($event)"
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
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { OverlayModule } from '@angular/cdk/overlay';

export interface DateRangeOption {
  label: string;
  value: string;
}

export interface DateRangeValue {
  start: string;
  end: string;
}

@Component({
  selector: 'app-date-range-select',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, TranslateModule, OverlayModule],
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
        {{ selectedLabel() | translate }}
      </span>
      <mat-icon
        class="text-gray-400 !w-4 !h-4 !text-[16px] transition-transform duration-200 flex-shrink-0"
        [class.rotate-180]="isOpen()"
      >
        expand_more
      </mat-icon>
    </div>

    <!-- Main Dropdown Panel -->
    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="trigger"
      [cdkConnectedOverlayOpen]="isOpen()"
      [cdkConnectedOverlayHasBackdrop]="true"
      (backdropClick)="close()"
    >
      <div
        class="w-[200px] mt-2 bg-white rounded-lg shadow-lg border border-slate-100 overflow-visible py-1 animate-fade-in relative z-50"
      >
        <!-- Preset Options -->
        <div class="flex flex-col">
          @for (option of options(); track option.value) {
            <div
              (click)="selectOption(option.value)"
              (mouseenter)="closeSubMenu()"
              class="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors group"
            >
              <div class="flex items-center gap-2">
                <!-- Checkmark -->
                @if (period() === option.value) {
                  <mat-icon class="text-primary !w-4 !h-4 !text-[16px]">check</mat-icon>
                } @else {
                  <div class="w-4"></div>
                }

                <span class="text-sm text-text-default group-hover:text-primary">
                  {{ option.label | translate }}
                </span>
              </div>
            </div>
          }

          <!-- Specify Period Trigger Row -->
          <div
            cdkOverlayOrigin
            #subMenuTrigger="cdkOverlayOrigin"
            (mouseenter)="openSubMenu()"
            class="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors border-t border-slate-100 mt-1 bg-slate-50 group relative"
          >
            <div class="flex items-center gap-2">
              <!-- Checkmark -->
              @if (period() === 'custom') {
                <mat-icon class="text-primary !w-4 !h-4 !text-[16px]">check</mat-icon>
              } @else {
                <div class="w-4"></div>
              }
              <span class="text-sm text-text-default group-hover:text-primary">
                {{ 'COMMON.SPECIFY_PERIOD' | translate }}
              </span>
            </div>
            <mat-icon class="text-gray-400 !w-4 !h-4 !text-[16px]">chevron_right</mat-icon>
          </div>
        </div>

        <!-- Sub Menu (Date Picker) Panel -->
        <!-- Nested inside main template to access subMenuTrigger -->
        <ng-template
          cdkConnectedOverlay
          [cdkConnectedOverlayOrigin]="subMenuTrigger"
          [cdkConnectedOverlayOpen]="isSubMenuOpen() && isOpen()"
          [cdkConnectedOverlayPositions]="subMenuPositions"
          [cdkConnectedOverlayHasBackdrop]="false"
        >
          <div
            (mouseenter)="openSubMenu()"
            (mouseleave)="closeSubMenu()"
            class="w-[280px] ml-2 bg-white rounded-lg shadow-lg border border-slate-100 p-3 animate-fade-in z-50"
          >
            <div class="grid grid-cols-1 gap-3">
              <!-- Start Date -->
              <div class="flex items-center gap-2">
                <div class="relative flex-1">
                  <input
                    type="date"
                    [(ngModel)]="tempStartDate"
                    class="w-full h-9 px-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-primary bg-transparent text-text-default"
                  />
                </div>
                <span class="text-xs text-text-default">{{ 'COMMON.START_DATE' | translate }}</span>
              </div>

              <!-- End Date -->
              <div class="flex items-center gap-2">
                <div class="relative flex-1">
                  <input
                    type="date"
                    [(ngModel)]="tempEndDate"
                    class="w-full h-9 px-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-primary bg-transparent text-text-default"
                  />
                </div>
                <span class="text-xs text-text-default">{{ 'COMMON.END_DATE' | translate }}</span>
              </div>
            </div>

            <div class="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
              <button
                (click)="clearCustom()"
                class="text-xs text-primary hover:underline whitespace-nowrap"
              >
                {{ 'COMMON.CLEAR_SELECTION' | translate }}
              </button>
              <div class="flex items-center gap-2">
                <button (click)="close()" class="text-xs text-text-default hover:underline">
                  {{ 'COMMON.CANCEL' | translate }}
                </button>
                <button
                  (click)="applyCustom()"
                  class="px-3 py-1 bg-primary text-white text-xs rounded hover:bg-primary-hover disabled:opacity-50 whitespace-nowrap"
                  [disabled]="!isValidCustomRange()"
                >
                  {{ 'COMMON.APPLY' | translate }}
                </button>
              </div>
            </div>
          </div>
        </ng-template>
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
export class DateRangeSelectComponent {
  // Inputs
  readonly options = input.required<DateRangeOption[]>();

  // Models
  readonly period = model<string>('all');
  readonly customRange = model<DateRangeValue | null>(null);

  // Outputs
  readonly handleChange = output<{ period: string; customRange?: DateRangeValue }>();

  // State
  readonly isOpen = signal(false);
  readonly isSubMenuOpen = signal(false);
  readonly tempStartDate = signal('');
  readonly tempEndDate = signal('');

  readonly subMenuPositions = [
    {
      originX: 'end',
      originY: 'top',
      overlayX: 'start',
      overlayY: 'top',
      offsetX: 8,
    } as any,
  ];

  readonly selectedLabel = computed(() => {
    if (this.period() === 'custom' && this.customRange()) {
      return `${this.customRange()?.start} ~ ${this.customRange()?.end}`;
    }
    const option = this.options().find((o) => o.value === this.period());
    return option ? option.label : 'COMMON.ALL_PERIODS';
  });

  isValidCustomRange = computed(() => !!this.tempStartDate() && !!this.tempEndDate());

  toggleOpen() {
    this.isOpen.set(!this.isOpen());
    if (!this.isOpen()) {
      this.isSubMenuOpen.set(false);
    }
  }

  close() {
    this.isOpen.set(false);
    this.isSubMenuOpen.set(false);
  }

  openSubMenu() {
    this.isSubMenuOpen.set(true);
    if (this.period() === 'custom' && this.customRange()) {
      this.tempStartDate.set(this.customRange()!.start);
      this.tempEndDate.set(this.customRange()!.end);
    }
  }

  closeSubMenu() {
    this.isSubMenuOpen.set(false);
  }

  selectOption(value: string) {
    this.period.set(value);
    this.handleChange.emit({ period: value });
    this.close();
  }

  clearCustom() {
    this.tempStartDate.set('');
    this.tempEndDate.set('');
    this.selectOption('all');
  }

  applyCustom() {
    if (!this.isValidCustomRange()) return;

    const range = { start: this.tempStartDate(), end: this.tempEndDate() };
    this.period.set('custom');
    this.customRange.set(range);

    this.handleChange.emit({ period: 'custom', customRange: range });
    this.close();
  }
}
