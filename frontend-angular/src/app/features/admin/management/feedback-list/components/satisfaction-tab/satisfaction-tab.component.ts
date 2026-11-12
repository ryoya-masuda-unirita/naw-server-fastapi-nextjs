import { Component, ChangeDetectionStrategy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { SelectComponent } from '@shared/components/select/select.component';
import { SelectWithSearchComponent } from '@shared/components/select-with-search/select.component';
import { TableListComponent } from '@shared/components/table-list/table-list.component';
import { TableListItemComponent } from '@shared/components/table-list/table-list-item.component';
import {
  FormSortInputComponent,
  SortOption,
} from '@shared/components/form/form-sort-input/form-sort-input.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { ContextMenuComponent } from '@shared/components/context-menu/context-menu.component';
import { CircularLoadingComponent } from '@shared/components/circular-loading/circular-loading.component';
import { SelectOption } from '@app-types/common';
import type { SatisfactionFeedbackItem } from '@app-types/admin/feedback.types';
import type { RoomFeedbackRating } from '@app-types/chat/chat-room.type';
import { FeedbackRoomService } from '../../services/feedback-room-api.service';
import { FeedbackListOptionsService } from '../../services/feedback-list-options.service';
import { DialogComponent, DialogData } from '@shared/components/dialog/dialog.component';
import { FolderModalComponent } from '../folder-modal/folder-modal.component';
import { buildSatisfactionAdditionalLearningContent } from '../../utils/additional-learning-content';
import {
  resolveAssistantName,
  UNKNOWN_FEEDBACK_ASSISTANT_I18N_KEY,
} from '../../utils/assistant-name.util';

@Component({
  selector: 'app-satisfaction-tab',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    PaginationComponent,
    SelectComponent,
    SelectWithSearchComponent,
    TableListComponent,
    TableListItemComponent,
    FormSortInputComponent,
    SvgIconComponent,
    ContextMenuComponent,
    CircularLoadingComponent,
  ],
  templateUrl: './satisfaction-tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
})
export class SatisfactionTabComponent {
  private readonly translate = inject(TranslateService);
  private readonly feedbackListOptionsService = inject(FeedbackListOptionsService);
  private readonly feedbackRoomService = inject(FeedbackRoomService);
  private readonly dialog = inject(MatDialog);
  private readonly queryClient = inject(QueryClient);

  readonly currentLang = toSignal(this.translate.onLangChange.pipe(map((e) => e.lang)), {
    initialValue: this.translate.getCurrentLang(),
  });

  // Filter state
  readonly selectedAssistant = signal<string | null>(null);
  readonly selectedSatisfaction = signal<string | null>(null);
  readonly selectedFolder = signal<string | null>(null);
  readonly sortField = signal<string | null>('updatedAt');
  readonly sortOrder = signal<string | null>('desc');
  readonly currentPage = signal(1);
  readonly pageSize = signal(5);

  readonly folders = this.feedbackListOptionsService.folders;
  readonly folderOptions = this.feedbackListOptionsService.folderOptions;
  readonly satisfactionOptions = this.feedbackListOptionsService.satisfactionOptions;

  readonly satisfactionQuery = this.feedbackRoomService.createRoomFeedbackQuery(() => {
    const assistantId = toFilterParam(this.selectedAssistant());
    const rating = toRoomFeedbackRating(this.selectedSatisfaction());
    const folderId = toFilterParam(this.selectedFolder());
    const page = this.currentPage() - 1;
    const size = this.pageSize();
    const sortField = this.sortField() ?? undefined;
    const sortOrder = this.sortOrder() ?? undefined;

    return { assistantId, rating, folderId, page, size, sortField, sortOrder };
  });

  readonly items = computed<SatisfactionFeedbackItem[]>(() => {
    this.currentLang();
    const unknownAssistantLabel = this.translate.instant(UNKNOWN_FEEDBACK_ASSISTANT_I18N_KEY);
    const data = this.satisfactionQuery.data();
    if (!data) return [];
    const folders = this.folders();
    return data.feedbacks.content.map((fb) => {
      return {
        id: fb.id,
        userName: fb.userName ?? fb.userId,
        satisfaction: toSatisfactionValue(fb.rating),
        roomName: fb.room.name,
        roomId: fb.roomId,
        assistantName: resolveAssistantName(fb.room.defaultAssistantName, unknownAssistantLabel),
        indexId: fb.indexId,
        learningFolder: folders.find((f) => f.id === fb.indexId)?.name ?? '-',
        addLearning: fb.indexId ? 'ON' : 'OFF',
        updatedAt: fb.updatedAt,
      };
    });
  });

  readonly isLoading = computed(() => this.satisfactionQuery.isLoading());

  // Filter options
  readonly assistantOptions = this.feedbackListOptionsService.assistantOptions;

