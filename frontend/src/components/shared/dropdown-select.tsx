import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import './cdk-overlay.css';
import './dropdown-select.css';
import { cx } from './class-names';
import { MatIcon } from './mat-icon';

export interface DropdownOption {
  label: string;
  value: string;
  /** material-symbols のアイコン名 */
  icon?: string;
}

interface DropdownSelectProps {
  options: DropdownOption[];
  placeholder?: string;
  /** true のとき label を i18n キーとして翻訳する */
  translateLabels?: boolean;
  /** パネルの幅（数値は px）。'auto' は内容に合わせる */
  panelWidth?: string | number;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}

/**
 * 移植元 `<app-dropdown-select>`（shared/components/filter/dropdown-select）。
 * 移植元は CDK の connected overlay（暗い backdrop 付き）でパネルを出す。
 * React では body 直下へ portal し、トリガーの左下に合わせて置く（CDK の既定位置と同じ）。
 */
export function DropdownSelect({
  options,
  placeholder = '',
  translateLabels = true,
  panelWidth = 'auto',
  value = '',
  onValueChange,
  className,
}: DropdownSelectProps) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const selectedOption = options.find((o) => o.value === value);
  const selectedLabel = selectedOption ? selectedOption.label : placeholder || options[0]?.label || '';
  const label = (text: string) => (translateLabels ? t(text) : text);

  const toggleOpen = () => {
    if (!isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPanelPosition({ top: rect.bottom, left: rect.left });
    }
    setIsOpen(!isOpen);
  };

  const close = () => setIsOpen(false);

  const selectOption = (option: DropdownOption) => {
    onValueChange?.(option.value);
    close();
  };

  const panelStyle: CSSProperties = {
    position: 'fixed',
    top: panelPosition.top,
    left: panelPosition.left,
    width: typeof panelWidth === 'number' ? `${panelWidth}px` : panelWidth,
  };

  return (
    <span className={cx('app-dropdown-select', className)}>
      <div
        ref={triggerRef}
        onClick={toggleOpen}
        className={cx(
          'relative flex items-center justify-between w-full h-10 px-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors',
          isOpen && 'ring-2 ring-primary',
        )}
      >
        <span className="text-sm text-text-default truncate">{label(selectedLabel)}</span>
        <MatIcon
          icon="expand_more"
          className={cx(
            'text-gray-400 !w-4 !h-4 !text-[16px] transition-transform duration-200 flex-shrink-0',
            isOpen && 'rotate-180',
          )}
        />
      </div>

      {isOpen &&
        createPortal(
          <>
            {/* CDK overlay の backdrop（既定は dark。styles.css の .cdk-overlay-backdrop で bg-bg-overlay になる） */}
            <div
              className="cdk-overlay-backdrop cdk-overlay-dark-backdrop cdk-overlay-backdrop-showing fixed inset-0 z-[1000] bg-bg-overlay"
              onClick={close}
            />
            <div className="app-dropdown-select-panel z-[1000]" style={panelStyle}>
              <div
                className="min-w-[200px] mt-2 bg-white rounded-lg shadow-lg border border-slate-100 overflow-hidden py-1 animate-fade-in max-h-[300px] overflow-y-auto"
                role="listbox"
              >
                {options.map((option) => (
                  <div
                    key={option.value}
                    onClick={() => selectOption(option)}
                    className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors group"
                    role="option"
                    aria-selected={value === option.value}
                  >
                    <div className="flex items-center gap-2">
                      {value === option.value ? (
                        <MatIcon icon="check" className="text-primary !w-4 !h-4 !text-[16px]" />
                      ) : (
                        <div className="w-4" />
                      )}
                      {option.icon && (
                        <MatIcon icon={option.icon} className="!w-4 !h-4 !text-[16px] text-text-lighter" />
                      )}
                      <span className="text-sm text-text-default group-hover:text-primary">
                        {label(option.label)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>,
          document.body,
        )}
    </span>
  );
}
