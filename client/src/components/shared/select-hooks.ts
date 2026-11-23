import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Angular の `model()` 相当。
 * 移植元の select 系は `[value]` だけ渡して `(selectionChange)` で受ける使い方もあり、
 * その場合も部品の中で選んだ値が表示に残る（親が値を戻さなくても内部の値が変わる）。
 * React でも同じ動きにするため、props の値が変わったら取り込みつつ、内部でも値を持つ。
 */
export function useModelState<T>(value: T, onValueChange?: (value: T) => void): [T, (next: T) => void] {
  const [inner, setInner] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  // 親から渡された値が変わったときだけ内部の値を合わせる（React 公式の「前回の props を state に持つ」パターン）
  if (!Object.is(prevValue, value)) {
    setPrevValue(value);
    setInner(value);
  }
  const update = useCallback(
    (next: T) => {
      setInner(next);
      onValueChange?.(next);
    },
    [onValueChange],
  );
  return [inner, update];
}

/** document / window のリスナーや非同期コールバックから最新の値・関数を参照するための ref */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  // レイアウトエフェクトで更新し、rAF・マイクロタスク・イベントより先に最新化する
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** 移植元の `@HostListener('document:click')` */
export function useDocumentClick(handler: (event: MouseEvent) => void): void {
  const handlerRef = useLatestRef(handler);
  useEffect(() => {
    const listener = (event: MouseEvent) => handlerRef.current(event);
    document.addEventListener('click', listener);
    return () => document.removeEventListener('click', listener);
  }, [handlerRef]);
}

/** 移植元の `@HostListener('window:resize')` / `@HostListener('window:scroll')` */
export function useWindowEvent(name: 'resize' | 'scroll', handler: () => void): void {
  const handlerRef = useLatestRef(handler);
  useEffect(() => {
    const listener = () => handlerRef.current();
    window.addEventListener(name, listener);
    return () => window.removeEventListener(name, listener);
  }, [name, handlerRef]);
}

/** 画面外で切り取られないよう、最も近いスクロール／overflow 指定の祖先の上下端を返す（移植元 getClippingAncestorBounds） */
export function getClippingAncestorBounds(host: HTMLElement): { top: number; bottom: number } {
  let el = host.parentElement;
  while (el && el !== document.body) {
    const { overflow, overflowY } = window.getComputedStyle(el);
    if (/auto|scroll|hidden/.test(overflow) || /auto|scroll|hidden/.test(overflowY)) {
      const rect = el.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    }
    el = el.parentElement;
  }
  return { top: 0, bottom: window.innerHeight };
}
