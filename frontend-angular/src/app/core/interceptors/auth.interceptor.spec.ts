/**
 * NAW-965: `authInterceptor` の単体テスト。
 *
 * 全リクエストに `withCredentials: true` を付け、`resolveTenantId()` が空でないときだけ
 * `X-Tenant-ID` ヘッダーを付与する。テナント値は sessionStorage + hostname で制御する。
 */
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '@core/constants';
import { authInterceptor } from '@core/interceptors/auth.interceptor';

const ORIGINAL_WINDOW_LOCATION: Location = window.location;

function stubLocationHostname(hostname: string): void {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: {
      ancestorOrigins: {} as DOMStringList,
      assign: () => undefined,
      hash: '',
      host: hostname,
      hostname,
      href: `http://${hostname}/`,
      origin: `http://${hostname}`,
      pathname: '/',
      port: '',
      protocol: 'http:',
      reload: () => undefined,
      replace: () => undefined,
      search: '',
      toString: () => `http://${hostname}/`,
    } as unknown as Location,
  });
}

function restoreWindowLocation(): void {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: ORIGINAL_WINDOW_LOCATION,
  });
}

describe('authInterceptor（認証付加ヘッダー）', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  // 各 it の直前: location を戻し、session と TestBed をリセットして HttpClient を組み立てる
  beforeEach(() => {
    restoreWindowLocation();
    sessionStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // verify: 未処理の HTTP（expectOne/flush し忘れ・余計な送信）があれば失敗
    httpMock.verify();
    // モックした window.location を後続のテストファイルへ漏らさない
    // （vmThreads は同一ワーカー内でグローバルを共有しうるため、
    //  history.replaceState 依存のテスト（例: login-key.initializer）を壊す）。
    restoreWindowLocation();
  });

  // 本実装: tenantId が truthy なら setHeaders に X-Tenant-ID を入れ、常に withCredentials: true
  it('テナントが分かるとき、APIリクエストにテナント情報を付ける', () => {
    // Arrange
    sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, 't-1');
    stubLocationHostname('app.example.com');

    // Act
    http.get('/api/dummy').subscribe();
    const req = httpMock.expectOne('/api/dummy');
    req.flush({});

    // Assert
    expect(req.request.headers.get('X-Tenant-ID')).toBe('t-1');
    expect(req.request.withCredentials).toBe(true);
  });

  // 本実装: tenantId が空文字のとき headers は空のまま（X-Tenant-ID は付けない）、withCredentials は true
  it('テナントが不明なとき、テナント用のヘッダーは付けない', () => {
    // Arrange
    sessionStorage.removeItem(STORAGE_KEYS.TENANT_ID);
    stubLocationHostname('localhost');

    // Act
    http.get('/api/dummy').subscribe();
    const req = httpMock.expectOne('/api/dummy');
    req.flush({});

    // Assert
    expect(req.request.headers.has('X-Tenant-ID')).toBe(false);
    expect(req.request.withCredentials).toBe(true);
  });

  // 本実装: req.clone({ ..., withCredentials: true }) は tenantId の有無に関係なく常に true
  it('すべてのAPI通信でログイン用Cookieを送る', () => {
    // Arrange
    sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, 'any');
    stubLocationHostname('tenant.example.com');

    // Act
    http.get('/api/dummy').subscribe();
    const req = httpMock.expectOne('/api/dummy');
    req.flush({});

    // Assert
    expect(req.request.withCredentials).toBe(true);
  });
});
