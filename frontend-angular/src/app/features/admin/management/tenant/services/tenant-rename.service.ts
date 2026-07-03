import { inject, Injectable, Signal, TemplateRef } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { DialogComponent, type DialogData } from '@shared/components/dialog/dialog.component';
import { TenantApiService } from './tenant-api.service';

@Injectable({ providedIn: 'root' })
export class TenantRenameService {
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly tenantApi = inject(TenantApiService);

  openRenameDialog(
    content: TemplateRef<unknown>,
    nameControl: FormControl<string | null>,
    confirmDisabled: Signal<boolean>,
  ): MatDialogRef<DialogComponent, unknown> {
    const dialogRef = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('TENANT.RENAME_WS_TITLE'),
        content,
        showCancel: true,
        cancelText: this.translate.instant('COMMON.CANCEL'),
        showConfirm: true,
        confirmText: this.translate.instant('COMMON.SAVE'),
        buttonAlign: 'right',
        showClose: false,
        confirmLoadingSignal: this.tenantApi.isUpdatingTenant,
        confirmDisabledSignal: confirmDisabled,
        confirmAction: () => {
          const name = nameControl.value?.trim() ?? '';
          if (!name) {
            nameControl.markAsTouched();
            return;
          }
          return this.tenantApi.updateTenant(name).then(() => dialogRef.close(true));
        },
      } as DialogData,
      width: '800px',
      maxWidth: '90vw',
      autoFocus: false,
    });
    return dialogRef;
  }
}
