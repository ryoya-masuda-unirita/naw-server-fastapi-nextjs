import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// React Flow が jsdom にない API を使うため、最小限の代わりを置く
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = ResizeObserverStub;

class DOMMatrixReadOnlyStub {
  m22 = 1;
  constructor(_transform?: string) {}
}
// @ts-expect-error jsdom には DOMMatrixReadOnly がない
globalThis.DOMMatrixReadOnly = DOMMatrixReadOnlyStub;
