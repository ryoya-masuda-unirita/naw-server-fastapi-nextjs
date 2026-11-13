import { useTranslation } from 'react-i18next';
import { Button } from '@/components/shared/button';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import type { TrainingDataFile } from '@/types/training-data.types';

interface TrainingDataActionBarProps {
  selectedFiles: TrainingDataFile[];
  isRenamingMode: boolean;
  showSync?: boolean;
  onSync?: () => void;
  onAddData: () => void;
  onAddDataSp: () => void;
  onDeselectAll: () => void;
  onDeleteSelected: () => void;
  onEditName: () => void;
  onSaveRename: () => void;
}

/**
 * 移植元 `<app-training-data-action-bar>`。ファイルの選択状況で、追加／名前変更／選択中の操作に切り替わる。
 * モバイルでは画面の下に固定する（`.sp-fixed-btn`）。
 */
export function TrainingDataActionBar({
  selectedFiles,
  isRenamingMode,
  showSync = false,
  onSync,
  onAddData,
  onAddDataSp,
  onDeselectAll,
  onDeleteSelected,
  onEditName,
  onSaveRename,
}: TrainingDataActionBarProps) {
  const { t } = useTranslation();

  return (
    <div className="sp-fixed-btn">
      {selectedFiles.length === 0 ? (
        <div data-learning-create-wrap>
          <div className="flex flex-col-reverse md:flex-row gap-3">
            {showSync && (
              <Button
                variant="outline"
                size="lg"
                fullWidth
                className="w-full md:w-auto"
                dataTestid="training-data-sync-button"
                onClick={onSync}
              >
                <SvgIcon name="sync" className="icon-20" />
                <span>{t('LEARNING_DATA.BULK_SYNC')}</span>
              </Button>
            )}

            <Button
              variant="solid"
              size="lg"
              fullWidth
              className="w-full md:hidden z-1"
              dataTestid="training-data-add-button-sp"
              onClick={onAddDataSp}
            >
              <SvgIcon name="addCircle" className="icon-20" />
              <span>{t('LEARNING_DATA.ADD_TRAINING_DATA')}</span>
            </Button>

            <Button
              variant="solid"
              size="lg"
              className="hidden! md:flex! md:w-auto"
              dataTestid="training-data-add-button"
              onClick={onAddData}
            >
              <SvgIcon name="addCircle" className="icon-20" />
              <span>{t('LEARNING_DATA.ADD_TRAINING_DATA')}</span>
            </Button>
          </div>
        </div>
      ) : isRenamingMode ? (
        <div data-namechange-actions>
          <div className="flex flex-col-reverse md:flex-row gap-3">
            <Button
              variant="outline"
              intent="cancel"
              size="lg"
              fullWidth
              className="w-full md:w-auto"
              dataTestid="training-data-deselect-button"
              onClick={onDeselectAll}
            >
              <span>{t('COMMON.DESELECT')}</span>
            </Button>
            <Button
              variant="solid"
              size="lg"
              fullWidth
              className="w-full md:w-auto"
              dataTestid="training-data-save-rename-button"
              onClick={onSaveRename}
            >
              <SvgIcon name="edit" className="icon-20" />
              <span>{t('COMMON.EDIT_NAME')}</span>
            </Button>
          </div>
        </div>
      ) : (
        <div data-learning-selection-actions>
          <div className="flex flex-col-reverse md:flex-row gap-3">
            <Button
              variant="outline"
              intent="cancel"
              size="lg"
              fullWidth
              className="w-full md:w-auto"
              dataTestid="training-data-deselect-button"
              onClick={onDeselectAll}
            >
              <span>{t('COMMON.DESELECT')}</span>
            </Button>

            <Button
              variant="outline"
              intent="delete"
              size="lg"
              fullWidth
              className="w-full md:w-auto"
              dataTestid="training-data-delete-selected-button"
              onClick={onDeleteSelected}
            >
              <SvgIcon name="delete" className="icon-20" />
              <span>{t('COMMON.DELETE')}</span>
            </Button>

            <Button
              variant="outline"
              size="lg"
              disabled={selectedFiles.length === 0}
              fullWidth
              className="w-full md:w-auto"
              dataTestid="training-data-edit-name-button"
              onClick={onEditName}
            >
              <SvgIcon name="edit" className="icon-20" />
              <span>{t('COMMON.EDIT_NAME')}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
