import { cx } from './class-names';
import { AppMatIcon } from './icons/app-mat-icon';
import { Switch } from './switch';

interface FormSwitchProps {
  /** 表示済みの文言（移植元も翻訳せずそのまま出す） */
  label: string;
  badgeText?: string;
  supportText?: string;
  error?: string;
  warning?: string;
  inputId?: string;
  /** スイッチ右側の文言 */
  switchLabel?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  checked?: boolean;
  /** スイッチの data-testid */
  dataTestid?: string;
  className?: string;
  /** 移植元の checkedChange */
  onCheckedChange?: (checked: boolean) => void;
  /** 移植元の formBlur。移植元は切り替えのたびに通知する */
  onFormBlur?: () => void;
}

/** 移植元 `<app-form-switch>`（shared/components/form/form-switch） */
export function FormSwitch({
  label,
  badgeText = '',
  supportText = '',
  error = '',
  warning = '',
  inputId = '',
  switchLabel = '',
  disabled = false,
  size = 'md',
  showIcon = true,
  checked = false,
  dataTestid,
  className,
  onCheckedChange,
  onFormBlur,
}: FormSwitchProps) {
  const handleSwitchChange = (value: boolean) => {
    onCheckedChange?.(value);
    onFormBlur?.();
  };

  return (
    <div className={cx('app-form-switch', className)}>
      <div className="flex flex-col gap-3">
        {label && (
          <div className="flex flex-col md:gap-1">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-text-default leading-[1.4]" htmlFor={inputId || undefined}>
                {label}
              </label>
              {badgeText && (
                <span className="bg-bg-secondary text-text-muted text-[10px] px-1 py-0.5 rounded leading-none">
                  {badgeText}
                </span>
              )}
            </div>
            {supportText && <p className="text-xs text-text-muted leading-[1.4] max-sm:mt-1">{supportText}</p>}
          </div>
        )}
        {warning && (
          <div className="flex items-center gap-1 md:mt-1 text-status-caution">
            <AppMatIcon icon="warning" className="text-xl!" />
            <p className="text-xs font-normal leading-[1.4]">{warning}</p>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-1 md:mt-1 text-status-error">
            <AppMatIcon icon="warning" className="text-xl!" />
            <p className="text-xs font-normal leading-[1.4]">{error}</p>
          </div>
        )}
        <div className={cx('form-switch-wrapper flex items-center w-full', error && 'has-error')}>
          {/* 移植元は app-switch のホスト要素に data-testid を付ける。Switch は data-testid を受けないので外側で包む */}
          <span className="contents" data-testid={dataTestid}>
            <Switch
              label={switchLabel}
              disabled={disabled}
              size={size}
              showIcon={showIcon}
              checked={checked}
              onCheckedChange={handleSwitchChange}
            />
          </span>
        </div>
      </div>
    </div>
  );
}
