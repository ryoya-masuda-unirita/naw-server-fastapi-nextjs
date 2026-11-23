import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent, MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './button';
import { cx } from './class-names';
import { SvgIcon } from './icons/svg-icon';
import { useDocumentClick, useLatestRef, useModelState, useWindowEvent } from './select-hooks';
import type { SelectOption } from './types';
import { useIsMobile } from './use-is-mobile';

type PanelSize = 'default' | 'big' | 'full';
type FilledState = 'active' | 'inputed';

interface ListStyle {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  width?: string;
  maxHeight?: string;
  opacity?: string;
}

const LIST_GAP_PX = 4;
const VIEWPORT_MARGIN_PX = 8;
const PANEL_WIDTH_DEFAULT_PX = 240;
const PANEL_WIDTH_BIG_PX = 280;
/** 下の余白がこれ未満で、上の方が広ければ上に開く */
const OPEN_UPWARD_THRESHOLD_PX = 200;
const LIST_MIN_HEIGHT_PX = 120;

/** 既定値を毎回新しい配列にすると useModelState が「値が変わった」と判定し続けるため、定数にする */
const EMPTY_VALUE: never[] = [];

export interface ComboboxMultiProps<T = string> {
  /** 検索欄・リストの id の元になる */
  id: string;
  /** 移植元にあるが描画には使われていない */
  name: string;
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  /** 移植元にあるが描画には使われていない */
  required?: boolean;
  /** エラー枠にする */
  error?: boolean;
  label?: string;
  /** ラベル横のバッジ（「任意」など） */
  badgeText?: string;
  errorMessage?: string;
  supportText?: string;
  /** テスト用の安定セレクタの接頭辞。`${prefix}-trigger` / `${prefix}-option` / `${prefix}-confirm-button` を付ける */
  testidPrefix?: string | null;
  /** 検索欄の下に出す補足 */
  searchHint?: string;
  /** 絞り込み結果が空のときの文言（移植元は日本語をハードコード） */
  emptyMessage?: string;
  /** トリガーの data-filled 属性 */
  filled?: FilledState;
  /** デスクトップのパネル幅（default=240px、big=280px、full=トリガー幅） */
  panelSize?: PanelSize;
  value?: T[];
  /** 確定（選択を確定・閉じた状態でのチップ削除）で値が変わったとき。移植元の `(valueChange)` */
  onValueChange?: (value: T[]) => void;
  /** 確定したとき。移植元の `(commit)` */
  onCommit?: (value: T[]) => void;
  className?: string;
}

/**
 * 移植元 `<app-combobox-multi>`（shared/components/combobox-multi）。
 * 検索で絞り込みながら複数選択し、「選択を確定」で確定する。開いている間の選択は確定まで仮の値（staging）で持つ。
 * 閉じているときは 1 行に収まらないチップを隠して `+N` バッジを出す。
 */
