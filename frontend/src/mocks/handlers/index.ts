import { adminTemplateHandlers } from './admin-templates';
import { authHandlers } from './auth';

// 機能ごとのハンドラーファイル（mocks/handlers/{機能}.ts）をここに足す。
// テスト全体（src/test/setup.ts）の既定の応答になる。テストごとの応答は server.use で上書きする。
export const handlers = [...authHandlers, ...adminTemplateHandlers];
