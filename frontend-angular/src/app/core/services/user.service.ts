/**
 * User Service - profile API and admin user CRUD (mock)
 */
import { computed, inject, Injectable, signal } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { MOCK_USERS, User } from '../constants/mock-data';
import { ApiClientService } from './api-client';
import { API_PATHS } from '../constants/api-paths.config';
import type { UserProfile } from '@app-types/user.types';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private readonly api = inject(ApiClientService);

  readonly isLoadingProfile = signal<boolean>(false);
  readonly isUpdatingProfile = signal<boolean>(false);

  readonly profileQuery = injectQuery(() => ({
    queryKey: ['user', 'profile'],
    queryFn: (): Promise<UserProfile> => this.api.get<UserProfile>(API_PATHS.USERS.PROFILE),
  }));

  async getProfile(): Promise<UserProfile> {
    this.isLoadingProfile.set(true);
    try {
      return await this.api.get<UserProfile>(API_PATHS.USERS.PROFILE);
    } finally {
      this.isLoadingProfile.set(false);
    }
  }

  async updateProfile(password?: string): Promise<void> {
    this.isUpdatingProfile.set(true);
    try {
      await this.api.patch(API_PATHS.USERS.PROFILE, { password });
    } finally {
      this.isUpdatingProfile.set(false);
    }
  }

  private usersSignal = signal<User[]>([...MOCK_USERS]);
  readonly users = this.usersSignal.asReadonly();

  readonly totalUsers = computed(() => this.usersSignal().length);
  readonly activeUsers = computed(
    () => this.usersSignal().filter((u) => u.status === 'active').length,
  );

  getUserById(id: string): User | undefined {
    return this.usersSignal().find((u) => u.id === id);
  }

  createUser(userData: Omit<User, 'id' | 'createdAt'>): User {
    const newUser: User = {
      ...userData,
      id: this.generateId(),
      createdAt: new Date(),
    };

    this.usersSignal.update((users) => [...users, newUser]);
    return newUser;
  }

  updateUser(id: string, userData: Partial<User>): User | null {
    const index = this.usersSignal().findIndex((u) => u.id === id);

    if (index === -1) return null;

    const updatedUser = { ...this.usersSignal()[index], ...userData };

    this.usersSignal.update((users) => {
      const newUsers = [...users];
      newUsers[index] = updatedUser;
      return newUsers;
    });

    return updatedUser;
  }

  deleteUser(id: string): boolean {
    const initialLength = this.usersSignal().length;
    this.usersSignal.update((users) => users.filter((u) => u.id !== id));
    return this.usersSignal().length < initialLength;
  }

  deleteUsers(ids: string[]): number {
    const idsSet = new Set(ids);
    const initialLength = this.usersSignal().length;
    this.usersSignal.update((users) => users.filter((u) => !idsSet.has(u.id)));
    return initialLength - this.usersSignal().length;
  }

  private generateId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  resetToMockData(): void {
    this.usersSignal.set([...MOCK_USERS]);
  }
}
