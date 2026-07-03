import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { AppMatIconComponent } from '@app/shared/components/icons/mat-icon.component';
import { MatIcon } from '@angular/material/icon';

@Component({
  selector: 'app-file-chip',
  standalone: true,
  imports: [TranslateModule, AppMatIconComponent, MatIcon],
  templateUrl: './file-chip.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileChipComponent {
  readonly file = input.required<File>();
  readonly showRemoveBtn = input<boolean>(true);
  readonly remove = output<void>();

  getFileTypeLabel(file: File): string {
    if (file.type.includes('pdf')) return 'PDF';
    if (file.type.includes('word') || file.type.includes('document')) return 'DOC';
    if (file.type.includes('sheet') || file.type.includes('excel')) return 'XLS';
    if (file.type.startsWith('image/')) {
      const format = file.type.split('/')[1]?.toUpperCase();
      return format || 'IMG';
    }
    return file.name.split('.').pop()?.toUpperCase() || 'FILE';
  }

  onRemove(): void {
    this.remove.emit();
  }
}
