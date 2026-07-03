import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ButtonComponent, FormInputComponent } from '@app/shared/components';
import { FormRadioComponent } from '@app/shared/components/form/form-radio/form-radio.component';
import { FormSwitchComponent } from '@app/shared/components/form/form-switch/form-switch.component';
import { resolveControlError } from '@app/shared/utils/form-errors';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { merge } from 'rxjs';
import { generateLoginKey } from '../utils/login-key.util';

@Component({
  selector: 'app-user-edit-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormInputComponent,
    TranslateModule,
    FormRadioComponent,
    FormSwitchComponent,
    ButtonComponent,
  ],
  templateUrl: './user-edit-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserEditDialogComponent {
  readonly formGroup = input.required<FormGroup>();
  private readonly translate = inject(TranslateService);

  private readonly tick = signal(0);

  constructor() {
    effect((onCleanup) => {
      const sub = merge(
        this.formGroup().events,
        this.formGroup().valueChanges,
        this.formGroup().statusChanges,
      ).subscribe(() => this.tick.update((n) => n + 1));
      onCleanup(() => sub.unsubscribe());
    });
  }

  readonly roleOptions = computed(() => {
    return [
      { label: this.translate.instant('ADMIN.USER_MANAGEMENT.ROLE_GENERAL'), value: 'user' },
      { label: this.translate.instant('ADMIN.USER_MANAGEMENT.ROLE_ADMIN'), value: 'admin' },
    ];
  });

  readonly displayNameError = computed(() => {
    this.tick();
    const ctrl = this.formGroup().get('displayName');
    return ctrl ? resolveControlError(ctrl, this.translate) : '';
  });

  readonly loginKeyError = computed(() => {
    this.tick();
    const ctrl = this.formGroup().get('loginKey');
    return ctrl ? resolveControlError(ctrl, this.translate) : '';
  });

  // Accessors for non-CVA components
  getControlValue(name: string): string {
    return (this.formGroup().get(name)?.value ?? '') as string;
  }

  setControlValue(name: string, value: string): void {
    this.formGroup().get(name)?.setValue(value);
  }

  touchControl(name: string): void {
    this.formGroup().get(name)?.markAsTouched();
  }

  regenerateLoginKey(): void {
    this.setControlValue('loginKey', generateLoginKey());
    this.touchControl('loginKey');
  }

  readonly loginKeyCopied = signal(false);

  async copyLoginKey(): Promise<void> {
    const value = this.getControlValue('loginKey');
    if (!value) return;
    await navigator.clipboard.writeText(value);
    this.loginKeyCopied.set(true);
    setTimeout(() => this.loginKeyCopied.set(false), 3000);
  }
}
