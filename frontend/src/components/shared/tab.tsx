import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { cx } from './class-names';
import { MatIcon } from './mat-icon';
import type { TabItem } from './types';

interface TabProps {
  tabs: TabItem[];
  /** 指定するとこの id を選択中として表示する（未指定なら内部で持つ） */
  activeTabId?: string;
  /** 移植元にあるが見た目には使われていない */
  variant?: 'default' | 'underline' | 'pills';
  fullWidth?: boolean;
  containerClass?: string;
  className?: string;
  onTabChange?: (tab: TabItem) => void;
}

/** 移植元 `<app-tab>`（shared/components/tab） */
export function Tab({
  tabs,
  activeTabId = '',
  fullWidth = false,
  containerClass = '',
  className,
  onTabChange,
}: TabProps) {
  const { t } = useTranslation();
  // 移植元 ngOnInit: activeTabId がなければ先頭タブ（無効でなければ）を選択中にする
  const [internalActiveId, setInternalActiveId] = useState(() => {
    if (!activeTabId && tabs.length > 0 && !tabs[0].disabled) return tabs[0].id;
    return activeTabId;
  });
  const currentActiveId = activeTabId || internalActiveId;

  const handleTabClick = (tab: TabItem) => {
    if (tab.disabled) return;
    setInternalActiveId(tab.id);
    onTabChange?.(tab);
  };

  const itemClass = (tab: TabItem) =>
    cx(
      'p-3 md:px-6 md:py-4 text-label-x-large text-text-medium block relative font-medium',
      tab.disabled && 'opacity-40 cursor-not-allowed',
      fullWidth && 'flex-1 justify-center',
      currentActiveId === tab.id && 'text-brand-primary!',
    );

  const renderInner = (tab: TabItem, labelClass?: string) => (
    <>
      {tab.icon && <MatIcon icon={tab.icon} className="text-current text-xl w-5 h-5" />}
      <span className={labelClass}>{t(tab.label)}</span>
      {currentActiveId === tab.id && (
        <span className="absolute -bottom-0.5 -left-4 -right-4 h-1.25 bg-brand-primary mx-4" />
      )}
    </>
  );

  return (
    <div className={cx('app-tab block w-full', className)}>
      <div className={cx('flex px-2 md:px-6', fullWidth && 'w-full', containerClass)} role="tablist">
        {tabs.map((tab) => {
          const isActive = currentActiveId === tab.id;
          if (tab.route && !tab.route.startsWith('#') && !tab.disabled) {
            return (
              <Link
                key={tab.id}
                to={tab.route}
                className={itemClass(tab)}
                aria-current={isActive ? 'page' : undefined}
                aria-disabled={tab.disabled}
                onClick={() => handleTabClick(tab)}
              >
                {renderInner(tab)}
              </Link>
            );
          }
          return (
            <button
              key={tab.id}
              type="button"
              className={itemClass(tab)}
              aria-current={isActive ? 'page' : undefined}
              aria-disabled={tab.disabled}
              disabled={tab.disabled}
              onClick={() => handleTabClick(tab)}
            >
              {renderInner(tab, 'font-medium')}
            </button>
          );
        })}
      </div>
    </div>
  );
}
