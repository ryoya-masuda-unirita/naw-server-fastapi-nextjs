import { ICON_PATHS, type SvgIconName } from './svg-icon-paths';

/** テスト用: 指定した名前の material-symbols アイコン（MatIcon・AppMatIcon）を探す */
export function queryMatIcon(container: ParentNode, name: string): HTMLElement | null {
  const icons = Array.from(container.querySelectorAll<HTMLElement>('.material-symbols-outlined'));
  return icons.find((el) => el.textContent?.trim() === name) ?? null;
}

/** テスト用: 指定した名前の SvgIcon を、描画されたパスで探す */
export function querySvgIcon(container: ParentNode, name: SvgIconName): Element | null {
  const raw: string | readonly string[] = ICON_PATHS[name];
  const first = typeof raw === 'string' ? raw : raw[0];
  const path = Array.from(container.querySelectorAll('path')).find((p) => p.getAttribute('d') === first);
  return path?.closest('span') ?? null;
}
