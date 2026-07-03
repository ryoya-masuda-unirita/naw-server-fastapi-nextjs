import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  WritableSignal,
} from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { AssistantsService } from '@features/chat/services/assistants.service';
import { SelectWithSearchComponent } from '@shared/components/select-with-search/select.component';
import { SelectOption } from '@app-types/common';

@Component({
  selector: 'app-new-chat-dialog',
  standalone: true,
  imports: [TranslateModule, SelectWithSearchComponent],
  templateUrl: './new-chat-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class NewChatDialogComponent {
  private readonly assistantsService = inject(AssistantsService);

  readonly selectedAssistantId = input.required<WritableSignal<string | null>>();

  private readonly assistantsQuery = this.assistantsService.assistantsQuery;
  readonly assistantOptions = computed<SelectOption<string>[]>(() =>
    (this.assistantsQuery.data() ?? []).map((a) => ({
      label: a.name,
      value: a.id,
      description: a.description,
      category: a.category,
    })),
  );
  readonly isAssistantsLoading = computed(() => this.assistantsQuery.isPending());

  setSelected(value: string): void {
    this.selectedAssistantId().set(value);
  }

  getSelected(): string {
    return this.selectedAssistantId()() ?? '';
  }
}
