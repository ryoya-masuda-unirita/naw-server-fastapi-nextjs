import { effect, signal, type Signal } from '@angular/core';

/**
 * Returns a debounced read-only signal that only updates after
 * the source signal has been stable for `delayMs` milliseconds.
 *
 * Must be called in an injection context (constructor, field initializer,
 * or inside `runInInjectionContext`).
 *
 * @example
 * readonly query = model<string>('');
 * readonly debouncedQuery = debounceSignal(this.query, 300);
 */
export function debounceSignal<T>(source: Signal<T>, delayMs = 300): Signal<T> {
  const debounced = signal<T>(source());
  let timer: ReturnType<typeof setTimeout> | null = null;

  effect(() => {
    const value = source();
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => debounced.set(value), delayMs);
  });

  return debounced.asReadonly();
}
