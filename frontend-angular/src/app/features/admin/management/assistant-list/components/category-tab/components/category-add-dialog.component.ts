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
import { FormInputComponent } from '@app/shared/components';
import { FormTextareaComponent } from '@app/shared/components/form/form-textarea/form-textarea.component';
import { resolveControlError } from '@app/shared/utils/form-errors';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { merge } from 'rxjs';

@Component({
  selector: 'app-category-add-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormInputComponent,
    TranslateModule,
    FormTextareaComponent,
  ],
  templateUrl: './category-add-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryAddDialogComponent {
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

  readonly nameError = computed(() => {
    this.tick();
    const ctrl = this.formGroup().get('name');
    return ctrl ? resolveControlError(ctrl, this.translate) : '';
  });

  readonly descError = computed(() => {
    this.tick();
    const ctrl = this.formGroup().get('description');
    return ctrl ? resolveControlError(ctrl, this.translate) : '';
  });

  getControlValue(name: string): string {
    return this.formGroup().get(name)?.value ?? '';
  }

  setControlValue(name: string, value: any): void {
    this.formGroup().get(name)?.setValue(value);
    this.formGroup().get(name)?.markAsDirty();
  }

  touchControl(name: string): void {
    this.formGroup().get(name)?.markAsTouched();
  }
}
