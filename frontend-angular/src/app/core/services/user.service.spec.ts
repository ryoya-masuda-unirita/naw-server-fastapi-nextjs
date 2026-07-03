import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { provideQueryClient, QueryClient } from '@tanstack/angular-query-experimental';
import { UserService } from './user.service';
import { ApiClientService } from './api-client';
import { API_PATHS } from '@core/constants/api-paths.config';

function buildApiClientMock() {
  return {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  };
}

const FIXTURE_PROFILE = {
  id: 'user-id-1',
  loginId: 'test@example.com',
  name: 'テスト ユーザー',
  role: 'USER',
  loginKey: null,
};

describe('UserService', () => {
  let service: UserService;
  let mockApi: ReturnType<typeof buildApiClientMock>;

  beforeEach(() => {
    mockApi = buildApiClientMock();
    TestBed.configureTestingModule({
      providers: [
        UserService,
        { provide: ApiClientService, useValue: mockApi },
        provideQueryClient(new QueryClient()),
      ],
    });
    service = TestBed.inject(UserService);
  });

  describe('getProfile', () => {
    test('プロフィールを取得できること', async () => {
      mockApi.get.mockResolvedValue(FIXTURE_PROFILE);

      const result = await service.getProfile();

      expect(result.loginId).toBe('test@example.com');
      expect(result.name).toBe('テスト ユーザー');
      expect(mockApi.get).toHaveBeenCalledWith(API_PATHS.USERS.PROFILE);
    });

    test('取得中はローディング状態になること', async () => {
      let resolveGet!: (v: typeof FIXTURE_PROFILE) => void;
      mockApi.get.mockReturnValue(
        new Promise((r) => {
          resolveGet = r;
        }),
      );

      const promise = service.getProfile();
      expect(service.isLoadingProfile()).toBe(true);

      resolveGet(FIXTURE_PROFILE);
      await promise;
    });

    test('取得完了後はローディングが解除されること', async () => {
      mockApi.get.mockResolvedValue(FIXTURE_PROFILE);

      await service.getProfile();

      expect(service.isLoadingProfile()).toBe(false);
    });
  });

  describe('updateProfile', () => {
    test('パスワードを更新できること', async () => {
      mockApi.patch.mockResolvedValue({});

      await service.updateProfile('newPassword123');

      expect(mockApi.patch).toHaveBeenCalledWith(API_PATHS.USERS.PROFILE, {
        password: 'newPassword123',
      });
    });

    test('更新中はローディング状態になること', async () => {
      let resolvePatch!: (v: object) => void;
      mockApi.patch.mockReturnValue(
        new Promise((r) => {
          resolvePatch = r;
        }),
      );

      const promise = service.updateProfile('newPassword123');
      expect(service.isUpdatingProfile()).toBe(true);

      resolvePatch({});
      await promise;
    });

    test('更新完了後はローディングが解除されること', async () => {
      mockApi.patch.mockResolvedValue({});

      await service.updateProfile('newPassword123');

      expect(service.isUpdatingProfile()).toBe(false);
    });
  });
});
