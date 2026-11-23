import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/shared/dialog';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { SelectWithSearch } from '@/components/shared/select-with-search';
import type { SelectOption } from '@/components/shared/types';
import { useLearningFolders } from '@/hooks/use-feedback';

/** ダイアログの幅（移植元 `width: '800px', maxWidth: '90vw'`） */
const DIALOG_WIDTH = 'min(800px, 90vw)';

interface FolderModalProps {
  /** 開いた行の学習先フォルダ ID（なければ未選択） */
  initialFolderId: string | null;
  /** 追加学習の登録中か（確認ボタンのスピナー） */
  isAdding: boolean;
  /** 「追加学習」を押したとき。選んだフォルダ ID を渡す */
  onConfirm: (folderId: string) => void;
  onClose: () => void;
}

/**
 * 移植元 `FolderModalComponent` を入れた `DialogComponent`。学習先フォルダを選んで追加学習する。
 * 親は開いている間だけ描画する（開くたびに選択を行の値へ戻す移植元の挙動に相当）。
 */
export function FolderModal({ initialFolderId, isAdding, onConfirm, onClose }: FolderModalProps) {
  const { t } = useTranslation();
  const foldersQuery = useLearningFolders();
  const [selectedFolder, setSelectedFolder] = useState<string | null>(initialFolderId);

  const folderOptions = useMemo<SelectOption[]>(
    () =>
      (foldersQuery.data ?? []).map((folder) => ({
        value: folder.id,
        label: folder.name,
        description: folder.description,
        category: folder.category,
      })),
    [foldersQuery.data],
  );

  return (
    <Dialog
      open
      title={t('FEEDBACK.SPECIFY_FOLDER')}
      cancelText={t('COMMON.CANCEL')}
      confirmText={t('FEEDBACK.ADD_LEARNING')}
      showCancel
      showConfirm
      buttonAlign="right"
      dialogWidth={DIALOG_WIDTH}
      confirmDisabled={!selectedFolder}
      confirmLoading={isAdding}
      onConfirm={() => {
        if (selectedFolder) onConfirm(selectedFolder);
      }}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="flex flex-col gap-2 p-4 rounded-xl bg-bg-secondary md:gap-2 md:p-6">
          <div className="flex gap-1 items-start md:gap-2">
            <span className="shrink-0" aria-hidden="true">
              <SvgIcon name="lightbulb" className="w-5 h-5 text-brand-primary" />
            </span>
            <p className="flex-1 min-w-0 text-label-large md:text-label-x-large">
              {t('FEEDBACK.ACCURACY_DESCRIPTION')}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-label text-text-strong">
            {t('FEEDBACK.FOLDER_MODAL_FOLDER_LABEL')}
          </span>
          <SelectWithSearch
            className="w-full"
            options={folderOptions}
            value={selectedFolder}
            placeholder={t('FEEDBACK.FOLDER_MODAL_FOLDER_PLACEHOLDER')}
            supportText={t('FEEDBACK.FOLDER_MODAL_FOLDER_SUPPORT')}
            onValueChange={setSelectedFolder}
          />
        </div>
      </div>
    </Dialog>
  );
}
