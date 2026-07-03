import { CommonModule } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Signal,
  TemplateRef,
  Type,
  ViewEncapsulation,
} from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { ButtonComponent } from '@shared/components/button/button.component';
import { AppMatIconComponent } from '@shared/components/icons/mat-icon.component';
import { SvgIconComponent } from '../icons/svg-icon.component';

export interface DialogData {
  title: string;
  titleClass?: string;
  message?: string;
  content?: TemplateRef<unknown>;
  contentComponent?: Type<unknown>;
  contentComponentInputs?: Record<string, unknown>;
  bottomLeftContent?: TemplateRef<unknown>;
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
  showConfirm?: boolean;
  showClose?: boolean;
  showDivider?: boolean;
  buttonAlign?: 'center' | 'right';
  customActions?: TemplateRef<unknown>;
  width?: string;
  minWidth?: string;
  padding?: string;
  borderRadius?: string;
  showDefaultActions?: boolean;

  headerTrailing?: TemplateRef<unknown>;

  leftActionText?: string;

  leftActionIcon?: string;

  leftActionDanger?: boolean;

  leftActionLoading?: boolean;
  leftActionLoadingSignal?: Signal<boolean>;

  leftAction?: () => void;

  cancelAction?: () => void;

  confirmAction?: () => void;
  confirmVariant?: 'solid' | 'outline' | 'danger';
  confirmDanger?: boolean;
  confirmIcon?: string;
  confirmLoading?: boolean;
  confirmLoadingSignal?: Signal<boolean>;
  confirmDisabledSignal?: Signal<boolean>;
  confirmMinWidth?: string;
  contentClass?: string;
}

@Component({
  selector: 'app-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatDividerModule,
    MatIconModule,
    ButtonComponent,
    AppMatIconComponent,
    SvgIconComponent,
  ],
  templateUrl: './dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'modal-dialog',
  },
})
export class DialogComponent {
  private readonly dialogRef = inject(MatDialogRef<DialogComponent>);
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly data = inject<DialogData>(MAT_DIALOG_DATA);

  constructor() {
    afterNextRender(() => {
      const surface = this.host.nativeElement.closest('.mdc-dialog__surface') as HTMLElement | null;
      if (surface) {
        if (this.data.width) surface.style.width = this.data.width;
        if (this.data.minWidth) surface.style.minWidth = this.data.minWidth;
      }
    });
  }

  get showDefaultActions(): boolean {
    return this.data.showDefaultActions !== false;
  }

  handleCancelClick(): void {
    if (this.data.cancelAction) {
      this.data.cancelAction();
    } else {
      this.dialogRef.close(false);
    }
  }

  handleConfirmClick(): void {
    if (this.data.confirmAction) {
      this.data.confirmAction();
    } else {
      this.dialogRef.close(true);
    }
  }

  handleLeftActionClick(): void {
    this.data.leftAction?.();
  }

  close(result?: unknown): void {
    this.dialogRef.close(result);
  }
}
