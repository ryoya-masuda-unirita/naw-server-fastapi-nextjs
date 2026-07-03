import { CommonModule } from '@angular/common';
import { Component, inject, signal, TemplateRef, viewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonComponent } from '@shared/components';
import { DialogComponent, DialogData } from './dialog.component';

/**
 * Example component demonstrating various ways to use DialogComponent
 * This is for documentation purposes only
 */
@Component({
  selector: 'app-dialog-examples',
  standalone: true,
  imports: [CommonModule, TranslateModule, ButtonComponent],
  template: `
    <div class="p-8 space-y-4">
      <h1 class="text-2xl font-bold mb-6">Dialog Examples</h1>

      <!-- Example 1: Basic Dialog -->
      <app-button (buttonClick)="openBasicDialog()"> Open Basic Dialog </app-button>

      <!-- Example 2: Dialog with Custom Content -->
      <app-button (buttonClick)="openCustomContentDialog()">
        Open Custom Content Dialog
      </app-button>

      <!-- Example 3: Dialog with Custom Actions -->
      <app-button (buttonClick)="openCustomActionsDialog()">
        Open Custom Actions Dialog
      </app-button>

      <!-- Example 4: Rating Dialog with Custom Template -->
      <app-button (buttonClick)="openRatingDialog()"> Open Rating Dialog </app-button>

      <!-- Templates -->
      <ng-template #ratingContent>
        <div class="space-y-4">
          <h3 class="text-sm font-medium text-gray-900">Rate your experience</h3>
          <div class="flex gap-2">
            @for (star of [1, 2, 3, 4, 5]; track star) {
              <button
                type="button"
                class="text-3xl transition-transform hover:scale-110"
                [class.text-yellow-500]="selectedRating() >= star"
                [class.text-gray-300]="selectedRating() < star"
                (click)="selectRating(star)"
              >
                {{ selectedRating() >= star ? '★' : '☆' }}
              </button>
            }
          </div>
          @if (selectedRating() > 0) {
            <p class="text-sm text-gray-600">You selected {{ selectedRating() }} stars</p>
          }
        </div>
      </ng-template>

      <ng-template #customActions>
        <div class="flex gap-3 w-full">
          <button
            type="button"
            class="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            (click)="closeDialog()"
          >
            Cancel
          </button>
          <button
            type="button"
            class="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            [disabled]="selectedRating() === 0"
            (click)="saveRating()"
          >
            Save Rating
          </button>
        </div>
      </ng-template>
    </div>
  `,
})
export class DialogExamplesComponent {
  private readonly dialog = inject(MatDialog);

  readonly ratingContentTemplate = viewChild.required<TemplateRef<unknown>>('ratingContent');
  readonly customActionsTemplate = viewChild.required<TemplateRef<unknown>>('customActions');

  readonly selectedRating = signal<number>(0);

  // Example 1: Basic confirmation dialog
  openBasicDialog(): void {
    const dialogRef = this.dialog.open(DialogComponent, {
      data: {
        title: 'Confirm Delete',
        message: 'Are you sure you want to delete this item? This action cannot be undone.',
        confirmText: 'Delete',
        cancelText: 'Cancel',
      } as DialogData,
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        console.log('Item deleted');
      }
    });
  }

  // Example 2: Dialog with custom content template
  openCustomContentDialog(): void {
    const dialogRef = this.dialog.open(DialogComponent, {
      data: {
        title: 'Custom Content Example',
        content: this.ratingContentTemplate(),
        confirmText: 'OK',
        showCancel: false,
      } as DialogData,
      width: '400px',
    });

    dialogRef.afterClosed().subscribe(() => {
      this.selectedRating.set(0);
    });
  }

  // Example 3: Dialog with custom actions
  openCustomActionsDialog(): void {
    this.selectedRating.set(0);

    const dialogRef = this.dialog.open(DialogComponent, {
      data: {
        title: 'Rate This Feature',
        content: this.ratingContentTemplate(),
        customActions: this.customActionsTemplate(),
        showDefaultActions: false,
      } as DialogData,
      width: '400px',
    });

    dialogRef.afterClosed().subscribe(() => {
      this.selectedRating.set(0);
    });
  }

  // Example 4: Simple rating dialog
  openRatingDialog(): void {
    this.selectedRating.set(0);

    // const dialogRef = this.dialog.open(DialogComponent, {
    //   data: {
    //     title: 'How satisfied are you?',
    //     titleClass: 'text-xl font-bold text-gray-900',
    //     content: this.ratingContentTemplate(),
    //     customActions: this.customActionsTemplate(),
    //     showDefaultActions: false,
    //   } as DialogData,
    //   width: '400px',
    //   panelClass: 'rating-dialog',
    // });
  }

  selectRating(rating: number): void {
    this.selectedRating.set(rating);
  }

  closeDialog(): void {
    this.dialog.closeAll();
    this.selectedRating.set(0);
  }

  saveRating(): void {
    console.log('Rating saved:', this.selectedRating());
    this.dialog.closeAll();
    this.selectedRating.set(0);
  }
}
