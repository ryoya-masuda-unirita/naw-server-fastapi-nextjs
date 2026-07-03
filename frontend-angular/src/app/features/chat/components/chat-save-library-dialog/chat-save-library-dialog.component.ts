import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  WritableSignal,
} from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { DialogComponent } from '@shared/components/dialog/dialog.component';
import { FormInputComponent } from '@shared/components/form/form-input/form-input.component';
import { ComboboxMultiComponent } from '@shared/components/combobox-multi/combobox-multi.component';
import { OptionalLabelComponent } from '@shared/components/labels/optional-label.component';
import { SelectOption } from '@app-types/common';
import { TeamsService } from '../../services/teams.service';
import { TagsService } from '../../services/tags.service';

export interface ChatSaveLibraryDialogActionBridge {
  runCancel: () => void;
  runSave: () => void;
  readonly contentName: WritableSignal<string>;
  readonly selectedTagIds: WritableSignal<string[]>;
  readonly selectedTeamIds: WritableSignal<string[]>;
}

@Component({
  selector: 'app-chat-save-library-dialog',
  standalone: true,
  imports: [TranslateModule, FormInputComponent, ComboboxMultiComponent, OptionalLabelComponent],
  templateUrl: './chat-save-library-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class ChatSaveLibraryDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<DialogComponent>);
  private readonly teamsService = inject(TeamsService);
  private readonly tagsService = inject(TagsService);

  readonly actionBridge = input.required<ChatSaveLibraryDialogActionBridge>();

  readonly tagOptions = computed<SelectOption<string>[]>(() =>
    this.tagsService.tags().map((t) => ({ label: t.name, value: t.id })),
  );

  readonly teamOptions = computed<SelectOption<string>[]>(() =>
    this.teamsService.teams().map((t) => ({ label: t.name, value: t.id })),
  );

  constructor() {
    void this.teamsService.loadTeams();
    void this.tagsService.loadTags();

    effect(() => {
      const b = this.actionBridge();
      b.runCancel = () => this.dialogRef.close(null);
    });
  }
}
