import { inject, Injectable, Signal, TemplateRef } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { DialogComponent, type DialogData } from '@shared/components/dialog/dialog.component';
import { TenantApiService } from './tenant-api.service';
@Injectable({ providedIn: 'root' })
export class TenantUsageDialogService {
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly tenantApi = inject(TenantApiService);

  openUsageLimitDialog(options: {
    titleKey: string;
    content: TemplateRef<unknown>;
    confirmDisabled: Signal<boolean>;
    onConfirm: () => Promise<void>;
  }): MatDialogRef<DialogComponent, unknown> {
    const dialogRef = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant(options.titleKey),
        content: options.content,
        confirmText: this.translate.instant('COMMON.SAVE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        showCancel: true,
        showConfirm: true,
        buttonAlign: 'right',
        showDivider: true,
        confirmMinWidth: 'min-w-[98px]',
        confirmDisabledSignal: options.confirmDisabled,
        confirmLoadingSignal: this.tenantApi.isUpdatingUsageLimit,
        confirmAction: () => options.onConfirm().then(() => dialogRef.close(true)),
      } as DialogData,
      autoFocus: false,
      width: '800px',
      maxWidth: '90vw',
    });
    return dialogRef;
  }
}
