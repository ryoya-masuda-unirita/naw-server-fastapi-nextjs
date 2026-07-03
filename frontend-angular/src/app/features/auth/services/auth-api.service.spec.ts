/**
 * NAW-965: `AuthApiService` の単体テスト。
 *
 * `getSession` は ApiClientService.get('/auth') の結果を返し、例外時は null。
 * `logout` は HttpClient で POST /auth/logout（body null, responseType text）。
 * `injectMutation` 用に QueryClient を TestBed に供給する。
 */
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientService } from '@core/services/api-client';
import { AuthApiService } from '@features/auth/services/auth-api.service';
import type { BackendAuthResponse, LoginSuccessResponse } from '@features/auth/types';

const FIXTURE_BACKEND_AUTH: BackendAuthResponse = {
  id: 'user-1',
  name: 'Alice',
  role: 'USER',
  tenant_id: 'tenant-from-api',
};

const FIXTURE_LOGIN_KEY_RESPONSE: LoginSuccessResponse = {
  loginStatus: 'SUCCESS',
  id: 'user-1',
  name: 'Alice',
  role: 'USER',
  token: 'token',
  groups: [{ groupId: 'group-1', groupAdmin: false }],
};

const testQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe('AuthApiService（認証 API）', () => {
  describe('getSession メソッド', () => {
    let service: AuthApiService;
    let apiGet: ReturnType<typeof vi.fn>;

    // 各 it の直前: ApiClient をモックに差し替え、TanStack Query + AuthApiService + フェイク HTTP を注入する
    beforeEach(() => {
      TestBed.resetTestingModule();
      apiGet = vi.fn();
      TestBed.configureTestingModule({
        providers: [
          provideTanStackQuery(testQueryClient()),
          AuthApiService,
          { provide: ApiClientService, useValue: { get: apiGet, post: vi.fn() } },
          provideHttpClient(withInterceptors([])),
          provideHttpClientTesting(),
        ],
      });
      service = TestBed.inject(AuthApiService);
    });

    // 本実装: api.get<BackendAuthResponse>('/auth') の戻り値をそのまま return
    it('サーバーからログイン中のユーザー情報を取得できる', async () => {
      // Arrange
      apiGet.mockResolvedValue(FIXTURE_BACKEND_AUTH);

      // Act
      const result = await service.getSession();

      // Assert
      expect(result).toEqual(FIXTURE_BACKEND_AUTH);
      expect(apiGet).toHaveBeenCalledWith('/auth');
    });

    // 本実装: try/catch で api.get の例外を握りつぶし null を return
    it('セッション取得に失敗したときは未ログイン扱い（null）にする', async () => {
      // Arrange
      apiGet.mockRejectedValue(new Error('network'));

      // Act
      const result = await service.getSession();

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('loginWithKey メソッド', () => {
    let service: AuthApiService;
    let apiPost: ReturnType<typeof vi.fn>;

    // 各 it の直前: ApiClient をモックに差し替え、TanStack Query + AuthApiService を注入する
    beforeEach(() => {
      TestBed.resetTestingModule();
      apiPost = vi.fn();
      TestBed.configureTestingModule({
        providers: [
          provideTanStackQuery(testQueryClient()),
          AuthApiService,
          { provide: ApiClientService, useValue: { get: vi.fn(), post: apiPost } },
          provideHttpClient(withInterceptors([])),
          provideHttpClientTesting(),
        ],
      });
      service = TestBed.inject(AuthApiService);
    });

    // 本実装: api.post<LoginSuccessResponse>('/auth/login-key', { loginKey }) の戻り値をそのまま return
    it('loginKey を /auth/login-key に POST して認証結果を返す', async () => {
      // Arrange
      apiPost.mockResolvedValue(FIXTURE_LOGIN_KEY_RESPONSE);

      // Act
      const result = await service.loginWithKey('key-123');

      // Assert
      expect(result).toEqual(FIXTURE_LOGIN_KEY_RESPONSE);
      expect(apiPost).toHaveBeenCalledWith('/auth/login-key', { loginKey: 'key-123' });
    });

    // 本実装: api.post の例外はそのまま伝播する（呼び出し側で握りつぶす）
    it('認証に失敗したときは例外を伝播する', async () => {
      // Arrange
      apiPost.mockRejectedValue(new Error('invalid login key'));

      // Act & Assert
      await expect(service.loginWithKey('bad-key')).rejects.toThrow('invalid login key');
    });
  });

  describe('logout メソッド', () => {
    let service: AuthApiService;
    let httpMock: HttpTestingController;

    // 各 it の直前: 本物 ApiClient + HttpClient で logout を検証するための TestBed と HttpTestingController を用意する
    beforeEach(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideTanStackQuery(testQueryClient()),
          AuthApiService,
          ApiClientService,
          provideHttpClient(withInterceptors([])),
          provideHttpClientTesting(),
        ],
      });
      service = TestBed.inject(AuthApiService);
      httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
      // verify: 未処理の HTTP（expectOne/flush し忘れ・余計な送信）があれば失敗
      httpMock.verify();
    });

    // 本実装: http.post('/auth/logout', null, { responseType: 'text' }) を firstValueFrom で await
    it('ログアウトAPIを呼び出してサーバー側のセッションを終了する', async () => {
      // Arrange
      // （共通 beforeEach で HttpClient 済み）

      // Act
      const logoutPromise = service.logout();
      const req = httpMock.expectOne('/auth/logout');
      req.flush('');
      await logoutPromise;

      // Assert
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBeNull();
      expect(req.request.responseType).toBe('text');
    });
  });
});
