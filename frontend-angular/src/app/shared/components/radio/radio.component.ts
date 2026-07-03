import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SvgIconComponent } from '../icons/svg-icon.component';

@Component({
  selector: 'app-radio',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconComponent],
  templateUrl: './radio.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export class RadioComponent {
  // Inputs
  readonly label = input<string>('');
  readonly name = input.required<string>();
  readonly value = input.required<string | number>();
  readonly disabled = input<boolean>(false);

  // Two-way binding
  readonly checked = model<boolean>(false);

  // Outputs
  readonly handleChange = output<string | number>();

  handleChangeEvent(): void {
    if (!this.disabled()) {
      this.handleChange.emit(this.value());
    }
  }
}
