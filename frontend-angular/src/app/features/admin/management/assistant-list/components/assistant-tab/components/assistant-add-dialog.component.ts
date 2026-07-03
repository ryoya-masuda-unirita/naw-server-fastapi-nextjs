import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FormInputComponent, FormSwitchComponent } from '@app/shared/components';
import { ComboboxMultiComponent } from '@app/shared/components/combobox-multi/combobox-multi.component';
import {
  FormRadioComponent,
  FormRadioOption,
} from '@app/shared/components/form/form-radio/form-radio.component';
import { FormSelectComponent } from '@app/shared/components/form/form-select/form-select.component';
import { FormTextareaComponent } from '@app/shared/components/form/form-textarea/form-textarea.component';
import { SvgIconComponent } from '@app/shared/components/icons/svg-icon.component';
import { resolveControlError } from '@app/shared/utils/form-errors';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { merge } from 'rxjs';
import { ASSISTANT_SERVER_TYPE } from '../../../assistant-list.constants';
import { AssistantListStore } from '../../../stores/assistant-list.store';
interface UserForm {
  name: FormControl<string>;
  description: FormControl<string>;
  serverType: FormControl<string>;
  serverApi: FormControl<string>;
  categories: FormControl<string[]>;
  model: FormControl<string>;
  indexId: FormControl<string>;
  includeHistory: FormControl<boolean>;
  iconColor: FormControl<string>;
  groups: FormControl<string[]>;
  dictionaries: FormControl<string[]>;
  folder: FormControl<string>;
  createdAt: FormControl<string>;
  updatedAt: FormControl<string>;
}
@Component({
  selector: 'app-assistant-add-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormInputComponent,
    TranslateModule,
    FormRadioComponent,
    FormSelectComponent,
    FormTextareaComponent,
    FormSwitchComponent,
    SvgIconComponent,
    ComboboxMultiComponent,
  ],
  templateUrl: './assistant-add-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssistantAddDialogComponent {
  readonly store = inject(AssistantListStore);
  readonly formGroup = input.required<FormGroup<UserForm>>();
  readonly assistantId = input<string>('');
  private readonly translate = inject(TranslateService);

  readonly isCopied = signal(false);
  private readonly tick = signal(0);

  readonly serverTypes = ASSISTANT_SERVER_TYPE;

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

  readonly serverTypeError = computed(() => {
    this.tick();
    const ctrl = this.formGroup().get('serverType');
    return ctrl ? resolveControlError(ctrl, this.translate) : '';
  });

  readonly serverApiError = computed(() => {
    this.tick();
    const ctrl = this.formGroup().get('serverApi');
    return ctrl ? resolveControlError(ctrl, this.translate) : '';
  });

  readonly modelError = computed(() => {
    this.tick();
    const ctrl = this.formGroup().get('model');
    return ctrl ? resolveControlError(ctrl, this.translate) : '';
  });

  readonly folderError = computed(() => {
    this.tick();

    const form = this.formGroup();
    const ctrl = form.get('folder');

    if (!ctrl) return '';

    if (ctrl.touched && ctrl.invalid) {
      const error = resolveControlError(ctrl, this.translate);
      if (error) return error;
    }

    if ((ctrl.touched || form.get('serverType')?.touched) && form.hasError('folderRequired')) {
      return this.translate.instant('VALIDATION.REQUIRED');
    }

    return '';
  });

  readonly categoryError = computed(() => {
    this.tick();
    const ctrl = this.formGroup().get('categories');
    return ctrl ? resolveControlError(ctrl, this.translate) : '';
  });

  readonly groupsError = computed(() => {
    this.tick();
    const ctrl = this.formGroup().get('groups');
    return ctrl ? resolveControlError(ctrl, this.translate) : '';
  });

  readonly dictionariesError = computed(() => {
    this.tick();
    const ctrl = this.formGroup().get('dictionaries');
    return ctrl ? resolveControlError(ctrl, this.translate) : '';
  });

  readonly descriptionError = computed(() => {
    this.tick();
    const ctrl = this.formGroup().get('description');
    return ctrl ? resolveControlError(ctrl, this.translate) : '';
  });

  readonly includeHistoryError = computed(() => {
    this.tick();
    const ctrl = this.formGroup().get('includeHistory');
    return ctrl ? resolveControlError(ctrl, this.translate) : '';
  });

  copyAssistantId() {
    navigator.clipboard.writeText(this.assistantId());
    this.isCopied.set(true);
    setTimeout(() => this.isCopied.set(false), 1000);
  }

  readonly serverTypeOptions: FormRadioOption[] = this.store.serverOptions().map((item) => ({
    value: item.value,
    label: item.label,
  }));

  readonly serverApiOptions = this.store.serverApiOptions();

  readonly modelOptions = this.store.modelOptions();

  readonly categoriesOptions = computed(() =>
    this.store.categoriesOptions().filter((option) => option.value !== 'NONE'),
  );

  readonly groupsOptions = computed(() =>
    this.store.groupOptions().filter((option) => option.value !== 'NONE'),
  );

  readonly dictionariesOptions = this.store.dictionaryOptions();

  readonly folderOptions = computed(() => this.store.folderOptions());

  getControlValue(name: string): any {
    return this.formGroup().get(name)?.value;
  }

  setControlValue(name: string, value: any): void {
    const control = this.formGroup().get(name);
    if (!control) return;
    control.setValue(value);
    control.markAsDirty();

    if (name === 'serverType') {
      this.formGroup().get('serverApi')?.reset('');
      this.formGroup().get('model')?.reset('');
      this.formGroup().get('folder')?.reset('');
    } else if (name === 'serverApi') {
      this.formGroup().get('model')?.reset('');
    }
  }

  touchControl(name: string): void {
    this.formGroup().get(name)?.markAsTouched();
  }
}
