import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ComboboxMulti } from '@/components/shared/combobox-multi';
import { Dialog } from '@/components/shared/dialog';
import { FormInput } from '@/components/shared/form-input';
import { OptionalLabel } from '@/components/shared/optional-label';
import { useLibraryMetadataSave } from '@/hooks/use-library-metadata';
import { useLibraryTagOptions } from '@/hooks/use-library-list';
import { useTeamsStore } from '@/store/teams-store';

interface ChatSaveLibraryDialogProps {
  libraryId: string;
  /** 名前の初期値（表示中のライブラリのタイトル） */
  initialName: string;
  /** 保存に成功したとき。保存した名前を渡す */
  onSaved: (name: string) => void;
  /** 閉じるとき（キャンセル・保存成功の両方） */
  onClose: () => void;
}

/** 移植元 `ChatSaveLibraryDialogComponent` と、`ChatSummaryComponent.onSaveToLibrary` のダイアログ設定 */
export function ChatSaveLibraryDialog({
  libraryId,
  initialName,
  onSaved,
  onClose,
}: ChatSaveLibraryDialogProps) {
  const { t } = useTranslation();
  const teams = useTeamsStore((s) => s.teams);
  const { data: tags } = useLibraryTagOptions();
  const { saveLibraryMetadata, isSaving } = useLibraryMetadataSave();
  const [contentName, setContentName] = useState(initialName);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

  useEffect(() => {
    void useTeamsStore.getState().loadTeams();
  }, []);

  const tagOptions = useMemo(
    () => (tags ?? []).map((tag) => ({ label: tag.name, value: tag.id })),
    [tags],
  );
  const teamOptions = useMemo(
    () => teams.map((team) => ({ label: team.name, value: team.id })),
    [teams],
  );

  const handleSave = () => {
    const name = contentName.trim();
    void saveLibraryMetadata(libraryId, {
      name,
      tags: selectedTagIds,
      groups: selectedTeamIds,
    }).then((result) => {
      if (!result) return;
      onSaved(name);
      onClose();
    });
  };

  return (
    <Dialog
      open
      title={t('CHAT.VIEWER.SAVE_LIBRARY_DIALOG.TITLE')}
      showClose={false}
      showCancel
      showConfirm
      buttonAlign="right"
      cancelText={t('COMMON.CANCEL')}
      confirmText={t('CHAT.VIEWER.SAVE_LIBRARY_DIALOG.SAVE')}
      confirmLoading={isSaving}
      confirmDisabled={contentName.trim().length === 0}
      dialogWidth="800px"
      panelClass="dialog-overflow-visible"
      autoFocus={false}
      onCancel={onClose}
      onConfirm={handleSave}
      onClose={onClose}
    >
      <div className="flex flex-col gap-6">
        <FormInput
          label={t('CHAT.VIEWER.SAVE_LIBRARY_DIALOG.CONTENT_NAME_LABEL')}
          supportText={t('CHAT.VIEWER.SAVE_LIBRARY_DIALOG.CONTENT_NAME_SUPPORT')}
          value={contentName}
          onValueChange={setContentName}
          dataTestid="library-content-name-input"
        />

        <fieldset className="flex flex-col gap-3">
          <div className="fieldset-head">
            <label className="fieldset-title" htmlFor="tags-multi-select">
              {t('CHAT.VIEWER.SAVE_LIBRARY_DIALOG.TAGS_LABEL')}
              <OptionalLabel />
            </label>
            <p className="text-xs text-text-muted">{t('CHAT.VIEWER.SAVE_LIBRARY_DIALOG.TAGS_SUPPORT')}</p>
          </div>
          <ComboboxMulti
            id="tags-multi-select"
            name="tags-multi-select"
            options={tagOptions}
            placeholder={t('CHAT.VIEWER.SAVE_LIBRARY_DIALOG.TAGS_PLACEHOLDER')}
            value={selectedTagIds}
            onValueChange={setSelectedTagIds}
            panelSize="full"
          />
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <div className="fieldset-head">
            <label className="fieldset-title" htmlFor="team-multi-select">
              {t('CHAT.VIEWER.SAVE_LIBRARY_DIALOG.TEAM_LABEL')}
            </label>
            <p className="text-xs text-text-muted">{t('CHAT.VIEWER.SAVE_LIBRARY_DIALOG.TEAM_SUPPORT')}</p>
          </div>
          <ComboboxMulti
            id="team-multi-select"
            name="team-multi-select"
            options={teamOptions}
            placeholder={t('CHAT.VIEWER.SAVE_LIBRARY_DIALOG.TEAM_PLACEHOLDER')}
            value={selectedTeamIds}
            onValueChange={setSelectedTeamIds}
            panelSize="full"
            searchHint={t('COMMON.LABELS.SEARCH_HINT')}
          />
        </fieldset>
      </div>
    </Dialog>
  );
}
