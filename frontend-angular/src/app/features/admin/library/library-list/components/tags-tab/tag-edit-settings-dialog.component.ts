import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TagItem } from '@app-types/admin/library.types';
import { FormInputComponent } from '@app/shared/components';
import { FormTextareaComponent } from '@app/shared/components/form/form-textarea/form-textarea.component';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

export const TAG_NAME_MAX_LENGTH = 255;

@Component({
  selector: 'app-tag-edit-settings-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, FormInputComponent, FormTextareaComponent, TranslateModule],
  templateUrl: './tag-edit-settings-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-6' },
})
export class TagEditSettingsDialogComponent implements OnInit {
  private readonly translate = inject(TranslateService);

  readonly item = input<TagItem>();
  readonly onValidChange = input<(valid: boolean) => void>();
  readonly onValueChange = input<(name: string, description: string) => void>();

  readonly tagNameMaxLength = TAG_NAME_MAX_LENGTH;
  readonly name = signal('');
  readonly description = signal('');

  readonly nameError = computed(() => {
    if (this.name().length <= TAG_NAME_MAX_LENGTH) {
      return '';
    }
    return this.translate.instant('VALIDATION.MAX_LENGTH', { max: TAG_NAME_MAX_LENGTH });
  });

  constructor() {
    effect(() => {
      const name = this.name();
      const description = this.description();
      const isValid = name.trim().length > 0 && name.length <= TAG_NAME_MAX_LENGTH;
      this.onValidChange()?.(isValid);
      this.onValueChange()?.(name, description);
    });
  }

  ngOnInit(): void {
    this.name.set(this.item()?.name ?? '');
    this.description.set(this.item()?.description ?? '');
  }
}
