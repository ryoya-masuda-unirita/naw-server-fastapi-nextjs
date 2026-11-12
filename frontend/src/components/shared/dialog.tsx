import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './cdk-overlay.css';
import './dialog.css';
import { Button } from './button';
import { cx } from './class-names';
import { AppMatIcon, MatIcon } from './mat-icon';
import { SvgIcon } from './svg-icon';

/** MatDialog の既定（autoFocus: 'first-tabbable'）と同じ対象を探す */
const TABBABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  /** true の間だけ表示する（移植元の `dialog.open()` / `dialogRef.close()` に相当） */
  open: boolean;
  /**
   * 閉じたいときに呼ばれる。result は移植元の `afterClosed()` の値と同じ:
   * 既定の確認ボタン=true、既定のキャンセルボタン=false、×・Esc・背景クリック=undefined。
   */
  onClose?: (result?: unknown) => void;

  // --- 移植元 DialogData ---
  title: string;
  titleClass?: string;
  message?: string;
  /** 本文（移植元の content / contentComponent） */
  children?: ReactNode;
  bottomLeftContent?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
  showConfirm?: boolean;
  showClose?: boolean;
  buttonAlign?: 'center' | 'right';
  /** 既定のボタン列の代わりに出すボタン群 */
  customActions?: ReactNode;
  /** `.mdc-dialog__surface` の幅（移植元 data.width） */
  width?: string;
  /** `.mdc-dialog__surface` の最小幅（移植元 data.minWidth） */
  minWidth?: string;
  showDefaultActions?: boolean;
  headerTrailing?: ReactNode;
  leftActionText?: string;
  /** material-symbols のアイコン名 */
  leftActionIcon?: string;
  leftActionDanger?: boolean;
  leftActionLoading?: boolean;
  onLeftAction?: () => void;
  /** 指定するとキャンセルボタンで閉じずにこれを呼ぶ（移植元 cancelAction） */
  onCancel?: () => void;
  /** 指定すると確認ボタンで閉じずにこれを呼ぶ（移植元 confirmAction） */
  onConfirm?: () => void;
  confirmDanger?: boolean;
  /** 'delete' は SVG アイコン、それ以外は material-symbols のアイコン名 */
  confirmIcon?: string;
  confirmLoading?: boolean;
  confirmDisabled?: boolean;
  confirmMinWidth?: string;
  contentClass?: string;
  confirmTestid?: string;
  cancelTestid?: string;

  // --- 移植元 MatDialogConfig ---
  /** パネルの幅（`dialog.open(..., { width: '800px' })`） */
  dialogWidth?: string;
  /** パネルに足すクラス（`dialog-xl`・`dialog-large`・`dialog-overflow-visible` など） */
  panelClass?: string;
  /** true にすると Esc・背景クリックで閉じない */
  disableClose?: boolean;
}

function justifyClass(hasLeft: boolean, buttonAlign: DialogProps['buttonAlign']): string {
  if (hasLeft) return '';
  if (buttonAlign === 'right') return 'justify-end';
  return 'justify-center';
}

/**
 * 移植元 `<app-dialog>`（shared/components/dialog）と、それを開く MatDialog のオーバーレイ。
 * DOM 構造とクラス名を Material に揃え、styles.css 側の上書き（角丸・余白・最大幅など）がそのまま効くようにしている。
 */
export function Dialog(props: DialogProps) {
  if (!props.open) return null;
  return createPortal(<DialogOverlay {...props} />, document.body);
}

