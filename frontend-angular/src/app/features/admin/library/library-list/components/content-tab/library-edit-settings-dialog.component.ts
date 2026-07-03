import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { ROUTES } from '@core/constants/routes.config';
import { LibraryPageItem, LibraryUpdatePayload } from '@app-types/admin/library.types';
import { SelectOption } from '@app-types/common';
import { FormInputComponent } from '@shared/components/form/form-input/form-input.component';
import { AppMatIconComponent } from '@shared/components/icons/mat-icon.component';
import { MultiSelectComponent } from '@shared/components/multi-select/multi-select.component';
import { LibraryStore } from './library.store';

@Component({
  selector: 'app-library-edit-settings-dialog',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    FormInputComponent,
    AppMatIconComponent,
    MultiSelectComponent,
  ],
  templateUrl: './library-edit-settings-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4 md:gap-6' },
})
export class LibraryEditSettingsDialogComponent implements OnInit {
  private readonly store = inject(LibraryStore);

  readonly item = input.required<LibraryPageItem>();
  // 保存ボタンは親コンポーネント側にあるため、フォーム状態が変わるたびに親へ通知する
  readonly onValueChange = input<(payload: LibraryUpdatePayload) => void>();

  readonly name = signal('');
  readonly selectedTags = signal<string[]>([]);
  readonly selectedTeams = signal<string[]>([]);
  readonly linkCopied = signal(false);

  // タグ選択肢は一覧画面のフィルター用に既にStoreへロード済みのため、再取得せずそのまま利用する
  readonly tagOptions = computed<SelectOption[]>(() =>
    this.store.tagOptions().map((t) => ({ value: t.id, label: t.name })),
  );
  readonly teamOptions = computed<SelectOption[]>(() =>
    this.store.groupOptions().map((g) => ({ value: g.id, label: g.name })),
  );

  constructor() {
    effect(() => {
      this.onValueChange()?.({
        name: this.name(),
        tags: this.selectedTags(),
        groups: this.selectedTeams(),
      });
    });
  }

  ngOnInit(): void {
    const item = this.item();
    this.name.set(item.title);
    this.selectedTags.set(item.tags.map((t) => t.id));
    this.selectedTeams.set(item.sharedGroups.map((g) => g.id));

    void this.store.loadGroupOptions();
  }

  onCopyLink(): void {
    const url = `${window.location.origin}${ROUTES.APP.LIBRARY_DETAIL(this.item().id)}`;
    void navigator.clipboard.writeText(url);
    this.linkCopied.set(true);
    setTimeout(() => this.linkCopied.set(false), 3000);
  }
}
