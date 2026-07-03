/**
 * User Form Modal Component
 *
 * Modal form for creating or editing users (admin API contract).
 * Parent calls UserListApiService; this component only emits payloads.
 */
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import type { User } from '@core/constants/mock-data';
import type { AdminUser } from '@app-types/admin/user.types';
import { environment } from '@env/environment';

/** Emitted on Save — maps to POST/PATCH /admin/users payloads in the parent. */
export interface UserFormSavePayload {
  displayName: string;
  userId: string;
  role: 'admin' | 'user';
  password?: string;
}

const USER_ROLE_OPTIONS: ReadonlyArray<{ value: 'admin' | 'user'; labelKey: string }> = [
  { value: 'admin', labelKey: 'ADMIN_CONSOLE.ADMIN' },
  { value: 'user', labelKey: 'ADMIN_CONSOLE.USER' },
];

function isAdminUser(u: AdminUser | User): u is AdminUser {
  return 'userId' in u && typeof (u as AdminUser).userId === 'string';
}

/** Map any supported row to the two radio values (admin | user). */
function toFormRole(role: string): 'admin' | 'user' {
  return role === 'admin' ? 'admin' : 'user';
}

@Component({
  selector: 'app-user-form-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        (click)="$event.stopPropagation()"
      >
        <div class="px-6 py-4 border-b border-gray-200">
          <h2 class="text-xl font-bold text-gray-900">
            {{
              isEditMode()
                ? ('ADMIN_CONSOLE.EDIT_USER_TITLE' | translate)
                : ('ADMIN_CONSOLE.ADD_USER_TITLE' | translate)
            }}
          </h2>
        </div>

        <form (ngSubmit)="onSubmit()" class="p-6 space-y-6" #f="ngForm">
          <div>
            <p class="block text-sm font-medium text-gray-700 mb-2">
              {{ 'ADMIN_CONSOLE.DISPLAY_NAME' | translate }}
            </p>
            <input
              type="text"
              [(ngModel)]="formData.displayName"
              name="displayName"
              required
              [placeholder]="'ADMIN_CONSOLE.PLACEHOLDER' | translate"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <p class="block text-sm font-medium text-gray-700 mb-2">
              {{ 'ADMIN_CONSOLE.USER_ID' | translate }}
            </p>
            <input
              type="text"
              [(ngModel)]="formData.userId"
              name="userId"
              required
              [disabled]="isEditMode()"
              [placeholder]="'ADMIN_CONSOLE.PLACEHOLDER' | translate"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
            />
          </div>

          <div>
            <p class="block text-sm font-medium text-gray-700 mb-2">
              {{ 'ADMIN_CONSOLE.PERMISSION' | translate }}
            </p>
            <select
              [(ngModel)]="formData.role"
              name="role"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="" disabled>{{ 'ADMIN_CONSOLE.ALL_ROLES' | translate }}</option>
              @for (opt of userRoleOptions; track opt.value) {
                <option [value]="opt.value">{{ opt.labelKey | translate }}</option>
              }
            </select>
          </div>

          <div>
            <p class="block text-sm font-medium text-gray-700 mb-2">
              {{ 'ADMIN_CONSOLE.PASSWORD' | translate }}
            </p>
            <div class="relative">
              <input
                [type]="showPassword() ? 'text' : 'password'"
                [(ngModel)]="formData.password"
                name="password"
                [required]="!isEditMode()"
                [minlength]="passwordMinLength"
                [placeholder]="'ADMIN_CONSOLE.PLACEHOLDER' | translate"
                class="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                (click)="togglePasswordVisibility()"
                class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700"
              >
                @if (showPassword()) {
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                    />
                  </svg>
                } @else {
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                }
              </button>
            </div>
          </div>

          <div class="flex items-center justify-between pt-4 border-t border-gray-200">
            @if (isEditMode()) {
              <button
                type="button"
                (click)="onDelete()"
                class="flex items-center gap-2 text-red-600 hover:text-red-700 transition-colors"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                {{ 'COMMON.DELETE' | translate }}
              </button>
            } @else {
              <div></div>
            }

            <div class="flex gap-3">
              <button
                type="button"
                (click)="onCancel()"
                class="px-6 py-2 border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
              >
                {{ 'ADMIN_CONSOLE.CANCEL' | translate }}
              </button>
              <button
                type="submit"
                class="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
              >
                {{ 'ADMIN_CONSOLE.SAVE' | translate }}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserFormModalComponent {
  readonly user = input<AdminUser | User | null>(null);

  readonly save = output<UserFormSavePayload>();
  readonly handleCancel = output<void>();
  readonly delete = output<string>();

  readonly userRoleOptions = USER_ROLE_OPTIONS;
  readonly showPassword = signal(false);
  /** Template + manual submit checks — aligned with reactive forms min length. */
  readonly passwordMinLength = environment.minPasswordLength;
  readonly isEditMode = computed(() => this.user() !== null);

  formData = {
    displayName: '',
    userId: '',
    role: '' as '' | 'admin' | 'user',
    password: '',
  };

  constructor() {
    effect(() => {
      const userData = this.user();
      if (userData) {
        this.formData.displayName = userData.displayName;
        this.formData.userId = isAdminUser(userData) ? userData.userId : userData.username;
        this.formData.role = toFormRole(userData.role);
        this.formData.password = '';
      } else {
        this.resetForm();
      }
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  onSubmit(): void {
    if (!this.formData.displayName.trim() || !this.formData.userId.trim() || !this.formData.role) {
      return;
    }
    if (
      !this.isEditMode() &&
      (!this.formData.password || this.formData.password.length < this.passwordMinLength)
    ) {
      return;
    }
    if (
      this.isEditMode() &&
      this.formData.password &&
      this.formData.password.length < this.passwordMinLength
    ) {
      return;
    }

    const payload: UserFormSavePayload = {
      displayName: this.formData.displayName.trim(),
      userId: this.formData.userId.trim(),
      role: this.formData.role,
    };
    if (this.formData.password) {
      payload.password = this.formData.password;
    }
    this.save.emit(payload);
  }

  onCancel(): void {
    this.handleCancel.emit();
  }

  onDelete(): void {
    const userData = this.user();
    if (userData) {
      this.delete.emit(userData.id);
    }
  }

  resetForm(): void {
    this.formData = {
      displayName: '',
      userId: '',
      role: '',
      password: '',
    };
  }
}
