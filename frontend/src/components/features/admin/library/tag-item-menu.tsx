import { useTranslation } from 'react-i18next';
import { ContextMenu } from '@/components/shared/context-menu';
import { AppMatIcon } from '@/components/shared/icons/app-mat-icon';
import type { TagItem } from '@/types/admin/library.types';

interface TagItemMenuProps {
  item: TagItem;
  onEditSettings: (item: TagItem) => void;
  onDeleteItem: (item: TagItem) => void;
}

/** 移植元 `<app-tag-item-menu>`。タグ一覧の行の操作メニュー */
export function TagItemMenu({ item, onEditSettings, onDeleteItem }: TagItemMenuProps) {
  const { t } = useTranslation();

  return (
    <ContextMenu
      hasPaddingButton={false}
      triggerTestid={`tag-menu-${item.id}`}
      menu={
        <>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-bg-brand-weak transition-colors w-full text-left"
              onClick={(event) => {
                event.stopPropagation();
                onEditSettings(item);
              }}
            >
              <AppMatIcon
                icon="border_color"
                className="text-[20px]! leading-none text-text-strong shrink-0"
              />
              <span className="text-label text-text-strong truncate">
                {t('ADMIN.LIBRARY.TAGS.MENU.EDIT_SETTINGS')}
              </span>
            </button>
          </div>

          <hr className="border-border-weak my-1 mx-3" />

          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-bg-error transition-colors w-full text-left"
              onClick={(event) => {
                event.stopPropagation();
                onDeleteItem(item);
              }}
            >
              <AppMatIcon
                icon="delete"
                className="text-[20px]! leading-none text-status-error shrink-0"
              />
              <span className="text-label text-status-error truncate">
                {t('ADMIN.LIBRARY.TAGS.MENU.DELETE')}
              </span>
            </button>
          </div>
        </>
      }
    />
  );
}
