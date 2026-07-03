import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { getFilePreviewUrl } from '@core/utils/file.helpers';
import { MatIcon } from '@angular/material/icon';

@Component({
  selector: 'app-file-image-chip',
  standalone: true,
  imports: [TranslateModule, MatIcon],
  templateUrl: './file-image-chip.component.html',

  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'w-16 h-16',
  },
})
export class FileImageChipComponent {
  readonly file = input.required<File>();
  readonly showRemoveBtn = input<boolean>(true);
  readonly remove = output<void>();

  readonly getFilePreviewUrl = getFilePreviewUrl;

  onRemove(): void {
    this.remove.emit();
  }
}
