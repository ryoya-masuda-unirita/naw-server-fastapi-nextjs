import type { RequestHandler } from 'msw';

// `mocks/handlers/*.ts`（index.ts 以外）の `xxxHandlers` という名前の配列を、すべて自動で集める。
// 画面を足すときは `mocks/handlers/{機能}.ts` を作って `export const xxxHandlers = [...]` と書くだけでよい
// （このファイルは触らない。並列で画面を作っても、ここで衝突しない）。
// テスト全体（src/test/setup.ts）の既定の応答になる。テストごとの応答は server.use で上書きする。
const modules = import.meta.glob<Record<string, unknown>>(['./*.ts', '!./index.ts'], {
  eager: true,
});

const HANDLERS_EXPORT_SUFFIX = 'Handlers';

/** 全モジュールの `xxxHandlers` 配列を、ファイル名順に 1 つへまとめる */
function collectHandlers(): RequestHandler[] {
  return Object.keys(modules)
    .sort()
    .flatMap((path) =>
      Object.entries(modules[path])
        .filter(
          ([name, value]) => name.endsWith(HANDLERS_EXPORT_SUFFIX) && Array.isArray(value)
        )
        .flatMap(([, value]) => value as RequestHandler[])
    );
}

export const handlers: RequestHandler[] = collectHandlers();