  readonly sortFieldOptions = computed<SortOption[]>(() => {
    this.currentLang();
    return [
      { value: 'updatedAt', label: this.translate.instant('FEEDBACK.SORT_BY_UPDATED') },
      { value: 'chat', label: this.translate.instant('FEEDBACK.SORT_BY_CHAT') },
      { value: 'name', label: this.translate.instant('FEEDBACK.SORT_BY_ASSISTANT') },
      { value: 'level', label: this.translate.instant('FEEDBACK.SORT_BY_LEVEL') },
      { value: 'add', label: this.translate.instant('FEEDBACK.SORT_BY_ADD_LEARNING') },
      { value: 'folder', label: this.translate.instant('FEEDBACK.SORT_BY_FOLDER') },
    ];
  });

  readonly sortOrderOptions = computed<SortOption[]>(() => {
    this.currentLang();
    return [
      { value: 'asc', label: this.translate.instant('FEEDBACK.SORT_ASC') },
      { value: 'desc', label: this.translate.instant('FEEDBACK.SORT_DESC') },
    ];
  });

  readonly filteredItems = computed(() => this.items());

  readonly paginatedItems = computed(() => this.items());

  readonly totalPages = computed(() => this.satisfactionQuery.data()?.feedbacks.totalPages ?? 1);

  readonly pageRange = computed(() => {
    const feedbacks = this.satisfactionQuery.data()?.feedbacks;
    const total = feedbacks?.totalElements ?? 0;
    const page = feedbacks?.number ?? 0;
    const size = feedbacks?.size ?? this.pageSize();
    const from = total > 0 ? page * size + 1 : 0;
    const to = Math.min(from + (feedbacks?.numberOfElements ?? 0) - 1, total);
    return { from, to, total };
  });

  readonly countDisplay = computed(() => {
    const r = this.pageRange();
    if (r.total === 0) return '';
    return this.translate.instant('FEEDBACK.PAGE_COUNT', r);
  });

  // Event handlers
  onAssistantChange(value: string | null) {
    this.selectedAssistant.set(value);
    this.currentPage.set(1);
  }

  onSatisfactionChange(value: string | null) {
    this.selectedSatisfaction.set(value);
    this.currentPage.set(1);
  }

  onFolderChange(value: string | null) {
    this.selectedFolder.set(value);
    this.currentPage.set(1);
  }

  onSortFieldChange(value: string | null) {
    this.sortField.set(value);
    this.currentPage.set(1);
  }

  onSortOrderChange(value: string | null) {
    if (value) this.sortOrder.set(value);
    this.currentPage.set(1);
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
  }

  getSatisfactionLabel(satisfaction: string): string {
    const map: Record<string, string> = {
      star5: '★★★★★',
      star4: '★★★★☆',
      star3: '★★★☆☆',
      star2: '★★☆☆☆',
      star1: '★☆☆☆☆',
      unrated: this.translate.instant('FEEDBACK.UNRATED'),
    };
    return map[satisfaction] ?? '-';
  }

  readonly folderModalSelected = signal<string | null>(null);
  readonly folderModalDisabled = computed(() => !this.folderModalSelected());

  openFolderModal(item: SatisfactionFeedbackItem): void {
    this.folderModalSelected.set(item.indexId ?? null);
    const dialogRef = this.dialog.open(DialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      data: {
        title: this.translate.instant('FEEDBACK.SPECIFY_FOLDER'),
        contentComponent: FolderModalComponent,
        contentComponentInputs: { selectedFolderSignal: this.folderModalSelected },
        showCancel: true,
        cancelText: this.translate.instant('COMMON.CANCEL'),
        showConfirm: true,
        confirmText: this.translate.instant('FEEDBACK.ADD_LEARNING'),
        confirmDisabledSignal: this.folderModalDisabled,
        confirmLoadingSignal: this.feedbackRoomService.isAddingLearning,
        buttonAlign: 'right',
        confirmAction: () => {
          const folderId = this.folderModalSelected();
          if (!folderId) return;
          const roomId = item.roomId;
          if (!roomId) return;
          const content = buildSatisfactionAdditionalLearningContent(item);
          void this.feedbackRoomService
            .addAdditionalLearning(folderId, roomId, content)
            .then(() => {
              void this.queryClient.invalidateQueries({ queryKey: ['feedback', 'satisfaction'] });
              dialogRef.close(true);
            });
        },
      } as DialogData,
    });
  }
}

function toRoomFeedbackRating(value: string | null): RoomFeedbackRating | 'UNRATED' | undefined {
  const map: Record<string, RoomFeedbackRating | 'UNRATED'> = {
    star5: 'EXCELLENT',
    star4: 'VERY_GOOD',
    star3: 'GOOD',
    star2: 'AVERAGE',
    star1: 'POOR',
    unrated: 'UNRATED',
  };
  return value ? map[value] : undefined;
}

/** 'all' または null/undefined をフィルターなし（undefined）に正規化する */
function toFilterParam(value: string | null | undefined): string | undefined {
  return value && value !== 'all' ? value : undefined;
}

function toSatisfactionValue(
  rating: RoomFeedbackRating | undefined,
): SatisfactionFeedbackItem['satisfaction'] {
  const map: Record<RoomFeedbackRating, SatisfactionFeedbackItem['satisfaction']> = {
    EXCELLENT: 'star5',
    VERY_GOOD: 'star4',
    GOOD: 'star3',
    AVERAGE: 'star2',
    POOR: 'star1',
  };
  return rating ? map[rating] : 'unrated';
}
