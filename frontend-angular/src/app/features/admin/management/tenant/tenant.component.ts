import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import type { TabItem } from '@app-types/tab.type';
import { createTabQueryParam } from '@core/utils/tab-query-param.util';
import { AdminPageShellComponent } from '@shared/layouts/admin-page-shell/admin-page-shell.component';
import { FormInputComponent } from '@shared/components/form/form-input/form-input.component';
import { resolveControlError } from '@shared/utils/form-errors';
import { TenantApiService } from './services/tenant-api.service';
import { TenantRenameService } from './services/tenant-rename.service';
import { UsageTabComponent } from './tabs/usage-tab/usage-tab.component';
import { ApiTabComponent } from './tabs/api-tab/api-tab.component';

@Component({
  selector: 'app-tenant',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    ReactiveFormsModule,
    AdminPageShellComponent,
    UsageTabComponent,
    ApiTabComponent,
    FormInputComponent,
  ],
  templateUrl: './tenant.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col h-full',
  },
})
export class TenantComponent {
  private readonly translate = inject(TranslateService);
  private readonly tenantApi = inject(TenantApiService);
  private readonly renameService = inject(TenantRenameService);

  private readonly tabState = createTabQueryParam({
    validTabs: ['usage', 'api'] as const,
    defaultTab: 'usage',
  });

  readonly activeTabId = this.tabState.activeTabId;
  readonly onTabChange = this.tabState.onTabChange;

  @ViewChild('renameWsModalContent') private renameWsModalContent!: TemplateRef<unknown>;

  readonly tabs = signal<TabItem[]>([
    { id: 'usage', label: this.translate.instant('TENANT.TAB_USAGE') },
    { id: 'api', label: this.translate.instant('TENANT.TAB_API') },
  ]);

  readonly isLoading = computed(() => this.tenantApi.tenantInfoQuery.isPending());

  readonly tenantName = computed(() => this.tenantApi.tenantInfoQuery.data()?.tenantName ?? '');

  readonly renameWsNameControl = new FormControl('', [Validators.required]);

  /** FormControl の値・状態変化を Signal 連携させるためのトリガー。 */
  private readonly renameWsTick = signal(0);

  readonly renameWsConfirmDisabled = computed(() => {
    this.renameWsTick();
    return !this.renameWsNameControl.value?.trim();
  });

  readonly renameWsNameError = computed(() => {
    this.renameWsTick();
    return resolveControlError(this.renameWsNameControl, this.translate);
  });

  constructor() {
    effect(() => {
      const name = this.tenantApi.tenantInfoQuery.data()?.tenantName;
      if (name) this.renameWsNameControl.setValue(name);
    });

    effect((onCleanup) => {
      const sub = this.renameWsNameControl.events.subscribe(() =>
        this.renameWsTick.update((n) => n + 1),
      );
      onCleanup(() => sub.unsubscribe());
    });
  }

  onEditClick(): void {
    this.renameService.openRenameDialog(
      this.renameWsModalContent,
      this.renameWsNameControl,
      this.renameWsConfirmDisabled,
    );
  }
}
