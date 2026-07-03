/**
 * NAW-965: `authGuard` の単体テスト。
 *
 * `await authStore.ensureInitialized()` の後、`isAuthenticated()` が true なら true、
 * そうでなければ `router.createUrlTree([ROUTES.AUTH.LOGIN])` を返す。
 */
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@core/constants/routes.config';
import { authGuard } from '@core/guards/auth.guard';
import { AuthStore } from '@core/stores/auth.store';

describe('authGuard（認証ガード）', () => {
  let ensureInitialized: ReturnType<typeof vi.fn>;
  let isAuthenticated: ReturnType<typeof vi.fn>;
  let createUrlTree: ReturnType<typeof vi.fn>;

  // 各 it の直前: AuthStore / Router をモックに差し替え、ガード内 inject が解決できる TestBed を組む
  beforeEach(() => {
    TestBed.resetTestingModule();
    ensureInitialized = vi.fn().mockResolvedValue(undefined);
    isAuthenticated = vi.fn();
    createUrlTree = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthStore,
          useValue: { ensureInitialized, isAuthenticated },
        },
        { provide: Router, useValue: { createUrlTree } },
      ],
    });
  });

  // 本実装: ensureInitialized 後に isAuthenticated() が true なら boolean true を return
  it('ログイン済みのユーザーは、保護された画面に入れる', async () => {
    // Arrange
    isAuthenticated.mockReturnValue(true);

    // Act
    const guard = authGuard as CanActivateFn;
    const result = await TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );

    // Assert
    expect(result).toBe(true);
    expect(ensureInitialized).toHaveBeenCalledTimes(1);
  });

  // 本実装: 未認証時は router.createUrlTree([ROUTES.AUTH.LOGIN]) を return
  it('未ログインのユーザーは、ログイン画面へ誘導される', async () => {
    // Arrange
    const urlTree = { commands: [ROUTES.AUTH.LOGIN] } as unknown as UrlTree;
    isAuthenticated.mockReturnValue(false);
    createUrlTree.mockReturnValue(urlTree);

    // Act
    const guard = authGuard as CanActivateFn;
    const result = await TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );

    // Assert
    expect(createUrlTree).toHaveBeenCalledWith([ROUTES.AUTH.LOGIN]);
    expect(result).toBe(urlTree);
  });
});
