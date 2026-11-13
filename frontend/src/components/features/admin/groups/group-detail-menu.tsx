import { useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { dropdownService } from '@/components/shared/dropdown-service';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { cx } from '@/components/shared/class-names';

/** 移植元 `GroupDetailComponent.MENU_WIDTH`・`MENU_GAP` */
const MENU_WIDTH = 288;
const MENU_GAP = 4;

interface GroupDetailMenuProps {
  /** グループ管理者だけのユーザーには「チームを削除」を出さない（移植元 `authStore.isGroupAdminOnly()`） */
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

/** 移植元 `GroupDetailComponent` のヘッダー右上の編集アイコンと、開くメニュー（チームの編集・削除） */
export function GroupDetailMenu({ canDelete, onEdit, onDelete }: GroupDetailMenuProps) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: '0px', left: '0px' });

  const toggle = (event: React.MouseEvent) => {
    // document の click で dropdownService が即座に閉じないようにする
    event.stopPropagation();
    if (isOpen) {
      setIsOpen(false);
      dropdownService.notifyClosed();
      return;
    }

    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      // 右端からはみ出さないよう、メニューの幅の分だけ左へ寄せる
      const maxLeft = window.innerWidth - MENU_WIDTH - MENU_GAP;
      const left = rect.left > maxLeft ? Math.max(MENU_GAP, maxLeft) : rect.left;
      setPosition({ top: `${rect.bottom + MENU_GAP}px`, left: `${left}px` });
    }
    setIsOpen(true);
    dropdownService.open(() => setIsOpen(false));
  };

  const run = (action: () => void) => {
    setIsOpen(false);
    dropdownService.notifyClosed();
    action();
  };

  const menuStyle: CSSProperties = { top: position.top, left: position.left, width: MENU_WIDTH };

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 text-text-lighter transition-colors"
        title={t('GROUPS.SETTINGS')}
        aria-haspopup="true"
        aria-expanded={isOpen}
        data-testid="admin-groups-detail-menu-button"
        onClick={toggle}
      >
        <SvgIcon name="edit" className="w-5 h-5" />
      </button>
      <div
        className={cx(
          'dropdown-menu dropdown-menu--bordered flex flex-col p-4 gap-1 min-w-72 animate-fade-in',
          isOpen && 'is-open',
        )}
        role="menu"
        hidden={!isOpen}
        style={menuStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="dropdown-item dl-option w-full"
          role="menuitem"
          data-testid="admin-groups-edit-name-button"
          onClick={() => run(onEdit)}
        >
          <span className="inline-flex w-5 h-5 shrink-0 items-center justify-center">
            <SvgIcon name="edit" className="w-5 h-5" />
          </span>
          {t('GROUPS.EDIT_TEAM_TITLE')}
        </button>
        {canDelete && (
          <>
            <div className="my-1 dropdown-divider" />
            <button
              type="button"
              className="dropdown-item dropdown-item--danger w-full px-4"
              role="menuitem"
              data-testid="admin-groups-delete-button"
              onClick={() => run(onDelete)}
            >
              <span className="dropdown-item-icon">
                <SvgIcon className="w-5 h-5" name="delete" />
              </span>
              {t('GROUPS.DELETE_GROUP')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
