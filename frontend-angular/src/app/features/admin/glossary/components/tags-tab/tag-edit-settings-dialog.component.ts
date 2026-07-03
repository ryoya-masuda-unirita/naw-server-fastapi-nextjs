import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  OnInit,
  signal,
  WritableSignal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { GlossaryTagItem } from '@app-types/admin/glossary.types';
import { FormInputComponent } from '@app/shared/components';
import { FormTextareaComponent } from '@app/shared/components/form/form-textarea/form-textarea.component';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-glossary-tag-edit-settings-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, FormInputComponent, FormTextareaComponent, TranslateModule],
  templateUrl: './tag-edit-settings-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col md:gap-6 gap-4' },
})
export class TagEditSettingsDialogComponent implements OnInit {
  readonly item = input<GlossaryTagItem>();
  readonly onValidChange = input<(valid: boolean) => void>();

  readonly nameSignal = input<WritableSignal<string> | null>(null);
  readonly descriptionSignal = input<WritableSignal<string> | null>(null);

  private readonly _name = signal('');
  private readonly _description = signal('');

  readonly name = computed(() => this.nameSignal()?.() ?? this._name());
  readonly description = computed(() => this.descriptionSignal()?.() ?? this._description());

  constructor() {
    effect(() => {
      this.onValidChange()?.(this.name().trim().length > 0);
    });
  }

  ngOnInit(): void {
    const initName = this.item()?.name ?? '';
    const initDescription = this.item()?.description ?? '';
    (this.nameSignal() ?? this._name).set(initName);
    (this.descriptionSignal() ?? this._description).set(initDescription);
  }

  setName(value: string): void {
    (this.nameSignal() ?? this._name).set(value);
  }

  setDescription(value: string): void {
    (this.descriptionSignal() ?? this._description).set(value);
  }
}
