import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import './form-sort-input.css';
import { cx } from './class-names';
import { AppMatIcon } from './icons/app-mat-icon';
import { SvgIcon } from './icons/svg-icon';
import { useIsMobile } from './use-is-mobile';

export interface SortOption {
  value: string;
  /** i18n キー（移植元は日本語の文言をそのままキーとして渡すこともある） */
  label: string;
}

/** 移植元と同じく、モバイルのドロワーを閉じたあと 300ms（transition 時間）待ってから DOM から外す */
const DRAWER_LEAVE_MS = 300;

const DEFAULT_FIELDS: SortOption[] = [
  { label: '更新日時順', value: 'updatedAt' },
  { label: '用語順', value: 'term' },
];

const DEFAULT_ORDERS: SortOption[] = [
  { label: '昇順', value: 'asc' },
  { label: '降順', value: 'desc' },
];

interface FormSortInputProps {
  placeholder?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  /** `${prefix}-trigger` / `${prefix}-field-option` / `${prefix}-order-option` を data-testid に付ける */
  testidPrefix?: string;
  fields?: SortOption[];
  orders?: SortOption[];
  selectedField?: string | null;
  selectedOrder?: string | null;
  className?: string;
  /** 移植元の fieldChange（selectedField の更新も兼ねる） */
  onFieldChange?: (value: string | null) => void;
  /** 移植元の orderChange（selectedOrder の更新も兼ねる） */
  onOrderChange?: (value: string | null) => void;
  onClear?: () => void;
}

interface MenuPosition {
  top: number;
  left: number;
}

/**
 * 移植元 `<app-form-sort-input>`（shared/components/form/form-sort-input）。
 * 並べ替え項目と昇順/降順を選ぶ。デスクトップはトリガー下のメニュー、モバイルはボトムドロワー。
 */
