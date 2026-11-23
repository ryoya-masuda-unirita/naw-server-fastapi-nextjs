// node 環境で api-client・store が参照するブラウザの値だけを用意する
const storage = new Map<string, string>();

Object.defineProperty(globalThis, 'window', {
  value: { location: { origin: 'http://localhost:5173' } },
  configurable: true,
});
Object.defineProperty(globalThis, 'sessionStorage', {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
    clear: () => storage.clear(),
  },
  configurable: true,
});
