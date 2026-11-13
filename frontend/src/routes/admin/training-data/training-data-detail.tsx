import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { TrainingDataFilesView } from '@/components/features/admin/training-data/training-data-files-view';
import { TrainingFolderEditDialog } from '@/components/features/admin/training-data/training-folder-edit-dialog';
import { ContextMenu } from '@/components/shared/context-menu';
import { Dialog } from '@/components/shared/dialog';
import { IconButton } from '@/components/shared/icon-button';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { Loading } from '@/components/shared/loading';
import {
  useDeleteTrainingFolder,
  useSyncTrainingFolder,
  useTrainingDataDetail,
  useUpdateTrainingFolder,
} from '@/hooks/use-training-data-detail';
import { ROUTES } from '@/lib/constants/routes';
import { useTrainingDataStore } from '@/store/training-data-store';
import { useUiStore } from '@/store/ui-store';

/** 移植元 `dialog.open` の `width: '800px', maxWidth: '90vw'` */
const DELETE_DIALOG_WIDTH = 'min(800px, 90vw)';

/** 移植元 `TrainingDataDetailComponent`（training-data-detail）。学習先フォルダの詳細（学習データ＝ファイルの一覧） */
export function TrainingDataDetailPage() {
  const { id = '' } = useParams();
  // 別のフォルダへ切り替わったとき、編集中の状態や選択を引き継がない
  return <TrainingDataDetail key={id} id={id} />;
}

function TrainingDataDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toggleMobileSidebar = useUiStore((state) => state.toggleMobileSidebar);
  const resetFilesFilter = useTrainingDataStore((state) => state.resetFilesFilter);

  const detailQuery = useTrainingDataDetail(id);
  const updateFolder = useUpdateTrainingFolder(id);
  const deleteFolder = useDeleteTrainingFolder();
  const syncFolder = useSyncTrainingFolder(id);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // ファイル一覧の条件は画面を開くたびに初期値から始める（移植元 `loadDetail`）。離れたときに捨てる
  useEffect(() => resetFilesFilter, [resetFilesFilter]);

  const item = detailQuery.data;
  // 移植元の `isLoading`。読み込み・同期・フォルダの保存・削除の間は画面全体を読み込み中にする
  const isLoading =
    detailQuery.isFetching ||
    syncFolder.isPending ||
    updateFolder.isPending ||
    deleteFolder.isPending;

  const handleDeleteClose = (result?: unknown) => {
    setIsDeleteOpen(false);
    if (!result) return;
    // 失敗の通知は api-client の共通エラートーストが出す。移植元と同じく待たずに前の画面へ戻る
    deleteFolder.mutate(id);
    navigate(-1);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col h-full">
        <header className="shrink-0 flex flex-col bg-bg-primary z-30 border-b border-border-strong sticky top-0">
          <div className="flex items-center px-2 py-2 md:px-6 md:py-3">
            <button
              type="button"
              className="header-button-default md:hidden w-7"
              title={t('HEADER.SIDEBAR_TOGGLE')}
              onClick={toggleMobileSidebar}
            >
              <SvgIcon name="panel" className="w-5 h-5" />
            </button>

            <IconButton
              variant="tertiary-gray"
              link={ROUTES.APP.ADMIN_TRAINING_DATA}
              className="ml-3 md:ml-0! md:mr-2"
              ariaLabel="戻る"
              dataTestid="training-data-detail-back"
            >
              <SvgIcon name="arrowLeft" />
            </IconButton>

            <div className="flex-1 min-w-0 flex items-center gap-1 ml-3 md:ml-0">
              <h1 className="text-h1 truncate pt-1 min-h-9" data-testid="training-data-detail-title">
                {item ? item.name : t('LEARNING_DATA.DETAIL_TITLE')}
              </h1>

              <ContextMenu
                panelClass="dropdown-menu dropdown-menu--bordered w-70"
                menuMinWidth=""
                customTrigger={
                  <IconButton
                    variant="tertiary-gray"
                    size="largePc"
                    ariaLabel="学習先フォルダ"
                    className="mb-px md:mb-0"
                    dataTestid="training-data-detail-menu-button"
                  >
                    <SvgIcon name="edit" />
                  </IconButton>
                }
                menu={({ close }) => (
                  <>
                    <button
                      type="button"
                      className="dropdown-item"
                      role="menuitem"
                      data-testid="training-data-detail-edit-folder"
                      onClick={() => {
                        if (item) setIsEditOpen(true);
                        close();
                      }}
                    >
                      <span className="dropdown-item-icon">
                        <SvgIcon name="edit" className="w-5 h-5" />
                      </span>
                      {t('LEARNING_DATA.MENU_EDIT_FOLDER')}
                    </button>
                    <hr className="dropdown-divider" />
                    <button
                      type="button"
                      className="dropdown-item dropdown-item--danger"
                      role="menuitem"
                      data-testid="training-data-detail-delete-folder"
                      onClick={() => {
                        if (item) setIsDeleteOpen(true);
                        close();
                      }}
                    >
                      <span className="dropdown-item-icon">
                        <SvgIcon name="delete" className="w-5 h-5" />
                      </span>
                      {t('LEARNING_DATA.MENU_DELETE_FOLDER')}
                    </button>
                  </>
                )}
              />
            </div>
          </div>
        </header>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center items-center h-full md:h-20 w-full">
              <Loading size="lg" />
            </div>
          ) : item ? (
            <TrainingDataFilesView data={item} onSync={() => syncFolder.mutate()} />
          ) : (
            <div className="flex justify-center items-center h-full text-text-muted w-full">
              {t('COMMON.NO_DATA')}
            </div>
          )}
        </div>
      </div>

      {isEditOpen && item && (
        <TrainingFolderEditDialog
          data={item}
          onSubmit={async (payload) => {
            await updateFolder.mutateAsync(payload);
          }}
          onClose={() => setIsEditOpen(false)}
        />
      )}

      <Dialog
        open={isDeleteOpen}
        title={t('LEARNING_DATA.DELETE_FOLDER_CONFIRM_TITLE')}
        message={t('LEARNING_DATA.DELETE_CONFIRM_MESSAGE')}
        confirmText={t('COMMON.DELETE')}
        cancelText={t('COMMON.CANCEL')}
        showCancel
        showConfirm
        buttonAlign="center"
        confirmDanger
        confirmIcon="delete"
        confirmTestid="training-data-detail-delete-confirm"
        cancelTestid="training-data-detail-delete-cancel"
        dialogWidth={DELETE_DIALOG_WIDTH}
        onClose={handleDeleteClose}
      />
    </div>
  );
}