export function FormSortInput({
  placeholder = '更新日時順',
  disabled = false,
  size = 'md',
  testidPrefix,
  fields = DEFAULT_FIELDS,
  orders = DEFAULT_ORDERS,
  selectedField = null,
  selectedOrder = null,
  className,
  onFieldChange,
  onOrderChange,
  onClear,
}: FormSortInputProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const triggerRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDrawerVisible, setIsDrawerVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  const activeField = fields.find((f) => f.value === selectedField);
  const activeFieldLabel = selectedField ? (activeField ? activeField.label : selectedField) : '';
  const testid = (suffix: string) => (testidPrefix ? `${testidPrefix}-${suffix}` : undefined);

  const handleSelectField = (value: string) => {
    if (selectedField !== value) {
      onFieldChange?.(value);
    }
  };

  const handleSelectOrder = (value: string) => {
    if (selectedOrder !== value) {
      onOrderChange?.(value);
    }
  };

  const handleClear = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onFieldChange?.(null);
    onOrderChange?.(null);
    onClear?.();
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
    setMenuPosition(null);
  };

  const openDrawer = () => {
    setIsDrawerVisible(true);
    // 表示してから次のフレームで開くことで、移植元と同じく下からスライドインさせる
    requestAnimationFrame(() => setIsMenuOpen(true));
  };

  const closeDrawer = () => {
    setIsMenuOpen(false);
    closeTimerRef.current = window.setTimeout(() => setIsDrawerVisible(false), DRAWER_LEAVE_MS);
  };

  const handleTriggerClick = () => {
    if (disabled) return;
    if (isMobile) {
      openDrawer();
      return;
    }
    // 移植元の mat-menu はトリガーの真下（左端揃え）に出る
    if (menuPosition) {
      closeMenu();
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPosition({ top: rect.bottom, left: rect.left });
    setIsMenuOpen(true);
  };

  return (
    <div className={cx('app-form-sort-input block relative', className)}>
      <div
        ref={triggerRef}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        aria-disabled={disabled}
        className={cx(
          'trigger-wrapper relative flex items-center w-full pl-3 pr-4 rounded-lg text-sm transition-all duration-200 overflow-hidden cursor-pointer select-none',
          size === 'md' && 'h-12',
          size === 'sm' && 'h-9',
          selectedField && !isMenuOpen && 'bg-bg-brand-weak',
          (!selectedField || isMenuOpen) && 'bg-white',
          selectedField && !isMenuOpen && 'has-value',
          isMenuOpen && 'is-open',
          disabled && 'opacity-60 cursor-not-allowed pointer-events-none',
        )}
        data-testid={testid('trigger')}
        onClick={handleTriggerClick}
        onKeyDown={(event) => {
          // mat-menu のトリガーと同じく Enter / Space で開く
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleTriggerClick();
          }
        }}
      >
        <span
          className={cx(
            'flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-medium max-w-70 md:max-w-21',
            size === 'md' && 'text-sm',
            size === 'sm' && 'text-xs',
            selectedField && 'text-text-default',
            !selectedField && 'text-text-lighter',
            selectedField && !isMenuOpen && 'text-brand-secondary!',
          )}
        >
          {selectedField ? t(activeFieldLabel) : t(placeholder)}
        </span>
        {selectedField && (
          <button type="button" className="combobox-clear right-10" onClick={handleClear}>
            <SvgIcon name="close" className="shrink-0 w-3! h-3! transition-colors! duration-200 text-text-white!" />
          </button>
        )}
        <SvgIcon
          name="newsort"
          className={cx(
            'text-[20px]! -mr-1 shrink-0 text-text-weak transition-colors duration-200 ml-auto',
            (isMenuOpen || Boolean(selectedField)) && 'text-brand-secondary!',
          )}
        />
      </div>

      {/* Desktop Menu（移植元は mat-menu。透明な背景のクリックとメニュー内のクリックで閉じる） */}
      {!isMobile && menuPosition && (
        <>
          <div className="fixed inset-0 z-1000" data-testid={testid('backdrop')} onClick={closeMenu} />
          <div
            role="menu"
            className="mat-mdc-menu-panel sort-menu fixed z-1000 bg-white! rounded-xl! border! border-border-strong! shadow-lg! min-w-50! mt-1! w-60"
            style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
            onClick={closeMenu}
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeMenu();
            }}
          >
            <div className="mat-mdc-menu-content">
              <div className="dl-body py-4">
                {fields.map((field) => (
                  <button
                    key={field.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selectedField === field.value}
                    onClick={() => handleSelectField(field.value)}
                    className={cx(
                      'dl-option hover:bg-bg-brand-weak',
                      selectedField === field.value && 'bg-bg-brand-weak! text-brand-secondary',
                    )}
                    data-testid={testid('field-option')}
                  >
                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                      {selectedField === field.value && <SvgIcon name="newCheck" className="w-5 h-5 text-primary" />}
                    </div>
                    <span
                      className={cx(
                        'flex-1 min-w-0 truncate',
                        selectedField === field.value ? 'text-[var(--color-primary)]' : 'text-gray-800',
                      )}
                    >
                      {t(field.label)}
                    </span>
                  </button>
                ))}
              </div>
              <div className="w-full h-px! bg-text-lighter/30!" />
              <div className="py-4">
                {orders.map((order) => (
                  <button
                    key={order.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selectedOrder === order.value}
                    onClick={() => handleSelectOrder(order.value)}
                    className={cx('dl-option', selectedOrder === order.value && 'bg-bg-brand-weak!')}
                    data-testid={testid('order-option')}
                  >
                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                      {selectedOrder === order.value && <SvgIcon name="newCheck" className="w-5 h-5 text-primary" />}
                    </div>
                    <span
                      className={cx(
                        'flex-1 min-w-0 truncate',
                        selectedOrder === order.value ? 'text-[var(--color-primary)]' : 'text-gray-800',
                      )}
                    >
                      {t(order.label)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Mobile Bottom Drawer */}
      {isMobile && isDrawerVisible && (
        <div
          className={cx(
            'fixed inset-0 z-50 flex flex-col justify-end transition-opacity duration-200',
            !isMenuOpen && 'opacity-0 pointer-events-none',
          )}
          onClick={(event) => {
            closeDrawer();
            event.stopPropagation();
          }}
        >
          <div className="absolute inset-0 bg-bg-overlay" />
          <div
            className={cx(
              'relative bg-white rounded-t-xl shadow-default flex flex-col max-h-[80vh] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
              !isMenuOpen && 'translate-y-full',
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="py-4">
              {fields.map((field) => (
                <button
                  key={field.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selectedField === field.value}
                  className={cx(
                    'flex items-center gap-2 w-full px-4 py-2 text-sm text-left border-none cursor-pointer transition-colors duration-150',
                    selectedField === field.value
                      ? 'bg-secondary text-primary'
                      : 'bg-transparent text-text-default hover:bg-secondary',
                  )}
                  onClick={() => {
                    handleSelectField(field.value);
                    closeDrawer();
                  }}
                >
                  <span className="flex items-center justify-center w-5 h-5 shrink-0">
                    {selectedField === field.value && (
                      <AppMatIcon icon="check" className="text-[22px]! text-brand-primary" />
                    )}
                  </span>
                  <span
                    className={cx(
                      'flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium',
                      selectedField === field.value && 'text-brand-secondary',
                    )}
                  >
                    {t(field.label)}
                  </span>
                </button>
              ))}
            </div>
            <div className="w-full h-px bg-text-lighter/30" />
            <div className="py-4">
              {orders.map((order) => (
                <button
                  key={order.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selectedOrder === order.value}
                  className={cx(
                    'flex items-center gap-3 w-full px-4 py-2 text-sm text-left border-none cursor-pointer transition-colors duration-150',
                    selectedOrder === order.value
                      ? 'bg-secondary text-primary'
                      : 'bg-transparent text-text-default hover:bg-secondary',
                  )}
                  onClick={() => {
                    handleSelectOrder(order.value);
                    closeDrawer();
                  }}
                >
                  <span className="flex items-center justify-center w-5 h-5 shrink-0">
                    {selectedOrder === order.value && (
                      <AppMatIcon icon="check" className="text-[22px]! text-brand-primary" />
                    )}
                  </span>
                  <span
                    className={cx(
                      'flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium',
                      selectedOrder === order.value && 'text-brand-secondary',
                    )}
                  >
                    {t(order.label)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
