import { ChangeDetectionStrategy, Component, input, Signal, WritableSignal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { FormInputComponent } from '@shared/components/form/form-input/form-input.component';

export interface ChatRenameDialogActionBridge {
  runCancel: () => void;
  runSave: () => void;
  readonly name: WritableSignal<string>;
  readonly isLoading: Signal<boolean>;
}

@Component({
  selector: 'app-chat-rename-dialog',
  standalone: true,
  imports: [TranslateModule, FormInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  templateUrl: './chat-rename-dialog.component.html',
})
export class ChatRenameDialogComponent {
  readonly actionBridge = input.required<ChatRenameDialogActionBridge>();
}