function DialogOverlay({
  onClose,
  title,
  titleClass,
  message,
  children,
  bottomLeftContent,
  confirmText,
  cancelText,
  showCancel = false,
  showConfirm = false,
  showClose = false,
  buttonAlign,
  customActions,
  width,
  minWidth,
  showDefaultActions: showDefaultActionsProp,
  headerTrailing,
  leftActionText,
  leftActionIcon,
  leftActionDanger = false,
  leftActionLoading = false,
  onLeftAction,
  onCancel,
  onConfirm,
  confirmDanger = false,
  confirmIcon,
  confirmLoading = false,
  confirmDisabled = false,
  confirmMinWidth,
  contentClass,
  confirmTestid,
  cancelTestid,
  dialogWidth,
  panelClass,
  disableClose = false,
}: DialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const showDefaultActions = showDefaultActionsProp !== false;
  const hasLeft = !!bottomLeftContent || !!leftActionText;

  // MatDialog と同じく、開いたら最初の操作可能要素へフォーカスし、閉じたら元の要素へ戻す
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    const first = container?.querySelector<HTMLElement>(TABBABLE_SELECTOR);
    (first ?? container)?.focus();
    return () => previous?.focus?.();
  }, []);

  // MatDialog の既定のスクロール抑止（block）に合わせ、開いている間は背面をスクロールさせない
  useEffect(() => {
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = prevOverflow;
    };
  }, []);

  const close = (result?: unknown) => onClose?.(result);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !disableClose) {
      // 重ねて開いたときに下のダイアログまで閉じないよう、最前面だけで処理する
      event.stopPropagation();
      close();
    }
  };

  const handleCancelClick = () => {
    if (onCancel) {
      onCancel();
    } else {
      close(false);
    }
  };

  const handleConfirmClick = () => {
    if (onConfirm) {
      onConfirm();
    } else {
      close(true);
    }
  };

  const surfaceStyle: CSSProperties = {};
  if (width) surfaceStyle.width = width;
  if (minWidth) surfaceStyle.minWidth = minWidth;

  const confirmIconNode = confirmIcon ? (
    confirmIcon === 'delete' ? (
      <SvgIcon name="delete" className="text-xl! leading-none" />
    ) : (
      <AppMatIcon icon={confirmIcon} className="text-xl! leading-none" />
    )
  ) : undefined;

  return (
    <div className="cdk-overlay-container">
      <div
        className="cdk-overlay-backdrop cdk-overlay-dark-backdrop cdk-overlay-backdrop-showing"
        data-testid="dialog-backdrop"
        onClick={() => {
          if (!disableClose) close();
        }}
      />
      <div className="cdk-global-overlay-wrapper">
        <div className={cx('cdk-overlay-pane mat-mdc-dialog-panel', panelClass)} style={{ width: dialogWidth }}>
          <div
            ref={containerRef}
            className="mat-mdc-dialog-container mdc-dialog mdc-dialog--open"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
          >
            <div className="mat-mdc-dialog-inner-container mdc-dialog__container">
              <div className="mat-mdc-dialog-surface mdc-dialog__surface" style={surfaceStyle}>
                <div className="app-dialog modal-dialog">
                  <div className="modal-content">
                    <div className="modal-header shrink-0 pb-2 md:flex md:items-center md:py-2 md:max-h-[51.8px] justify-between">
                      <h2 className={cx('text-h1 py-[2.5px] text-text-strong', titleClass)}>{title}</h2>
                      <div className="flex shrink-0 items-center gap-2 md:min-h-13 min-w-0 justify-end">
                        {headerTrailing}
                        {showClose && (
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-text-muted hover:bg-black/5"
                            onClick={() => close()}
                            aria-label="Close"
                          >
                            <MatIcon icon="close" className="h-5 w-5 text-[20px]" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className={cx('modal-body', contentClass)}>
                      {message && <p className="modal-delete-confirm-message text-text-strong">{message}</p>}
                      {children}
                    </div>
                  </div>

                  {(customActions || showDefaultActions) && (
                    <div
                      className={cx(
                        'flex shrink-0 flex-wrap gap-3 max-sm:justify-center px-0 pt-8 md:pt-12',
                        hasLeft ? 'justify-between items-center' : justifyClass(false, buttonAlign),
                      )}
                    >
                      {customActions && <div className="max-sm:w-full">{customActions}</div>}

                      {showDefaultActions && !customActions && (
                        <div
                          className={cx(
                            'flex w-full flex-wrap items-center gap-3 max-sm:flex-col max-sm:items-stretch',
                            hasLeft ? 'justify-between' : justifyClass(false, buttonAlign),
                          )}
                        >
                          {hasLeft && (
                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 max-sm:w-full">
                              {bottomLeftContent}
                              {leftActionText && (
                                <Button
                                  variant={leftActionDanger ? 'danger' : 'outline'}
                                  size="md"
                                  heightPx={54}
                                  iconPosition="left"
                                  fullWidth
                                  className="max-sm:w-full"
                                  loading={leftActionLoading}
                                  icon={
                                    leftActionIcon ? (
                                      <MatIcon icon={leftActionIcon} className="h-5 w-5 text-[20px]" />
                                    ) : undefined
                                  }
                                  onClick={() => onLeftAction?.()}
                                >
                                  {leftActionText}
                                </Button>
                              )}
                            </div>
                          )}
                          <div className="flex flex-wrap justify-end gap-3 max-sm:w-full">
                            {showCancel && (
                              <Button
                                variant="outline"
                                intent="cancel"
                                size="largePcDefault"
                                heightPx={54}
                                className={cx(
                                  'dialog-cancel-btn min-w-36.5 max-sm:flex-1',
                                  !showConfirm && 'md:w-auto w-full',
                                )}
                                fullWidth
                                dataTestid={cancelTestid ?? 'dialog-cancel-button'}
                                onClick={handleCancelClick}
                              >
                                {cancelText || 'キャンセル'}
                              </Button>
                            )}
                            {showConfirm && (
                              <Button
                                variant={confirmDanger ? 'danger' : 'solid'}
                                size="largePcDefault"
                                heightPx={54}
                                iconPosition={confirmIcon ? 'left' : 'right'}
                                className={`${confirmMinWidth ?? 'min-w-30.5'} max-sm:flex-1`}
                                fullWidth
                                loading={confirmLoading}
                                disabled={confirmDisabled}
                                icon={confirmIconNode}
                                dataTestid={confirmTestid ?? 'dialog-confirm-button'}
                                onClick={handleConfirmClick}
                              >
                                {confirmText || '確認'}
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
