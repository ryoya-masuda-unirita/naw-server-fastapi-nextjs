import { Component, ChangeDetectionStrategy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { injectQuery } from '@tanstack/angular-query-experimental';
import type { GetMessageFeedbackViewModel } from '@app-types/admin/feedback.types';
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
import { SelectOption } from '@app-types/common';
import type { FeedbackItem } from '@app-types/admin/feedback.types';
import { FeedbackMessageApiService } from '../../services/feedback-message-api.service';
import { DialogComponent, DialogData } from '@shared/components/dialog/dialog.component';
import { FolderModalComponent } from '../folder-modal/folder-modal.component';
import { CircularLoadingComponent } from '@shared/components/circular-loading/circular-loading.component';
import { FeedbackListOptionsService } from '../../services/feedback-list-options.service';
import { buildAccuracyAdditionalLearningContent } from '../../utils/additional-learning-content';
import {
  resolveAssistantName,
  UNKNOWN_FEEDBACK_ASSISTANT_I18N_KEY,
} from '../../utils/assistant-name.util';

@Component({
  selector: 'app-accuracy-tab',
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
  templateUrl: './accuracy-tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
})
export class AccuracyTabComponent {
  private readonly translate = inject(TranslateService);
  private readonly feedbackApiService = inject(FeedbackMessageApiService);
  private readonly feedbackListOptionsService = inject(FeedbackListOptionsService);
  private readonly dialog = inject(MatDialog);

  readonly currentLang = toSignal(this.translate.onLangChange.pipe(map((e) => e.lang)), {
    initialValue: this.translate.getCurrentLang(),
  });

  readonly folders = this.feedbackListOptionsService.folders;
  readonly folderOptions = this.feedbackListOptionsService.folderOptions;

  private readonly queryClient = inject(QueryClient);

  // Filter state
  readonly selectedAssistant = signal<string | null>(null);
  readonly selectedAccuracy = signal<string | null>(null);
  readonly selectedFolder = signal<string | null>(null);
  readonly sortField = signal<string | null>('updatedAt');
  readonly sortOrder = signal<string | null>('desc');
  readonly currentPage = signal(1);
  readonly pageSize = signal(5);

  readonly accuracyQuery = injectQuery(() => {
    const assistantId = toFilterParam(this.selectedAssistant());
    const accuracy = this.selectedAccuracy();
    const rating = accuracy === 'accurate' ? 'GOOD' : accuracy === 'inaccurate' ? 'BAD' : undefined;
    const folderId = toFilterParam(this.selectedFolder());
    const page = this.currentPage() - 1; // API is 0-based
    const size = this.pageSize();
    const sortField = this.sortField() ?? undefined;
    const sortOrder = this.sortOrder() ?? undefined;
    return {
      queryKey: [
        'feedback',
        'accuracy',
        { assistantId, rating, folderId, page, size, sortField, sortOrder },
      ] as const,
      refetchOnMount: 'always' as const,
      queryFn: (): Promise<GetMessageFeedbackViewModel> =>
        this.feedbackApiService.fetchAccuracyFeedback({
          assistantId,
          rating,
          folderId,
          page,
          size,
          sortField,
          sortOrder,
        }),
    };
  });

  readonly items = computed<FeedbackItem[]>(() => {
    this.currentLang();
    const unknownAssistantLabel = this.translate.instant(UNKNOWN_FEEDBACK_ASSISTANT_I18N_KEY);
    const data = this.accuracyQuery.data();
    if (!data) return [];
    const folders = this.folders();
    return data.feedbacks.content.map((fb) => {
      return {
        id: fb.id,
        accuracy: fb.rating === 'GOOD' ? 'accurate' : 'inaccurate',
        assistantName: resolveAssistantName(fb.message?.assistantName, unknownAssistantLabel),
        indexId: fb.indexId,
        learningFolder: folders.find((f) => f.id === fb.indexId)?.name ?? '-',
        questionSummary: toPlainTableCellText(fb.message?.content?.question ?? ''),
        answerSummary: toPlainTableCellText(fb.message?.content?.answer ?? ''),
        updatedAt: fb.updatedAt,
      };
    });
  });

  readonly isLoading = computed(() => this.accuracyQuery.isLoading());

  // Filter options
  readonly assistantOptions = this.feedbackListOptionsService.assistantOptions;

  readonly accuracyOptions = computed<SelectOption[]>(() => {
    this.currentLang();
    return [
      { value: 'all', label: this.translate.instant('FEEDBACK.ALL_ACCURACY') },
      { value: 'inaccurate', label: this.translate.instant('FEEDBACK.INACCURATE') },
      { value: 'accurate', label: this.translate.instant('FEEDBACK.ACCURATE') },
    ];
  });

  readonly sortFieldOptions = computed<SortOption[]>(() => {
    this.currentLang();
    return [
      { value: 'updatedAt', label: this.translate.instant('FEEDBACK.SORT_BY_UPDATED') },
      { value: 'name', label: this.translate.instant('FEEDBACK.SORT_BY_ASSISTANT') },
      { value: 'accuracy', label: this.translate.instant('FEEDBACK.SORT_BY_ACCURACY') },
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

  readonly paginatedItems = computed(() => this.items());

  readonly totalPages = computed(() => this.accuracyQuery.data()?.feedbacks.totalPages ?? 1);

  readonly pageRange = computed(() => {
    const feedbacks = this.accuracyQuery.data()?.feedbacks;
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

  onAccuracyChange(value: string | null) {
    this.selectedAccuracy.set(value);
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
    this.sortOrder.set(value);
    this.currentPage.set(1);
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
  }

  getAccuracyLabel(accuracy: string): string {
    return accuracy === 'accurate'
      ? this.translate.instant('FEEDBACK.ACCURATE')
      : this.translate.instant('FEEDBACK.INACCURATE');
  }

  readonly folderModalSelected = signal<string | null>(null);
  readonly folderModalDisabled = computed(() => !this.folderModalSelected());

  openFolderModal(item: FeedbackItem): void {
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
        confirmLoadingSignal: this.feedbackApiService.isAddingLearning,
        buttonAlign: 'right',
        confirmAction: () => {
          const folderId = this.folderModalSelected();
          if (!folderId) return;
          const content = buildAccuracyAdditionalLearningContent(item);
          void this.feedbackApiService
            .addAdditionalLearning(folderId, item.id, content)
            .then(() => {
              void this.queryClient.invalidateQueries({ queryKey: ['feedback', 'accuracy'] });
              dialogRef.close(true);
            });
        },
      } as DialogData,
    });
  }
}

function toPlainTableCellText(value: string): string {
  const withoutHtml = value.replace(/<[^>]*>/g, ' ');
  return decodeHtmlEntities(stripMarkdownSyntax(withoutHtml))
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();
}

function stripMarkdownSyntax(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_~>#-]+/g, ' ');
}

/** 'all' または null/undefined をフィルターなし（undefined）に正規化する */
function toFilterParam(value: string | null | undefined): string | undefined {
  return value && value !== 'all' ? value : undefined;
}

function decodeHtmlEntities(value: string): string {
  const entities: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
  };
  return value.replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (entity) => entities[entity] ?? entity);
}
