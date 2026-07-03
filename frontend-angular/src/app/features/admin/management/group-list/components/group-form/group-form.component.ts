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
import { resolveControlError } from '@shared/utils/form-errors';
import {
  ComboboxOption,
  FormComboboxComponent,
} from '@app/shared/components/form/form-combobox/form-combobox.component';

/**
 * Shared "create / edit team" form. Parent owns the FormGroup and the option
 * lists (id-based) for the four multi-selects. The component handles error
 * display and blur-to-touch internally, mirroring `template-form`.
 */
@Component({
  selector: 'app-group-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    FormInputComponent,
    FormComboboxComponent,
  ],
  templateUrl: './group-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupFormComponent {
  readonly formGroup = input.required<FormGroup>();
  readonly adminOptions = input<ComboboxOption[]>([]);
  readonly userOptions = input<ComboboxOption[]>([]);
  readonly assistantOptions = input<ComboboxOption[]>([]);
  readonly templateOptions = input<ComboboxOption[]>([]);

  private readonly translate = inject(TranslateService);
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
}
