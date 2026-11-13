import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/shared/button';
import { CircularLoading } from '@/components/shared/circular-loading';
import { ContextMenu } from '@/components/shared/context-menu';
import { Dialog } from '@/components/shared/dialog';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { TableList, TableListItem } from '@/components/shared/table-list';
import { useDeleteEndpoint, useEndpoints, useTenantInfo } from '@/hooks/use-tenant';
import type { Endpoint } from '@/types/admin/tenant.types';
import { AddApiDialog } from './add-api-dialog';
import { isManageableEndpointType } from './tenant.constants';

/** ダイアログの幅（移植元 `width: '800px', maxWidth: '90vw'`） */
const DIALOG_WIDTH = 'min(800px, 90vw)';

/** 移植元 `<app-api-tab>`。設定済みの API 接続先の一覧と、追加・編集・削除 */
export function ApiTab() {
  const { t } = useTranslation();
  const { data: tenant } = useTenantInfo();
  const { data, isFetching } = useEndpoints(tenant?.tenantId);
  const { deleteEndpoint, isPending: isDeleting } = useDeleteEndpoint();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Endpoint | null>(null);
  const [deleting, setDeleting] = useState<Endpoint | null>(null);

  const apiConfigs = data ?? [];

  const handleDeleteConfirm = async () => {
    if (!deleting) return;
    try {
      await deleteEndpoint(deleting.id);
      setDeleting(null);
    } catch {
      // 失敗のトーストは hook が出している。ダイアログは開いたままにする（移植元と同じ）
    }
  };

  return (
    <>
      {/* モバイルでは下に固定、PC ではその場に出す */}
      <div className="sp-fixed-btn">
        <div>
          <Button
            variant="solid"
            size="lg"
            className="w-full md:w-auto"
            classProps="w-full"
            dataTestid="tenant-add-api-button"
            onClick={() => setAdding(true)}
          >
            <SvgIcon name="addCircle" className="w-5 h-5" />
            {t('TENANT.ADD_API')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <p className="text-h2">{t('TENANT.CONFIGURED_API')}</p>
        </div>

        <TableList>
          {(isFetching || apiConfigs.length > 0) && (
            <TableListItem
              isHeader
              hasActions
              showCheckbox={false}
              actions={<span className="hidden md:inline-block w-9 h-9 invisible" aria-hidden="true" />}
            >
              <span className="table-list-col-content table-list-label md:min-w-30">{t('TENANT.API_COL_NAME')}</span>
              <span className="table-list-col-date table-list-label md:w-83.5">{t('TENANT.API_COL_PORT')}</span>
              <span className="table-list-col-date table-list-label md:w-84">{t('TENANT.API_COL_URL')}</span>
              <span className="table-list-col-date table-list-label md:w-20">{t('TENANT.API_COL_KEY')}</span>
            </TableListItem>
          )}

          <div className="relative min-h-105 md:min-h-52.5">
            {isFetching ? (
              <div className="absolute inset-0 flex items-center justify-center" data-testid="tenant-api-loading">
                <CircularLoading />
              </div>
            ) : (
              <>
                {apiConfigs.map((api) => (
                  <TableListItem
                    key={api.id}
                    showCheckbox={false}
                    hasActions
                    dataTestid="tenant-api-row"
                    actions={
                      <div>
                        {isManageableEndpointType(api.type) ? (
                          <ContextMenu
                            triggerTestid="tenant-api-row-menu-button"
                            panelClass="dropdown-menu dropdown-menu--bordered w-[280px]"
                            menu={({ close }) => (
                              <>
                                <div className="flex flex-col gap-1">
                                  <button
                                    type="button"
                                    data-testid="tenant-api-edit-button"
                                    className="flex items-center gap-2 h-9 px-2 py-1 rounded-lg hover:bg-bg-secondary transition-colors w-full text-left"
                                    onClick={() => {
                                      setEditing(api);
                                      close();
                                    }}
                                  >
                                    <SvgIcon name="edit" className="w-5 h-5 text-text-strong shrink-0" />
                                    <span className="text-label text-text-strong truncate">
                                      {t('TENANT.EDIT_API_SETTING')}
                                    </span>
                                  </button>
                                </div>
                                <hr className="border-border-weak my-1" />
                                <div className="flex flex-col gap-1">
                                  <button
                                    type="button"
                                    data-testid="tenant-api-delete-button"
                                    className="flex items-center gap-2 h-9 px-2 py-1 rounded-lg hover:bg-bg-error transition-colors w-full text-left"
                                    onClick={() => {
                                      setDeleting(api);
                                      close();
                                    }}
                                  >
                                    <SvgIcon name="delete" className="w-5 h-5 text-status-error shrink-0" />
                                    <span className="text-label text-status-error truncate">{t('TENANT.DELETE_API')}</span>
                                  </button>
                                </div>
                              </>
                            )}
                          />
                        ) : (
                          <button
                            type="button"
                            className="flex items-center justify-center p-1 md:p-2! rounded-full cursor-not-allowed opacity-40"
                            disabled
                            aria-label={t('TENANT.EDIT_API_SETTING')}
                          >
                            <SvgIcon name="settings" className="w-5 h-5 text-text-lighter" />
                          </button>
                        )}
                      </div>
                    }
                  >
                    <div className="table-list-col-content table-list-start-label md:min-w-30">
                      <p className="table-list-title text-label-large md:text-label-x-large">{api.endpointName}</p>
                    </div>
                    <div className="table-list-row-date md:w-83.5">
                      <span className="table-list-label md:hidden w-30">{t('TENANT.API_COL_PORT')}</span>
                      <span className="table-list-date flex-1 w-30 md:w-auto text-body-small font-normal md:text-body text-text-strong">
                        {api.type}
                      </span>
                    </div>
                    <div className="table-list-row-date md:w-84">
                      <span className="table-list-label md:hidden w-30">{t('TENANT.API_COL_URL')}</span>
                      <span className="table-list-date flex-1 truncate">{api.endpoint}</span>
                    </div>
                    <div className="table-list-row-date md:w-20">
                      <span className="table-list-label md:hidden w-30">{t('TENANT.API_COL_KEY')}</span>
                      <span className="table-list-date flex-1">*****</span>
                    </div>
                  </TableListItem>
                ))}

                {apiConfigs.length === 0 && (
                  <div className="flex items-center justify-center h-full min-h-105 md:min-h-52.5 text-text-muted">
                    {t('TENANT.NO_DATA')}
                  </div>
                )}
              </>
            )}
          </div>
        </TableList>
      </div>

      {adding && <AddApiDialog onClose={() => setAdding(false)} />}

      {editing && (
        <AddApiDialog
          edit={{
            id: editing.id,
            values: {
              endpointName: editing.endpointName,
              type: editing.type,
              endpoint: editing.endpoint,
              // backend は API キーを返さない（移植元 server も同じ）ため空になり、保存するには「生成」し直す
              apiKey: editing.apiKey ?? '',
            },
          }}
          onClose={() => setEditing(null)}
        />
      )}

      <Dialog
        open={deleting !== null}
        title={t('TENANT.DELETE_API_TITLE')}
        message={t('TENANT.DELETE_API_MESSAGE')}
        confirmText={t('COMMON.DELETE')}
        cancelText={t('COMMON.CANCEL')}
        confirmIcon="delete"
        showCancel
        showConfirm
        confirmDanger
        buttonAlign="center"
        confirmLoading={isDeleting}
        dialogWidth={DIALOG_WIDTH}
        onConfirm={() => void handleDeleteConfirm()}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
