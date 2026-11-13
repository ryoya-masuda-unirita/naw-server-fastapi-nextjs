import type { MaterialSymbol } from 'material-symbols';

/**
 * material-symbols のフォントは旧 Material Icons の名前（expand_more・drive_file_rename_outline など）も
 * リガチャとして描画できるが、型定義（MaterialSymbol）には正式名しかない。
 * 移植元が旧名を使っている箇所と、アイコン名を文字列で受け取る部品（Tab・Dialog・DropdownSelect）のために文字列も許可する
 */
type MaterialSymbolName = MaterialSymbol | (string & Record<never, never>);

interface MatIconProps {
  name: MaterialSymbolName;
  /** px。移植元の .mat-icon.icon-20 / icon-16 / icon-12 に相当する */
  size?: number;
  className?: string;
}

const DEFAULT_ICON_SIZE = 20;

/**
 * 移植元の <mat-icon>（fontSet: material-symbols-outlined）。
 * サイズを Tailwind のクラスでなく style で指定するのは、Tailwind のユーティリティが cascade layer 内にあり、
 * レイヤー外で読み込む Material Symbols の font-size: 24px に負けるため。
 */
export function MatIcon({ name, size = DEFAULT_ICON_SIZE, className = '' }: MatIconProps) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-outlined shrink-0 overflow-hidden select-none ${className}`}
      style={{ fontSize: size, width: size, height: size }}
    >
      {name}
    </span>
  );
}
