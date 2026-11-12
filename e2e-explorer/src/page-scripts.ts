/**
 * ページの中で動かす関数。page.evaluate に関数ごと渡して文字列化されるため、
 * 各関数は外側の変数・import を参照してはいけない（必要なものは引数で渡す）。
 */

export const ELEMENT_ID_ATTR = 'data-e2e-explorer-id';

export interface PageElement {
  /** ELEMENT_ID_ATTR に入れた番号。Playwright から要素を指すために使う。 */
  id: number;
  signature: string;
  occurrence: number;
  tag: string;
  role: string;
  name: string;
  inputType: string;
  region: string | null;
  href: string | null;
  external: boolean;
  opensNewTab: boolean;
  download: boolean;
  /** 所属するフォームの番号（フォームの一覧の添字）。 */
  formIndex: number | null;
  isSubmit: boolean;
  isField: boolean;
  maxLength: number | null;
  options: string[];
}

export interface PageForm {
  id: number;
  signature: string;
  occurrence: number;
  region: string | null;
  name: string;
}

export interface Enumeration {
  pathname: string;
  elements: PageElement[];
  forms: PageForm[];
  hasDialog: boolean;
  hasErrorMessage: boolean;
}

export interface EnumerateArgs {
  attr: string;
  excludeSelectors: string[];
  sharedRegions: string[];
}

