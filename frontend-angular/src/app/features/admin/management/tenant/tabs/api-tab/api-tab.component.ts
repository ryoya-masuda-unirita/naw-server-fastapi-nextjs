import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  model,
  signal,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DialogComponent, type DialogData } from '@shared/components/dialog/dialog.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { CircularLoadingComponent } from '@shared/components/circular-loading/circular-loading.component';
import { ContextMenuComponent } from '@shared/components/context-menu/context-menu.component';
import { TableListComponent } from '@shared/components/table-list/table-list.component';
import { TableListItemComponent } from '@shared/components/table-list/table-list-item.component';
import {
  FormSortInputComponent,
  SortOption,
} from '@shared/components/form/form-sort-input/form-sort-input.component';
import {
  AddApiDialogComponent,
  AddApiFormData,
} from '../../components/add-api-dialog/add-api-dialog.component';
import { TenantApiService } from '../../services/tenant-api.service';
import type { Endpoint } from '@app-types/admin/tenant.types';
import { isManageableEndpointType } from '../../tenant.constants';

@Component({
  selector: 'app-api-tab',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    ButtonComponent,
    PaginationComponent,
    SvgIconComponent,
    ContextMenuComponent,
    TableListComponent,
    TableListItemComponent,
    FormSortInputComponent,
    CircularLoadingComponent,
    AddApiDialogComponent,
  ],
  templateUrl: './api-tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
})
export class ApiTabComponent {
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly tenantApi = inject(TenantApiService);

  @ViewChild('addApiTemplate') addApiTemplate!: TemplateRef<unknown>;
  @ViewChild('editApiTemplate') editApiTemplate!: TemplateRef<unknown>;

  private readonly endpointsResponse = computed(() => this.tenantApi.endpointsQuery.data());
  readonly apiConfigs = computed(() => this.endpointsResponse()?.data ?? []);
  readonly apiConfigsTotal = computed(() => this.endpointsResponse()?.total ?? 0);
  readonly apiCurrentPage = computed(() => this.tenantApi.endpointsPage());
  readonly totalPagesApi = computed(() => {
    const total = this.apiConfigsTotal();
    return total > 0 ? Math.ceil(total / TenantApiService.ENDPOINTS_PAGE_SIZE) : 1;
  });
  readonly apiPageRangeStart = computed(() => {
    const page = this.apiCurrentPage();
    const pageSize = TenantApiService.ENDPOINTS_PAGE_SIZE;
    return this.apiConfigsTotal() === 0 ? 0 : (page - 1) * pageSize + 1;
  });
  readonly apiPageRangeEnd = computed(() =>
    Math.min(this.apiCurrentPage() * TenantApiService.ENDPOINTS_PAGE_SIZE, this.apiConfigsTotal()),
  );
  readonly apiConfigsFetching = computed(() => this.tenantApi.endpointsQuery.isFetching());

  readonly addApiForm = signal<AddApiFormData>({
    endpointName: '',
    type: 'LOCAL_SERVER',
    endpoint: '',
    apiKey: '',
  });

  readonly addApiConfirmDisabled = computed(() => {
    const { endpointName, type, endpoint, apiKey } = this.addApiForm();
    return !endpointName || !type || !endpoint || !apiKey;
  });

  readonly editApiForm = signal<AddApiFormData>({
    endpointName: '',
    type: '',
    endpoint: '',
    apiKey: '',
  });

  readonly editApiConfirmDisabled = computed(() => {
    const { endpointName, type, endpoint, apiKey } = this.editApiForm();
    return !endpointName || !type || !endpoint || !apiKey;
  });

  readonly apiSortFields = model<SortOption[]>([
    { value: 'updated', label: '更新日時順' },
    { value: 'name', label: 'APIの表示名順' },
    { value: 'port', label: '接続先順' },
  ]);

  readonly selectedSortField = model<string | null>(null);
  readonly selectedSortOrder = model<string | null>(null);

  constructor() {
    effect(() => {
      this.tenantApi.endpointsSortField.set(this.selectedSortField());
      this.tenantApi.endpointsSortOrder.set(this.selectedSortOrder());
      this.tenantApi.endpointsPage.set(1);
    });
  }

  onApiPageChange(page: number): void {
    this.tenantApi.endpointsPage.set(page);
  }

  updateAddApiField(field: keyof AddApiFormData, value: string | null): void {
    if (value === null) return;
    this.addApiForm.set({ ...this.addApiForm(), [field]: value });
  }

  updateEditApiField(field: keyof AddApiFormData, value: string | null): void {
    if (value === null) return;
    this.editApiForm.set({ ...this.editApiForm(), [field]: value });
  }

  isManageableEndpoint(api: Endpoint): boolean {
    return isManageableEndpointType(api.type);
  }

  onOpenAddApiDialog(): void {
    this.addApiForm.set({ endpointName: '', type: 'LOCAL_SERVER', endpoint: '', apiKey: '' });
    const ref = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('TENANT.ADD_API_MODAL_TITLE'),
        content: this.addApiTemplate,
        confirmText: this.translate.instant('TENANT.CREATE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        showCancel: true,
        showConfirm: true,
        buttonAlign: 'right',
        showDivider: true,
        confirmMinWidth: 'min-w-[98px]',
        confirmDisabledSignal: this.addApiConfirmDisabled,
        confirmLoadingSignal: this.tenantApi.isCreatingEndpoint,
        confirmAction: () => {
          this.tenantApi.createEndpoint(this.addApiForm()).then(() => ref.close(true));
        },
      } as DialogData,
      autoFocus: false,
      width: '800px',
      maxWidth: '90vw',
    });
  }

  onOpenEditApiDialog(api: Endpoint): void {
    if (!this.isManageableEndpoint(api)) return;

    this.editApiForm.set({
      endpointName: api.endpointName,
      type: api.type,
      endpoint: api.endpoint,
      apiKey: api.apiKey,
    });
    const ref = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('TENANT.EDIT_API_SETTING'),
        content: this.editApiTemplate,
        confirmText: this.translate.instant('COMMON.SAVE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        showCancel: true,
        showConfirm: true,
        confirmMinWidth: 'min-w-[98px]',
        buttonAlign: 'right',
        showDivider: true,
        confirmDisabledSignal: this.editApiConfirmDisabled,
        confirmLoadingSignal: this.tenantApi.isUpdatingEndpoint,
        confirmAction: () => {
          this.tenantApi.updateEndpoint(api.id, this.editApiForm()).then(() => ref.close(true));
        },
      } as DialogData,
      autoFocus: false,
      width: '800px',
      maxWidth: '90vw',
    });
  }

  onOpenDeleteApiDialog(api: Endpoint): void {
    if (!this.isManageableEndpoint(api)) return;

    const ref = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('TENANT.DELETE_API_TITLE'),
        message: this.translate.instant('TENANT.DELETE_API_MESSAGE'),
        confirmText: this.translate.instant('COMMON.DELETE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        showCancel: true,
        showConfirm: true,
        confirmVariant: 'danger',
        confirmDanger: true,
        confirmIcon: 'delete',
        buttonAlign: 'center',
        confirmDisabledSignal: signal(false),
        confirmLoadingSignal: this.tenantApi.isDeletingEndpoint,
        confirmAction: () => {
          this.tenantApi.deleteEndpoint(api.id).then(() => ref.close(true));
        },
      } as DialogData,
      width: '800px',
      maxWidth: '90vw',
    });
  }
}
