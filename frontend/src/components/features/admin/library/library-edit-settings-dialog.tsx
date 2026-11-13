import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/shared/button';
import { Dialog } from '@/components/shared/dialog';
import { FormInput } from '@/components/shared/form-input';
import { AppMatIcon } from '@/components/shared/icons/app-mat-icon';
import { MultiSelect } from '@/components/shared/multi-select';
import { useToastStore } from '@/components/shared/toast-store';
import type { SelectOption } from '@/components/shared/types';
import { useLibraryGroupOptions, useUpdateLibrary } from '@/hooks/use-library-list';
import { ROUTES } from '@/lib/constants/routes';
import type { LibraryPageItem, LibraryTagRef } from '@/types/admin/library.types';
import { COPIED_RESET_MS, copyText } from './library-format';

const DIALOG_WIDTH = '800px';

interface LibraryEditSettingsDialogProps {
  item: LibraryPageItem;
  /** コンテンツタブで取得済みのタグの選択肢（再取得しない） */
  tagOptions: LibraryTagRef[];
  onClose: () => void;
}

/**
 * 移植元の「コンテンツの設定を編集」ダイアログ（`LibraryEditSettingsDialogComponent` を入れた DialogComponent）。
 * 開くたびに作り直す前提で、親は開いている間だけ描画する。
 */
export function LibraryEditSettingsDialog({
  item,
  tagOptions,
  onClose,
}: LibraryEditSettingsDialogProps) {
  const { t } = useTranslation();
  const toast = useToastStore();
  const updateMutation = useUpdateLibrary();
  // 共有先グループは編集ダイアログを開いたときに初めて取得する（移植元 `loadGroupOptions`）
  const groupsQuery = useLibraryGroupOptions(true);

  const [name, setName] = useState(item.title);
  const [selectedTags, setSelectedTags] = useState(() => item.tags.map((tag) => tag.id));
  const [selectedTeams, setSelectedTeams] = useState(() => item.sharedGroups.map((g) => g.id));
  // ヘッダー右（デスクトップ）とフォーム内（モバイル）のコピーボタンは、移植元でも別々に「コピー済み」を持つ
  const [headerLinkCopied, setHeaderLinkCopied] = useState(false);
  const [bodyLinkCopied, setBodyLinkCopied] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const tagSelectOptions = useMemo<SelectOption[]>(
    () => tagOptions.map((tag) => ({ value: tag.id, label: tag.name })),
    [tagOptions],
  );
  const teamSelectOptions = useMemo<SelectOption[]>(
    () => (groupsQuery.data ?? []).map((group) => ({ value: group.id, label: group.name })),
    [groupsQuery.data],
  );

  const copyLink = (setCopied: (copied: boolean) => void) => {
    copyText(`${window.location.origin}${ROUTES.APP.LIBRARY_DETAIL(item.id)}`);
    setCopied(true);
    timers.current.push(setTimeout(() => setCopied(false), COPIED_RESET_MS));
  };

  const save = async () => {
    if (updateMutation.isPending) return;
    try {
      await updateMutation.mutateAsync({
        id: item.id,
        payload: { name, tags: selectedTags, groups: selectedTeams },
      });
      onClose();
    } catch {
      // 共通のエラートーストは skipGlobalErrorToast で止めているので、画面側で出す（移植元と同じ）
      toast.error(t('ADMIN.LIBRARY.UPDATE_FAILED'));
    }
  };

  return (
    <Dialog
      open
      title={t('ADMIN.LIBRARY.EDIT_SETTINGS.TITLE')}
      showDefaultActions={false}
      buttonAlign="right"
      dialogWidth={DIALOG_WIDTH}
      headerTrailing={
        <button type="button" className="copy-link-btn hidden md:flex" onClick={() => copyLink(setHeaderLinkCopied)}>
          <AppMatIcon icon={headerLinkCopied ? 'check' : 'link'} className="text-xl! leading-none" />
          <span className="text-label-large">{t('ADMIN.LIBRARY.MENU.COPY_LINK')}</span>
        </button>
      }
      customActions={
        <div className="flex gap-3 justify-end max-sm:justify-center">
          <Button
            variant="outline"
            size="lg"
            className="dialog-cancel-btn flex-1"
            fullWidth
            onClick={onClose}
          >
            {t('ADMIN.LIBRARY.EDIT_SETTINGS.CANCEL')}
          </Button>
          <Button variant="solid" size="lg" className="flex-1" fullWidth onClick={() => void save()}>
            {t('ADMIN.LIBRARY.EDIT_SETTINGS.SAVE')}
          </Button>
        </div>
      }
      onClose={onClose}
    >
      <div className="flex flex-col gap-4 md:gap-6">
        <button
          type="button"
          className="copy-link-btn relative -top-2 mt-0 md:hidden"
          onClick={() => copyLink(setBodyLinkCopied)}
        >
          <AppMatIcon icon={bodyLinkCopied ? 'check' : 'link'} className="text-xl! leading-none" />
          <span className="text-label-large">{t('ADMIN.LIBRARY.MENU.COPY_LINK')}</span>
        </button>

        <FormInput
          label={t('ADMIN.LIBRARY.EDIT_SETTINGS.NAME_LABEL')}
          supportText={t('ADMIN.LIBRARY.EDIT_SETTINGS.NAME_SUPPORT')}
          value={name}
          onValueChange={setName}
        />

        <div className="flex flex-col gap-3">
          <div className="fieldset-head">
            <p className="fieldset-title">
              {t('ADMIN.LIBRARY.EDIT_SETTINGS.TAGS_LABEL')}
              <span className="fieldset-any">{t('ADMIN.LIBRARY.EDIT_SETTINGS.OPTIONAL')}</span>
            </p>
            <p className="fieldset-support-text">{t('ADMIN.LIBRARY.EDIT_SETTINGS.TAGS_SUPPORT')}</p>
          </div>
          <MultiSelect
            options={tagSelectOptions}
            value={selectedTags}
            onValueChange={setSelectedTags}
            placeholder={t('ADMIN.LIBRARY.EDIT_SETTINGS.TAGS_PLACEHOLDER')}
          />
        </div>

        <div className="flex flex-col gap-3">
          <div className="fieldset-head">
            <p className="fieldset-title">{t('ADMIN.LIBRARY.EDIT_SETTINGS.TEAMS_LABEL')}</p>
            <p className="fieldset-support-text">{t('ADMIN.LIBRARY.EDIT_SETTINGS.TEAMS_SUPPORT')}</p>
          </div>
          <MultiSelect
            options={teamSelectOptions}
            value={selectedTeams}
            onValueChange={setSelectedTeams}
            placeholder={t('ADMIN.LIBRARY.EDIT_SETTINGS.TEAMS_PLACEHOLDER')}
          />
        </div>
      </div>
    </Dialog>
  );
}