export function enumerateElements(args: EnumerateArgs): Enumeration {
  const ACTIONABLE = [
    'a[href]',
    'button',
    'input:not([type=hidden])',
    'select',
    'textarea',
    'summary',
    '[role=button]',
    '[role=link]',
    '[role=tab]',
    '[role=menuitem]',
    '[role=menuitemcheckbox]',
    '[role=menuitemradio]',
    '[role=checkbox]',
    '[role=switch]',
    '[role=option]',
    '[contenteditable=""]',
    '[contenteditable=true]',
  ].join(',');
  const FIELD_TYPES = ['text', 'search', 'email', 'url', 'tel', 'password', 'number', 'textarea', 'select', ''];

  const clean = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);

  const isVisible = (el: Element): boolean => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    if (el.closest('[inert],[aria-hidden="true"]')) return false;
    return true;
  };

  const isDisabled = (el: Element): boolean =>
    (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true';

  const accessibleName = (el: Element): string => {
    const aria = el.getAttribute('aria-label');
    if (aria) return clean(aria);
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ');
      if (clean(text)) return clean(text);
    }
    const labels = (el as HTMLInputElement).labels;
    if (labels && labels.length > 0) {
      const text = Array.from(labels)
        .map((l) => l.textContent ?? '')
        .join(' ');
      if (clean(text)) return clean(text);
    }
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) return clean(placeholder);
    const title = el.getAttribute('title');
    if (title) return clean(title);
    const text = clean((el as HTMLElement).innerText);
    if (text) return text;
    const img = el.querySelector('img[alt]');
    if (img) return clean(img.getAttribute('alt'));
    return clean(el.getAttribute('name') ?? el.id ?? '');
  };

  const regionOf = (el: Element): string | null => {
    for (const selector of args.sharedRegions) {
      if (el.closest(selector)) return selector;
    }
    return null;
  };

  const inputTypeOf = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'select' || tag === 'textarea') return tag;
    if (tag === 'input') return ((el as HTMLInputElement).getAttribute('type') ?? 'text').toLowerCase();
    return '';
  };

  document.querySelectorAll(`[${args.attr}]`).forEach((el) => el.removeAttribute(args.attr));

  const forms: PageForm[] = [];
  const formIndex = new Map<HTMLFormElement, number>();
  const formOccurrences = new Map<string, number>();
  let nextId = 0;
  Array.from(document.forms).forEach((form) => {
    if (!isVisible(form)) return;
    const region = regionOf(form);
    const name =
      clean(form.getAttribute('aria-label') ?? form.getAttribute('name') ?? form.id) ||
      clean(form.querySelector('h1,h2,h3,legend')?.textContent);
    const fieldNames = Array.from(form.elements)
      .map((f) => (f as HTMLInputElement).name || (f as HTMLElement).id)
      .filter(Boolean)
      .join(',');
    const signature = `${region ?? '-'}|form|${name}|${fieldNames}`;
    const occurrence = formOccurrences.get(signature) ?? 0;
    formOccurrences.set(signature, occurrence + 1);
    const id = nextId++;
    form.setAttribute(args.attr, String(id));
    formIndex.set(form, forms.length);
    forms.push({ id, signature, occurrence, region, name });
  });

  const elements: PageElement[] = [];
  const occurrences = new Map<string, number>();
  const seen = new Set<Element>();
  document.querySelectorAll(ACTIONABLE).forEach((el) => {
    if (seen.has(el)) return;
    seen.add(el);
    if (!isVisible(el) || isDisabled(el)) return;
    if (args.excludeSelectors.some((s) => el.closest(s))) return;
    if ((el as HTMLInputElement).readOnly) return;

    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') ?? '';
    const inputType = inputTypeOf(el);
    const name = accessibleName(el);
    const region = regionOf(el);
    const form = (el as HTMLInputElement).form ?? el.closest('form');
    const fIndex = form && formIndex.has(form) ? (formIndex.get(form) as number) : null;
    const isSubmit =
      fIndex !== null &&
      ((tag === 'button' && (el.getAttribute('type') ?? 'submit').toLowerCase() === 'submit') ||
        (tag === 'input' && (inputType === 'submit' || inputType === 'image')));
    const isField = (tag === 'input' || tag === 'textarea' || tag === 'select') && FIELD_TYPES.includes(inputType);

    let href: string | null = null;
    let external = false;
    let opensNewTab = false;
    let download = false;
    if (tag === 'a') {
      const anchor = el as HTMLAnchorElement;
      href = anchor.href;
      try {
        const url = new URL(anchor.href, location.href);
        external = url.origin !== location.origin;
      } catch {
        external = true;
      }
      opensNewTab = anchor.target === '_blank';
      download = anchor.hasAttribute('download');
    }

    const maxLengthAttr = el.getAttribute('maxlength');
    const maxLength = maxLengthAttr !== null && /^\d+$/.test(maxLengthAttr) ? Number(maxLengthAttr) : null;
    const options =
      tag === 'select' ? Array.from((el as HTMLSelectElement).options).map((o) => o.value) : [];

    const signature = `${region ?? '-'}|${tag}|${role}|${inputType}|${name}`;
    const occurrence = occurrences.get(signature) ?? 0;
    occurrences.set(signature, occurrence + 1);
    const id = nextId++;
    el.setAttribute(args.attr, String(id));
    elements.push({
      id,
      signature,
      occurrence,
      tag,
      role,
      name,
      inputType,
      region,
      href,
      external,
      opensNewTab,
      download,
      formIndex: fIndex,
      isSubmit,
      isField,
      maxLength,
      options,
    });
  });

  const hasDialog = !!document.querySelector('dialog[open],[role=dialog],[role=alertdialog],[aria-modal=true]');
  const hasErrorMessage = !!document.querySelector('[role=alert],[aria-live=assertive],.error,[class*="error"]');
  return { pathname: location.pathname, elements, forms, hasDialog, hasErrorMessage };
}

/**
 * 操作の前に呼び、DOM の変化を数え始める。
 * 先にフォーカスを外して再描画を待つのは、入力欄のフォーカスが外れたときの見た目の切り替え
 * （背景色のクラスなど）を「操作で何かが起きた」と数えないようにするため。
 */
export async function installChangeWatcher(): Promise<void> {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) active.blur();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const w = window as unknown as { __e2eExplorerChanges?: number; __e2eExplorerObserver?: MutationObserver };
  w.__e2eExplorerObserver?.disconnect();
  w.__e2eExplorerChanges = 0;
  const observer = new MutationObserver((records) => {
    w.__e2eExplorerChanges = (w.__e2eExplorerChanges ?? 0) + records.length;
  });
  observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  w.__e2eExplorerObserver = observer;
}

/** 変化の数を返す。ページごと入れ替わって見張りが消えていたら -1（＝変化あり）。 */
export function readChangeWatcher(): number {
  const w = window as unknown as { __e2eExplorerChanges?: number; __e2eExplorerObserver?: MutationObserver };
  if (w.__e2eExplorerChanges === undefined) return -1;
  w.__e2eExplorerObserver?.disconnect();
  return w.__e2eExplorerChanges;
}

