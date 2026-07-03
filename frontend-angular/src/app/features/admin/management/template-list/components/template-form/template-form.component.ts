import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FormInputComponent } from '@shared/components';
import { FormTextareaComponent } from '@shared/components/form/form-textarea/form-textarea.component';
import { ComboboxMultiComponent } from '@shared/components/combobox-multi/combobox-multi.component';
import { resolveControlError } from '@shared/utils/form-errors';
import { SelectOption } from '@app-types/common';

/**
 * Shared "create / edit template" form. Parent owns the FormGroup (so the
 * page can inspect status, call markAllAsTouched, and read values on submit).
 * This component renders the same four fields (name / system prompt /
 * description / teams) and handles error display + blur-to-touch internally.
 *
 * Pre-filling for edit: parent calls `formGroup.reset({ ... })` before opening
 * the dialog. Empty for create: `formGroup.reset({ name: '', ... })`.
 */
@Component({
  selector: 'app-template-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    FormInputComponent,
    FormTextareaComponent,
    ComboboxMultiComponent,
  ],
  templateUrl: './template-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplateFormComponent {
  readonly formGroup = input.required<FormGroup>();
  readonly teamOptions = input<SelectOption[]>([]);

  private readonly translate = inject(TranslateService);

  /** Bumped on every form event so OnPush + dialog templates re-evaluate errors. */
  private readonly tick = signal(0);

  constructor() {
    effect((onCleanup) => {
      const sub = this.formGroup().events.subscribe(() => this.tick.update((n) => n + 1));
      onCleanup(() => sub.unsubscribe());
    });
  }

  readonly nameError = computed(() => {
    this.tick();
    const ctrl = this.formGroup().get('name');
    return ctrl ? resolveControlError(ctrl, this.translate) : '';
  });

  readonly systemPromptError = computed(() => {
    this.tick();
    const ctrl = this.formGroup().get('systemPrompt');
    return ctrl ? resolveControlError(ctrl, this.translate) : '';
  });

  readonly descriptionError = computed(() => {
    this.tick();
    const ctrl = this.formGroup().get('description');
    return ctrl ? resolveControlError(ctrl, this.translate) : '';
  });

  /** Two-way bridge for the (no-CVA) `<app-form-textarea>` system prompt. */
  systemPromptValue() {
    return (this.formGroup().get('systemPrompt')?.value ?? '') as string;
  }
  setSystemPrompt(value: string) {
    this.formGroup().get('systemPrompt')?.setValue(value);
  }
  touchSystemPrompt() {
    this.formGroup().get('systemPrompt')?.markAsTouched();
  }

  descriptionValue() {
    return (this.formGroup().get('description')?.value ?? '') as string;
  }
  setDescription(value: string) {
    this.formGroup().get('description')?.setValue(value);
  }
  touchDescription() {
    this.formGroup().get('description')?.markAsTouched();
  }
}