export function ComboboxMulti<T = string>({
  id,
  options,
  placeholder = '選択してください',
  disabled = false,
  error = false,
  label,
  badgeText,
  errorMessage,
  supportText,
  testidPrefix = null,
  searchHint = '',
  emptyMessage = '表示するデータがありません',
  filled,
  panelSize = 'default',
  value: valueProp = EMPTY_VALUE,
  onValueChange,
  onCommit,
  className,
}: ComboboxMultiProps<T>) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const hostRef = useRef<HTMLFieldSetElement>(null);
  const chipsRowRef = useRef<HTMLDivElement>(null);
  const pcInputRef = useRef<HTMLInputElement>(null);
  const spInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useModelState<T[]>(valueProp, onValueChange);
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [staging, setStaging] = useState<T[] | null>(null);
  const [listStyle, setListStyle] = useState<ListStyle>({});

  const effectiveValue = staging ?? value;
  const hasValue = effectiveValue.length > 0;
  const selectedOptions = options.filter((opt) => effectiveValue.includes(opt.value));
  const q = query.trim().toLowerCase();
  const filteredOptions = q
    ? options.filter((opt) => {
        const optLabel = String(opt.label ?? '').toLowerCase();
        const desc = String(opt.description ?? '').toLowerCase();
        const cat = String(opt.category ?? '').toLowerCase();
        return optLabel.includes(q) || desc.includes(q) || cat.includes(q);
      })
    : options;
  const enabledVisibleValues = filteredOptions.filter((o) => !o.disabled).map((o) => o.value);
  const selectedVisibleCount = enabledVisibleValues.filter((v) => effectiveValue.includes(v)).length;
  const allSelected = enabledVisibleValues.length > 0 && selectedVisibleCount === enabledVisibleValues.length;
  const someSelected = selectedVisibleCount > 0 && selectedVisibleCount < enabledVisibleValues.length;

  /**
   * 閉じているとき、1 行目に収まらないチップを隠して `+N` バッジを出す。
   * 実際の折り返し位置を測る必要があるため、移植元と同じく描画後の DOM を直接操作する。
   */
  const recalcChipOverflow = () => {
    const row = chipsRowRef.current;
    const input = pcInputRef.current;
    if (!row) return;
    row.querySelectorAll<HTMLElement>('[data-chip-el]').forEach((el) => el.removeAttribute('hidden'));
    row.querySelectorAll<HTMLElement>('[data-overflow-badge-el]').forEach((el) => el.remove());
    if (latest.current.isOpen) {
      if (input) input.removeAttribute('hidden');
      return;
    }
    const chips = Array.from(row.querySelectorAll<HTMLElement>('[data-chip-el]'));
    if (chips.length === 0) {
      if (input) input.removeAttribute('hidden');
      return;
    }
    if (!row.clientWidth) return; // 非表示のコンテナでは測れない
    if (input) input.setAttribute('hidden', '');
    const firstTop = chips[0].offsetTop;
    let hiddenCount = 0;
    for (let i = 1; i < chips.length; i++) {
      if (chips[i].offsetTop > firstTop) {
        chips[i].setAttribute('hidden', '');
        hiddenCount++;
      }
    }
    if (hiddenCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'combobox-overflow-badge';
      badge.textContent = `+${hiddenCount}`;
      badge.setAttribute('data-overflow-badge-el', '');
      row.insertBefore(badge, input ?? null);
      // バッジ自体が折り返したら、収まるまで末尾のチップを 1 つずつ隠す
      while (hiddenCount < chips.length && badge.offsetTop > firstTop) {
        let lastVisibleIdx = -1;
        for (let i = chips.length - 1; i >= 0; i--) {
          if (!chips[i].hasAttribute('hidden')) {
            lastVisibleIdx = i;
            break;
          }
        }
        if (lastVisibleIdx <= 0) break;
        chips[lastVisibleIdx].setAttribute('hidden', '');
        hiddenCount++;
        badge.textContent = `+${hiddenCount}`;
      }
    }
  };

  const positionList = () => {
    if (isMobile) {
      // モバイルは CSS で画面下のシートになるので、表示するだけでよい
      setListStyle({ opacity: '1' });
      return;
    }
    const list = listRef.current;
    const trigger = hostRef.current?.querySelector<HTMLElement>('[data-cmulti-trigger]');
    if (!list || !trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN_PX;
    const spaceAbove = rect.top - VIEWPORT_MARGIN_PX;
    let width = PANEL_WIDTH_DEFAULT_PX;
    if (panelSize === 'full') width = rect.width;
    else if (panelSize === 'big') width = PANEL_WIDTH_BIG_PX;
    let left = rect.left;
    if (left + width > window.innerWidth - VIEWPORT_MARGIN_PX) left = window.innerWidth - width - VIEWPORT_MARGIN_PX;
    if (left < VIEWPORT_MARGIN_PX) left = VIEWPORT_MARGIN_PX;
    const openUpward = spaceBelow < OPEN_UPWARD_THRESHOLD_PX && spaceAbove > spaceBelow;
    const maxHeight = Math.max(openUpward ? spaceAbove : spaceBelow, LIST_MIN_HEIGHT_PX);
    setListStyle(
      openUpward
        ? {
            top: '',
            bottom: `${window.innerHeight - rect.top + LIST_GAP_PX}px`,
            left: `${left}px`,
            right: 'auto',
            width: `${width}px`,
            maxHeight: `${maxHeight}px`,
            opacity: '1',
          }
        : {
            top: `${rect.bottom}px`,
            bottom: '',
            left: `${left}px`,
            right: 'auto',
            width: `${width}px`,
            maxHeight: `${maxHeight}px`,
            opacity: '1',
          },
    );
    // ダイアログ内でも切り取られないよう、画面基準で配置する
    list.style.position = 'fixed';
    list.style.right = 'auto';
  };

  const latest = useLatestRef({ isOpen, isMobile, positionList, recalcChipOverflow });

  const schedulePositionList = () => {
    // 1 回目の rAF で描画、2 回目でダイアログ内のレイアウトが落ち着いてから測る
    requestAnimationFrame(() => requestAnimationFrame(() => latest.current.positionList()));
  };

  // 閉じたら（または確定値が変わったら）チップのはみ出しを測り直す
  useEffect(() => {
    if (isOpen) return;
    queueMicrotask(() => latest.current.recalcChipOverflow());
  }, [isOpen, effectiveValue, latest]);

  // 開いたら描画を待ってから位置を決める
  useEffect(() => {
    if (!isOpen || isMobile) return;
    requestAnimationFrame(() => requestAnimationFrame(() => latest.current.positionList()));
  }, [isOpen, isMobile, latest]);

  const open = () => {
    if (disabled) return;
    setStaging([...value]);
    setQuery('');
    setListStyle({ opacity: '0' });
    setIsVisible(true);
    setIsOpen(true);
    queueMicrotask(() => {
      schedulePositionList();
      if (latest.current.isMobile) {
        spInputRef.current?.focus();
      } else {
        pcInputRef.current?.focus();
      }
    });
  };

  const cancel = () => {
    if (!isOpen) return;
    setIsOpen(false);
    setIsVisible(false);
    setQuery('');
    setStaging(null);
  };

  const confirm = () => {
    if (!isOpen) return;
    const next = effectiveValue;
    setIsOpen(false);
    setIsVisible(false);
    setQuery('');
    setStaging(null);
    setValue(next);
    onCommit?.(next);
  };

  const toggle = () => {
    if (disabled) return;
    if (isOpen) cancel();
    else open();
  };

  const focusPcInput = () => {
    if (!isMobile) pcInputRef.current?.focus();
  };

  const isSelected = (option: SelectOption<T>) => effectiveValue.includes(option.value);

  const toggleOption = (option: SelectOption<T>) => {
    if (option.disabled) return;
    const next = isSelected(option)
      ? effectiveValue.filter((v) => v !== option.value)
      : [...effectiveValue, option.value];
    setStaging(next);
    focusPcInput();
  };

  const toggleAll = () => {
    const next = allSelected
      ? effectiveValue.filter((v) => !enabledVisibleValues.includes(v))
      : Array.from(new Set([...effectiveValue, ...enabledVisibleValues]));
    setStaging(next);
    focusPcInput();
  };

  const removeChip = (event: MouseEvent, optionValue: T) => {
    event.preventDefault();
    event.stopPropagation();
    if (isOpen) {
      setStaging(effectiveValue.filter((v) => v !== optionValue));
      focusPcInput();
      return;
    }
    const next = value.filter((v) => v !== optionValue);
    setValue(next);
    onCommit?.(next);
  };

  const handlePcInputFocus = () => {
    if (disabled) return;
    if (!latest.current.isOpen) open();
  };

  // 入力欄からフォーカスが外れたら、ほかの要素へ移ったときだけチップを測り直す
  const recalcAfterBlur = (input: HTMLInputElement | null) => {
    queueMicrotask(() => {
      if (!input) return;
      if (document.activeElement === input) return;
      latest.current.recalcChipOverflow();
    });
  };

  const handleQueryInput = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value ?? '');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLFieldSetElement>) => {
    if (disabled) return;
    if (event.key === 'Escape') {
      cancel();
    }
  };

  const cancelRef = useLatestRef(cancel);
  useDocumentClick((event) => {
    const target = event.target as Node | null;
    if (!target) return;
    if (!hostRef.current?.contains(target)) {
      cancelRef.current();
    }
  });
  useWindowEvent('resize', () => {
    if (latest.current.isOpen && !latest.current.isMobile) latest.current.positionList();
    if (!latest.current.isOpen) latest.current.recalcChipOverflow();
  });
  useWindowEvent('scroll', () => {
    if (!latest.current.isOpen || latest.current.isMobile) return;
    latest.current.positionList();
  });

  const checkIcons = (
    <>
      <span className="input-checkbox-icon-false">
        <SvgIcon name="selectedFlase" className="input-checkbox-icon-svg" />
      </span>
      <span className="input-checkbox-icon-true">
        <SvgIcon name="selectedTrue" className="input-checkbox-icon-svg" />
      </span>
    </>
  );

  const optionCheck = (
    <span className="combobox-option__check combobox-option__check--multi relative" aria-hidden="true">
      {checkIcons}
    </span>
  );

  return (
    <fieldset ref={hostRef} className={cx('app-combobox-multi block group', className)} onKeyDown={handleKeyDown}>
      {(label || supportText || errorMessage) && (
        <div className="fieldset-head mb-3">
          {label && (
            <label htmlFor={`${id}-search`} className="fieldset-title">
              {label}
              {badgeText && <span className="fieldset-any">{badgeText}</span>}
            </label>
          )}
          {supportText && <p className="fieldset-support-text">{supportText}</p>}
          {errorMessage && (
            <p className="fieldset-error-message" role="alert">
              {/* 移植元の name="attention" は SVG 辞書になく、空のアイコン枠だけが出る。見た目を揃えるため枠だけ置く */}
              <span className="flex w-5 h-5 items-center justify-center" />
              {errorMessage}
            </p>
          )}
        </div>
      )}

      <div className="combobox-wrap" data-open={isOpen ? 'true' : 'false'} data-cmulti-wrap="">
        <div
          className={cx(
            'combobox-trigger',
            error && 'combobox-trigger--error',
            disabled && 'combobox-trigger--disabled',
          )}
          data-testid={testidPrefix ? `${testidPrefix}-trigger` : undefined}
          data-filled={filled || undefined}
          data-cmulti-trigger=""
          onClick={toggle}
        >
          <div className="combobox-chips-row" ref={chipsRowRef} data-cmulti-chips="">
            {selectedOptions.map((opt, index) => (
              <span
                key={`${String(opt.value)}-${index}`}
                className="combobox-chip"
                data-chip-el=""
                onClick={(event) => event.stopPropagation()}
              >
                <span className="truncate" style={{ maxWidth: '96px' }}>
                  {opt.label}
                </span>
                <button
                  type="button"
                  className="combobox-chip-remove"
                  aria-label="削除"
                  onClick={(event) => removeChip(event, opt.value)}
                >
                  <SvgIcon name="closePath" className="w-3! h-3!" />
                </button>
              </span>
            ))}
            <input
              ref={pcInputRef}
              type="text"
              className="combobox-chips-search"
              id={`${id}-search`}
              placeholder={!hasValue ? placeholder : ''}
              data-placeholder={placeholder}
              autoComplete="off"
              role="combobox"
              aria-haspopup="listbox"
              aria-expanded={isOpen}
              aria-controls={`${id}-listbox`}
              aria-autocomplete="list"
              disabled={disabled}
              value={query}
              onFocus={handlePcInputFocus}
              onBlur={() => {
                if (latest.current.isOpen) recalcAfterBlur(pcInputRef.current);
              }}
              onChange={handleQueryInput}
              onClick={(event) => event.stopPropagation()}
            />
          </div>
          <span className="combobox-separator right-11" aria-hidden="true" />
          <button
            type="button"
            className="combobox-chevron-btn"
            tabIndex={-1}
            aria-hidden="true"
            disabled={disabled}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              toggle();
            }}
          >
            <SvgIcon name="dropDown" className="w-5 h-5" />
          </button>
        </div>

        <div className="combobox-backdrop" onClick={cancel} aria-hidden="true" />

        {isVisible && (
          <div
            ref={listRef}
            className={cx(
              'combobox-list',
              panelSize === 'big' && 'combobox-list--big',
              panelSize === 'full' && 'combobox-list--full',
            )}
            hidden={!isOpen}
            role="listbox"
            id={`${id}-listbox`}
            aria-multiselectable="true"
            style={{
              top: listStyle.top,
              bottom: listStyle.bottom,
              left: listStyle.left,
              right: listStyle.right,
              width: listStyle.width,
              maxHeight: listStyle.maxHeight,
              opacity: listStyle.opacity,
            }}
            onClick={(event) => event.stopPropagation()}
            data-cmulti-list=""
          >
            <div className="combobox-list__search">
              <div className="combobox-list__sp-trigger">
                {selectedOptions.map((opt, index) => (
                  <span
                    key={`${String(opt.value)}-${index}`}
                    className="combobox-chip"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <span className="truncate" style={{ maxWidth: '96px' }}>
                      {opt.label}
                    </span>
                    <button
                      type="button"
                      className="combobox-chip-remove"
                      aria-label="削除"
                      onClick={(event) => removeChip(event, opt.value)}
                    >
                      <SvgIcon name="closePath" className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  ref={spInputRef}
                  type="text"
                  className="combobox-list__sp-input"
                  placeholder={!hasValue ? placeholder : ''}
                  data-placeholder={placeholder}
                  autoComplete="off"
                  value={query}
                  onBlur={() => recalcAfterBlur(spInputRef.current)}
                  onChange={handleQueryInput}
                />
                <span className="combobox-separator right-10" aria-hidden="true" />
                <span className="combobox-list__sp-chevron" aria-hidden="true">
                  <SvgIcon name="dropDown" className="w-5 h-5" />
                </span>
              </div>
              {searchHint && <p className="combobox-list__hint">{searchHint}</p>}
            </div>

            <div className="combobox-list__body">
              <button
                type="button"
                className="combobox-select-all"
                onClick={toggleAll}
                data-state={allSelected ? 'true' : someSelected ? 'indeterminate' : 'false'}
              >
                <span className="relative flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
                  {checkIcons}
                  <span className="input-checkbox-icon-indeterminate">
                    <SvgIcon name="checkboxAll" className="input-checkbox-icon-svg" />
                  </span>
                </span>
                <span>{!allSelected ? t('COMMON.SELECT_ALL') : t('COMMON.RELEASE_ALL')}</span>
              </button>
              {filteredOptions.map((opt, index) => (
                <button
                  key={`${String(opt.value)}-${index}`}
                  type="button"
                  data-testid={testidPrefix ? `${testidPrefix}-option` : undefined}
                  className={cx(
                    'combobox-option combobox-option__multi',
                    !!(opt.description || opt.category) && 'combobox-option--rich',
                  )}
                  role="option"
                  aria-selected={isSelected(opt) ? 'true' : 'false'}
                  data-selected={isSelected(opt) ? 'true' : 'false'}
                  disabled={opt.disabled}
                  onClick={() => toggleOption(opt)}
                >
                  {opt.description || opt.category ? (
                    <div className="combobox-option__body">
                      <div className="combobox-option__head">
                        {optionCheck}
                        <span className="combobox-option-title">{opt.label}</span>
                      </div>
                      <div className="combobox-option__detail">
                        {opt.description && <p className="combobox-option__desc">{opt.description}</p>}
                        {opt.category && <span className="combobox-option__category">{opt.category}</span>}
                      </div>
                    </div>
                  ) : (
                    <>
                      {optionCheck}
                      <span className="combobox-option-title">{opt.label}</span>
                    </>
                  )}
                </button>
              ))}
              {filteredOptions.length === 0 && <p className="combobox-empty">{emptyMessage}</p>}
            </div>

            <div className="combobox-multi-footer">
              <Button
                variant="outline"
                type="button"
                size="largePcDefault"
                intent="cancel"
                classProps="text-base md:text-sm"
                onClick={cancel}
              >
                {t('COMMON.CANCEL')}
              </Button>
              <Button
                variant="solid"
                type="button"
                size="largePcDefault"
                onClick={confirm}
                classProps="text-base md:text-sm"
                dataTestid={testidPrefix ? `${testidPrefix}-confirm-button` : undefined}
              >
                {t('COMMON.CONFIRM_SELECTION')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </fieldset>
  );
}
