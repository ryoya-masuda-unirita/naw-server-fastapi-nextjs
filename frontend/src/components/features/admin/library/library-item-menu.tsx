import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ContextMenu } from '@/components/shared/context-menu';
import { AppMatIcon } from '@/components/shared/icons/app-mat-icon';
import type { LibraryPageItem } from '@/types/admin/library.types';
import { COPIED_RESET_MS } from './library-format';

interface LibraryItemMenuProps {
  item: LibraryPageItem;
  /** 自分が作成したライブラリだけ編集・削除を出す（非所有者は更新・削除 API が 404 になるため） */
  isOwner?: boolean;
  onEditSettings: (item: LibraryPageItem) => void;
  onCopyLink: (item: LibraryPageItem) => void;
  onDeleteItem: (item: LibraryPageItem) => void;
}

/** 移植元 `<app-library-item-menu>`。一覧の行の操作メニュー */
export function LibraryItemMenu({
  item,
  isOwner = true,
  onEditSettings,
  onCopyLink,
  onDeleteItem,
}: LibraryItemMenuProps) {
  const { t } = useTranslation();
  const [linkCopied, setLinkCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleCopyLink = () => {
    onCopyLink(item);
    setLinkCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setLinkCopied(false), COPIED_RESET_MS);
  };

  return (
    <ContextMenu
      triggerTestid={`library-menu-${item.id}`}
      menu={
        <>
          <div className="flex flex-col gap-1">
            {isOwner && (
              <button
                type="button"
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-bg-brand-weak transition-colors w-full text-left"
                onClick={(event) => {
                  event.stopPropagation();
                  onEditSettings(item);
                }}
              >
                <AppMatIcon icon="border_color" className="text-[20px]! leading-none text-text-strong shrink-0" />
                <span className="text-label text-text-strong truncate">
                  {t('ADMIN.LIBRARY.MENU.EDIT_SETTINGS')}
                </span>
              </button>
            )}

            <button
              type="button"
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-bg-brand-weak transition-colors w-full text-left"
              onClick={(event) => {
                event.stopPropagation();
                handleCopyLink();
              }}
            >
              <AppMatIcon
                icon={linkCopied ? 'check' : 'link'}
                className="text-[20px]! leading-none text-text-strong shrink-0"
              />
              <span className="text-label text-text-strong truncate">
                {t('ADMIN.LIBRARY.MENU.COPY_LINK')}
              </span>
            </button>
          </div>

          {isOwner && (
            <>
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
                  <AppMatIcon icon="delete" className="text-[20px]! leading-none text-status-error shrink-0" />
                  <span className="text-label text-status-error truncate">
                    {t('ADMIN.LIBRARY.MENU.DELETE')}
                  </span>
                </button>
              </div>
            </>
          )}
        </>
      }
    />
  );
}
