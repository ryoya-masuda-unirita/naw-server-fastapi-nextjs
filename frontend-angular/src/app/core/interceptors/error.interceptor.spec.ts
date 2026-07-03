/**
 * NAW-965: `errorInterceptor` の単体テスト。
 *
 * 全 HTTP エラーで Toast を表示する。401 かつ URL に `/auth` を含まないときだけ
 * sessionStorage を破棄して `/auth/login` へリダイレクトする。
 * `/auth` を含む URL（`/auth/login`, `/api/auth` など）の 401 では破棄・リダイレクトしない。
 */
import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_PATHS, STORAGE_KEYS } from '@core/constants';
import { ROUTES } from '@core/constants/routes.config';
import { errorInterceptor } from '@core/interceptors/error.interceptor';
import { SKIP_GLOBAL_ERROR_TOAST } from '@core/interceptors/http-context.tokens';
import { ToastService } from '@core/services/toast.service';

describe('errorInterceptor（HTTP エラー処理）', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let toastError: ReturnType<typeof vi.fn>;
  /** `Router.navigateByUrl` 呼び出しだけ検証する最小スタブ（本物の Router ではない） */
  let navigateByUrl: ReturnType<typeof vi.fn>;

  // 各 it の直前: session・Router モック・Toast モックを用意し、errorInterceptor 付き HttpClient とフェイク HTTP を注入する
  beforeEach(() => {
    sessionStorage.clear();
    toastError = vi.fn();
    navigateByUrl = vi.fn().mockResolvedValue(true);
    TestBed.resetTestingModule();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: ToastService, useValue: { error: toastError } },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // verify: 未処理の HTTP（expectOne/flush し忘れ・余計な送信）があれば失敗
    httpMock.verify();
  });

  describe('401 未認証', () => {
    // 本実装: 401 かつ !url.includes('/auth') のとき USER/TENANT_ID を remove し Router で /auth/login へ遷移（Toast も表示）
    it('通常のAPIでセッション切れのとき、user_idとtenant_idを消してログイン画面へ移す', () => {
      // Arrange
      sessionStorage.setItem(STORAGE_KEYS.USER, '{}');
      sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, 'x');

      // Act
      http.get('/api/dummy').subscribe({ error: () => undefined });
      // フェイクサーバーが401を返す
      const req = httpMock.expectOne('/api/dummy');
      req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      // Assert
      expect(sessionStorage.getItem(STORAGE_KEYS.USER)).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEYS.TENANT_ID)).toBeNull();
      expect(navigateByUrl).toHaveBeenCalledWith(ROUTES.AUTH.LOGIN);
      expect(toastError).toHaveBeenCalled();
    });

    // 本実装: url.includes(API_PATHS.AUTH.SESSION) が true のため 401 でも session 破棄・リダイレクトは行わない（Toast のみ）
    it('ログイン画面でログイン失敗時は、sessionStorageのuserIdとtenantIdを維持し強制移動もしない', () => {
      // Arrange
      sessionStorage.setItem(STORAGE_KEYS.USER, '{}');
      sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, 'x');

      // Act
      http.post(API_PATHS.AUTH.LOGIN, {}).subscribe({ error: () => undefined });
      // フェイクサーバーが401を返す
      const req = httpMock.expectOne(API_PATHS.AUTH.LOGIN);
      req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      // Assert
      expect(sessionStorage.getItem(STORAGE_KEYS.USER)).toBe('{}');
      expect(sessionStorage.getItem(STORAGE_KEYS.TENANT_ID)).toBe('x');
      expect(navigateByUrl).not.toHaveBeenCalled();
      expect(toastError).not.toHaveBeenCalled();
    });

    // 本実装: API_PATHS.AUTH.SESSION も includes(API_PATHS.AUTH.SESSION) に該当するため interceptor では破棄しない（AuthStore が後段で処理しうる）
    it('セッション確認APIで未ログインでも、保存データを消さず強制移動もしない', () => {
      // Arrange
      sessionStorage.setItem(STORAGE_KEYS.USER, '{}');
      sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, 'x');

      // Act
      http.get(API_PATHS.AUTH.SESSION).subscribe({ error: () => undefined });
      const req = httpMock.expectOne(API_PATHS.AUTH.SESSION);
      req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      // Assert
      expect(sessionStorage.getItem(STORAGE_KEYS.USER)).toBe('{}');
      expect(sessionStorage.getItem(STORAGE_KEYS.TENANT_ID)).toBe('x');
      expect(navigateByUrl).not.toHaveBeenCalled();
      expect(toastError).toHaveBeenCalled();
    });
  });

  describe('エラー時のトースト', () => {
    // 本実装: catchError 内でステータスに関係なく先に toastService.error を呼ぶ
    it('サーバーエラーなどでも、ユーザーにエラーメッセージを表示する', () => {
      // Arrange
      // （共通 beforeEach で Toast モック済み）

      // Act
      http.get('/api/dummy').subscribe({ error: () => undefined });
      const req = httpMock.expectOne('/api/dummy');
      req.flush('Server Error', { status: 500, statusText: 'Internal Server Error' });

      // Assert
      expect(toastError).toHaveBeenCalled();
    });

    it('パスワード更新APIの429ではトーストを表示しない', () => {
      http.post(API_PATHS.AUTH.PASSWORD_RESET, {}).subscribe({ error: () => undefined });
      const req = httpMock.expectOne(API_PATHS.AUTH.PASSWORD_RESET);
      req.flush({ message: 'locked' }, { status: 429, statusText: 'Too Many Requests' });

      expect(toastError).not.toHaveBeenCalled();
    });

    it('ログインAPIの429ではトーストを表示しない', () => {
      http.post(API_PATHS.AUTH.LOGIN, {}).subscribe({ error: () => undefined });
      const req = httpMock.expectOne(API_PATHS.AUTH.LOGIN);
      req.flush({ message: 'locked' }, { status: 429, statusText: 'Too Many Requests' });

      expect(toastError).not.toHaveBeenCalled();
    });

    it('ログインAPIの401ではトーストを表示しない', () => {
      http.post(API_PATHS.AUTH.LOGIN, {}).subscribe({ error: () => undefined });
      const req = httpMock.expectOne(API_PATHS.AUTH.LOGIN);
      req.flush({ message: 'Invalid credentials' }, { status: 401, statusText: 'Unauthorized' });

      expect(toastError).not.toHaveBeenCalled();
    });

    it('ログインAPIの403ではトーストを表示しない', () => {
      http.post(API_PATHS.AUTH.LOGIN, {}).subscribe({ error: () => undefined });
      const req = httpMock.expectOne(API_PATHS.AUTH.LOGIN);
      req.flush({ message: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });

      expect(toastError).not.toHaveBeenCalled();
    });

    it('SKIP_GLOBAL_ERROR_TOAST が設定されたリクエストではトーストを表示しない', () => {
      http
        .post('/api/dummy', {}, { context: new HttpContext().set(SKIP_GLOBAL_ERROR_TOAST, true) })
        .subscribe({ error: () => undefined });
      const req = httpMock.expectOne('/api/dummy');
      req.flush({ error: 'raw api error' }, { status: 400, statusText: 'Bad Request' });

      expect(toastError).not.toHaveBeenCalled();
    });
  });

  describe('エラーメッセージの i18n 化', () => {
    it('500エラーでは COMMON.MESSAGES.ERROR.SERVER_ERROR が表示されること', () => {
      http.get('/api/dummy').subscribe({ error: () => undefined });
      const req = httpMock.expectOne('/api/dummy');
      req.flush(
        { error: 'Internal server error' },
        { status: 500, statusText: 'Internal Server Error' },
      );

      expect(toastError).toHaveBeenCalledWith('COMMON.MESSAGES.ERROR.SERVER_ERROR');
    });

    it('403エラーでは COMMON.MESSAGES.ERROR.FORBIDDEN が表示されること', () => {
      http.get('/api/dummy').subscribe({ error: () => undefined });
      const req = httpMock.expectOne('/api/dummy');
      req.flush({ error: 'Access denied' }, { status: 403, statusText: 'Forbidden' });

      expect(toastError).toHaveBeenCalledWith('COMMON.MESSAGES.ERROR.FORBIDDEN');
    });

    it('404エラーでは COMMON.MESSAGES.ERROR.NOT_FOUND が表示されること', () => {
      http.get('/api/dummy').subscribe({ error: () => undefined });
      const req = httpMock.expectOne('/api/dummy');
      req.flush({ error: 'Not found' }, { status: 404, statusText: 'Not Found' });

      expect(toastError).toHaveBeenCalledWith('COMMON.MESSAGES.ERROR.NOT_FOUND');
    });

    it('400エラーでは COMMON.MESSAGES.ERROR.GENERAL が表示されること', () => {
      http.get('/api/dummy').subscribe({ error: () => undefined });
      const req = httpMock.expectOne('/api/dummy');
      req.flush({ error: 'Bad request' }, { status: 400, statusText: 'Bad Request' });

      expect(toastError).toHaveBeenCalledWith('COMMON.MESSAGES.ERROR.GENERAL');
    });

    it('トーストにはバックエンドの生エラー文字列が含まれないこと', () => {
      const rawMessage = 'Internal error: cannot read property X of undefined';
      http.get('/api/dummy').subscribe({ error: () => undefined });
      const req = httpMock.expectOne('/api/dummy');
      req.flush({ error: rawMessage }, { status: 500, statusText: 'Internal Server Error' });

      expect(toastError).not.toHaveBeenCalledWith(rawMessage);
      expect(toastError).not.toHaveBeenCalledWith(expect.stringContaining('Internal error'));
    });
  });
});
