import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { TrainingDataFile } from '@app-types/training-data.types';
import { ButtonComponent } from '@shared/components/button/button.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';

@Component({
  selector: 'app-training-data-action-bar',
  standalone: true,
  imports: [CommonModule, TranslateModule, ButtonComponent, SvgIconComponent],
  templateUrl: './training-data-action-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
})
export class TrainingDataActionBarComponent {
  readonly selectedFiles = input.required<TrainingDataFile[]>();
  readonly isRenamingMode = input.required<boolean>();
  readonly showSync = input<boolean>(false);
  readonly showDownload = input<boolean>(false);

  readonly sync = output<void>();
  readonly downloadSelected = output<void>();
  readonly addData = output<void>();
  readonly addDataSp = output<void>();
  readonly deselectAll = output<void>();
  readonly deleteSelected = output<void>();
  readonly editName = output<void>();
  readonly saveRename = output<void>();
}
