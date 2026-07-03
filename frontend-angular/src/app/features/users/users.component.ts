/**
 * Users List Component
 *
 * User management with CRUD operations:
 * - List users with pagination
 * - Create/Edit/Delete users
 * - Built with Signals API and Tailwind CSS
 */
import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { User, USER_ROLES } from '@core/constants/mock-data';
import { UserService } from '@core/services/user.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { UserFormModalComponent } from './components/user-form-modal/user-form-modal.component';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule, UserFormModalComponent, TranslateModule],
  template: `
    <div class="p-6">
      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-gray-900">
          {{ 'USERS.TITLE' | translate }}
        </h1>
      </div>

      <!-- Actions Bar -->
      <div class="mb-6 flex items-center justify-between">
        <div class="flex gap-2">
          <button
            (click)="openCreateModal()"
            class="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 w-[168px] h-11 py-2 rounded-lg transition-colors"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4v16m8-8H4"
              />
            </svg>
            {{ 'USERS.ADD_USER' | translate }}
          </button>

          <button
            class="flex items-center gap-2 border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg transition-colors"
          >
            {{ 'USERS.IMPORT_USERS' | translate }}
          </button>
        </div>

        <div class="flex items-center gap-4">
          <span class="text-sm text-gray-600">{{ 'USERS.ITEMS_PER_PAGE' | translate }}</span>
          <select [(ngModel)]="pageSize" class="border border-gray-300 rounded px-3 py-1.5 text-sm">
            <option [value]="10">10</option>
            <option [value]="20">20</option>
            <option [value]="50">50</option>
          </select>
        </div>
      </div>

      <!-- Table -->
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {{ 'USERS.DISPLAY_NAME' | translate }}
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {{ 'USERS.USER_ID' | translate }}
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {{ 'USERS.PERMISSION' | translate }}
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {{ 'USERS.USED_TOKENS' | translate }}
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {{ 'USERS.LOGIN_KEY' | translate }}
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {{ 'USERS.ACCOUNT' | translate }}
                </th>
                <th
                  class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {{ 'USERS.ACTIONS' | translate }}
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              @for (user of paginatedUsers(); track user.id) {
                <tr class="hover:bg-gray-50 transition-colors">
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {{ user.displayName }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {{ user.username }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {{ getRoleLabel(user.role) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {{ user.loginKey || '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <span class="font-mono">•••••</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm">
                    @if (user.accountType === 'google') {
                      <svg class="w-5 h-5 text-red-500" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                        />
                      </svg>
                    } @else if (user.accountType === 'microsoft') {
                      <svg class="w-5 h-5 text-orange-500" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M0 0v11.408h11.408V0zm12.594 0v11.408H24V0zM0 12.594V24h11.408V12.594zm12.594 0V24H24V12.594z"
                        />
                      </svg>
                    } @else {
                      <span class="text-gray-400">-</span>
                    }
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <button
                      (click)="openEditModal(user)"
                      class="text-blue-600 hover:text-blue-800 transition-colors"
                      title="編集"
                    >
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="7" class="px-6 py-12 text-center text-gray-500">
                    {{ 'USERS.NO_USERS_FOUND' | translate }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div
          class="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200"
        >
          <div class="text-sm text-gray-700">
            {{ (currentPage() - 1) * pageSize() + 1 }} -
            {{ Math.min(currentPage() * pageSize(), totalUsers()) }} / {{ totalUsers() }}
            {{ 'USERS.ITEMS' | translate }}
          </div>

          <div class="flex items-center gap-1">
            <button
              (click)="goToPage(1)"
              [disabled]="currentPage() === 1"
              class="px-3 py-1 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ≪
            </button>
            <button
              (click)="goToPage(currentPage() - 1)"
              [disabled]="currentPage() === 1"
              class="px-3 py-1 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ‹
            </button>

            @for (page of visiblePages(); track page) {
              @if (page === '...') {
                <span class="px-3 py-1">...</span>
              } @else {
                <button
                  (click)="goToPage(+page)"
                  [class.bg-blue-600]="currentPage() === +page"
                  [class.text-white]="currentPage() === +page"
                  class="px-3 py-1 rounded hover:bg-gray-200 transition-colors"
                >
                  {{ page }}
                </button>
              }
            }

            <button
              (click)="goToPage(currentPage() + 1)"
              [disabled]="currentPage() === totalPages()"
              class="px-3 py-1 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ›
            </button>
            <button
              (click)="goToPage(totalPages())"
              [disabled]="currentPage() === totalPages()"
              class="px-3 py-1 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ≫
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- User Form Modal -->
    @if (showModal()) {
      <app-user-form-modal
        [user]="editingUser()"
        (save)="handleSave($event)"
        (cancel)="closeModal()"
        (delete)="handleDelete($event)"
      />
    }
  `,
})
export class UsersComponent {
  private userService = inject(UserService);
  private translate = inject(TranslateService);

  // Expose Math for template
  readonly Math = Math;

  // State
  readonly pageSize = signal(10);
  readonly currentPage = signal(1);
  readonly showModal = signal(false);
  readonly editingUser = signal<User | null>(null);

  // Data from service
  readonly users = this.userService.users;
  readonly totalUsers = computed(() => this.users().length);

  // Pagination
  readonly totalPages = computed(() => Math.ceil(this.totalUsers() / this.pageSize()));

  readonly paginatedUsers = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    const end = start + this.pageSize();
    return this.users().slice(start, end);
  });

  readonly visiblePages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: (number | string)[] = [];

    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      if (current > 3) pages.push('...');

      for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
        pages.push(i);
      }

      if (current < total - 2) pages.push('...');
      pages.push(total);
    }

    return pages;
  });

  getRoleLabel(role: string): string {
    return USER_ROLES.find((r) => r.value === role)?.label || role;
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  openCreateModal(): void {
    this.editingUser.set(null);
    this.showModal.set(true);
  }

  openEditModal(user: User): void {
    this.editingUser.set(user);
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.editingUser.set(null);
  }

  handleSave(userData: Partial<User>): void {
    const editing = this.editingUser();

    if (editing) {
      // Update
      this.userService.updateUser(editing.id, userData);
    } else {
      // Create
      this.userService.createUser(userData as Omit<User, 'id' | 'createdAt'>);
    }

    this.closeModal();
  }

  handleDelete(userId: string): void {
    if (confirm(this.translate.instant('USERS.DELETE_USER_CONFIRM'))) {
      this.userService.deleteUser(userId);
      this.closeModal();
    }
  }
}
