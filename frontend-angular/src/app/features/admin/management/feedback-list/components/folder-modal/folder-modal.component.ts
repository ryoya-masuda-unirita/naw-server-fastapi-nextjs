import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  WritableSignal,
} from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { SelectWithSearchComponent } from '@shared/components/select-with-search/select.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { SelectOption } from '@app-types/common';
import { FeedbackMessageApiService } from '../../services/feedback-message-api.service';

@Component({
  selector: 'app-folder-modal',
  standalone: true,
  imports: [TranslateModule, SelectWithSearchComponent, SvgIconComponent],
  templateUrl: './folder-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class FolderModalComponent {
  private readonly feedbackApiService = inject(FeedbackMessageApiService);

  readonly selectedFolderSignal = input.required<WritableSignal<string | null>>();

  readonly folderOptions = computed<SelectOption[]>(() => {
    const folders = this.feedbackApiService.learningFoldersQuery.data()?.data ?? [];
    return folders.map((f) => ({
      value: f.id,
      label: f.name,
      description: f.description,
      category: f.category,
    }));
  });

  getSelectedValue(): string | null {
    return this.selectedFolderSignal()();
  }

  onFolderChange(value: string | null): void {
    this.selectedFolderSignal().set(value);
  }
}
