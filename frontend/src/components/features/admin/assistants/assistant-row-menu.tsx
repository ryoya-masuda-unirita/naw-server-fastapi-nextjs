import { useTranslation } from 'react-i18next';
import { ContextMenu } from '@/components/shared/context-menu';
import { AppMatIcon } from '@/components/shared/icons/app-mat-icon';

interface AssistantRowMenuProps {
  /** 編集項目の文言（i18n キー） */
  editLabelKey: string;
  testid: string;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * 移植元 `<app-assistant-tab-menu>`・`<app-category-tab-menu>`（2 つは編集項目の文言以外同じ）。
 * 行末の「編集・削除」メニュー。
 */
export function AssistantRowMenu({ editLabelKey, testid, onEdit, onDelete }: AssistantRowMenuProps) {
  const { t } = useTranslation();

  return (
    <ContextMenu
      triggerTestid={testid}
      menu={({ close }) => (
        <>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="flex items-center gap-2 h-9 px-2 py-1 rounded-lg hover:bg-bg-secondary transition-colors w-full text-left"
              onClick={() => {
                onEdit();
                close();
              }}
            >
              <AppMatIcon icon="border_color" className="text-text-strong shrink-0 text-[20px]!" />
              <span className="text-label text-text-strong truncate">{t(editLabelKey)}</span>
            </button>
          </div>

          <hr className="border-border-weak" />

          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="flex items-center gap-2 h-9 px-2 py-1 rounded-lg hover:bg-bg-error transition-colors w-full text-left"
              onClick={() => {
                onDelete();
                close();
              }}
            >
              <AppMatIcon icon="delete" className="text-status-error shrink-0 text-[20px]!" />
              <span className="text-label text-status-error truncate">{t('COMMON.DELETE')}</span>
            </button>
          </div>
        </>
      )}
    />
  );
}