export interface BlankInspection {
  textLength: number;
  mediaCount: number;
}

export function inspectBlank(): BlankInspection {
  const text = (document.body?.innerText ?? '').trim();
  const media = Array.from(document.querySelectorAll('img,svg,canvas,video,iframe')).filter((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  return { textLength: text.length, mediaCount: media.length };
}

export interface LayoutInspection {
  scrollWidth: number;
  clientWidth: number;
  protruding: { selector: string; right: number }[];
  textOverflow: { selector: string; scrollWidth: number; clientWidth: number }[];
}

export function inspectLayout(args: { tolerance: number; limit: number }): LayoutInspection {
  const doc = document.documentElement;
  const viewportWidth = window.innerWidth;

  const cssPath = (el: Element): string => {
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node !== document.body && parts.length < 5) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(`${part}#${node.id}`);
        break;
      }
      const parent: Element | null = node.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter((c) => c.tagName === node!.tagName);
        if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(' > ');
  };

  const clipsHorizontally = (el: Element): boolean => {
    const overflowX = getComputedStyle(el).overflowX;
    return overflowX === 'hidden' || overflowX === 'clip' || overflowX === 'auto' || overflowX === 'scroll';
  };

  const hasClippingAncestor = (el: Element): boolean => {
    let node = el.parentElement;
    while (node && node !== document.body && node !== doc) {
      if (clipsHorizontally(node)) return true;
      node = node.parentElement;
    }
    return false;
  };

  const protruding: LayoutInspection['protruding'] = [];
  const reported: Element[] = [];
  const textOverflow: LayoutInspection['textOverflow'] = [];

  for (const el of Array.from(document.body?.querySelectorAll('*') ?? [])) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    // 一部だけ右端からはみ出す要素。完全に画面外の要素は、閉じたメニューなど意図した配置とみなす
    if (
      protruding.length < args.limit &&
      rect.left < viewportWidth &&
      rect.right > viewportWidth + args.tolerance &&
      !reported.some((r) => r.contains(el)) &&
      !hasClippingAncestor(el)
    ) {
      protruding.push({ selector: cssPath(el), right: Math.round(rect.right) });
      reported.push(el);
    }

    // 子要素を持たない文字の要素が、自分の枠から横にはみ出している
    if (
      textOverflow.length < args.limit &&
      el.children.length === 0 &&
      (el.textContent ?? '').trim().length > 0 &&
      style.display !== 'inline' &&
      !clipsHorizontally(el) &&
      el.clientWidth > 0 &&
      el.scrollWidth > el.clientWidth + args.tolerance
    ) {
      textOverflow.push({ selector: cssPath(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
    }
  }
  return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, protruding, textOverflow };
}

/** ページの未処理の Promise の reject を集める（init script として全ページに入れる）。 */
export function rejectionCollectorScript(): void {
  const w = window as unknown as { __e2eExplorerRejections?: string[] };
  w.__e2eExplorerRejections = [];
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as unknown;
    const message =
      reason instanceof Error ? `${reason.name}: ${reason.message}` : typeof reason === 'string' ? reason : JSON.stringify(reason);
    w.__e2eExplorerRejections?.push(message ?? 'undefined');
  });
}

export function drainRejections(): string[] {
  const w = window as unknown as { __e2eExplorerRejections?: string[] };
  const items = w.__e2eExplorerRejections ?? [];
  w.__e2eExplorerRejections = [];
  return items;
}

export function isFormNativelyInvalid(args: { attr: string; id: number }): boolean {
  const form = document.querySelector(`[${args.attr}="${args.id}"]`);
  if (!(form instanceof HTMLFormElement)) return false;
  return !form.checkValidity();
}

/** 送信ボタンのないフォームを送信する（Enter キーでの送信と同じく submit イベントを起こす）。 */
export function requestSubmit(args: { attr: string; id: number }): void {
  const form = document.querySelector(`[${args.attr}="${args.id}"]`);
  if (form instanceof HTMLFormElement) form.requestSubmit();
}
