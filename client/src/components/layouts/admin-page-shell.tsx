import type { ReactNode } from 'react';

interface AdminPageShellProps {
  /**
   * ヘッダー。通常は共通 UI（#278）の PageHeader を渡す（移植元は titleKey 等を受け取って app-page-header を描画する）。
   * 画面独自のヘッダーを渡すときは customHeader を true にする
   */
  header?: ReactNode;
  /** 画面独自のヘッダーか（移植元 customHeader）。本文の領域が term-main--full になる */
  customHeader?: boolean;
  /** 本文の領域（main）に足すクラス */
  mainClass?: string;
  children: ReactNode;
}

/**
 * 移植元 shared/layouts/admin-page-shell。管理画面の各画面の外枠（ヘッダー＋本文）。
 * term-main・term-main--full は移植元 styles.css のクラス（#278 で index.css に移す）。
 */
export function AdminPageShell({
  header,
  customHeader = false,
  mainClass = '',
  children,
}: AdminPageShellProps) {
  return (
    <div className="flex h-full w-full flex-col">
      <div className="z-30 flex shrink-0 flex-col bg-bg-primary">{header}</div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className={`${customHeader ? 'term-main--full' : 'term-main'} ${mainClass}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
