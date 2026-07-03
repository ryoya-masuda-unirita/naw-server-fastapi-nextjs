import { Component, input, model, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';

@Component({
  selector: 'app-checkbox',
  standalone: true,
  imports: [CommonModule, TranslateModule, SvgIconComponent],
  templateUrl: './checkbox.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex items-center gap-2 cursor-pointer',
    '(click)': 'toggle()',
  },
})
export class CheckboxComponent {
  readonly label = input<string>('');
  readonly isHeader = input<boolean>(false);

  readonly checked = model<boolean>(false);
  readonly indeterminate = model<boolean>(false);

  readonly checkedChange = output<boolean>();

  toggle() {
    if (this.indeterminate()) {
      // Indeterminate → check all
      this.indeterminate.set(false);
      this.checked.set(true);
      this.checkedChange.emit(true);
    } else {
      const newValue = !this.checked();
      this.checked.set(newValue);
      this.checkedChange.emit(newValue);
    }
  }
}
