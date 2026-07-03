import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  WritableSignal,
} from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { AssistantsService } from '../../services/assistants.service';
import { SkeletonBlockComponent } from '@shared/components/skeleton/skeleton-block.component';

export interface ChatNewRoomDialogActionBridge {
  runCancel: () => void;
  runCreate: () => void;
  readonly selectedAssistantId: WritableSignal<string | null>;
}

@Component({
  selector: 'app-chat-new-room-dialog',
  standalone: true,
  imports: [TranslateModule, SkeletonBlockComponent],
  templateUrl: './chat-new-room-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class ChatNewRoomDialogComponent {
  private readonly assistantsService = inject(AssistantsService);

  readonly actionBridge = input.required<ChatNewRoomDialogActionBridge>();

  private readonly assistantsQuery = this.assistantsService.assistantsQuery;
  readonly assistants = computed(() => this.assistantsQuery.data() ?? []);
  readonly isAssistantsLoading = computed(() => this.assistantsQuery.isPending());

  constructor() {
    effect(() => {
      const list = this.assistantsQuery.data();
      if (!list) return;
      const bridge = this.actionBridge();
      if (!bridge.selectedAssistantId()) {
        const defaultAss = list.find((a) => a.isDefault) ?? list[0];
        if (defaultAss) bridge.selectedAssistantId.set(defaultAss.id);
      }
    });
  }

  selectAssistant(id: string): void {
    this.actionBridge().selectedAssistantId.set(id);
  }

  isSelected(id: string): boolean {
    return this.actionBridge().selectedAssistantId() === id;
  }
}
