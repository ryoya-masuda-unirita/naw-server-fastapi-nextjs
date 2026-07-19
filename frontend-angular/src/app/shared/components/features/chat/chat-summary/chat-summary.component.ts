import { NgClass } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
  WritableSignal,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { DropdownService } from '@core/services/dropdown.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MatIcon } from '@angular/material/icon';
import { DialogComponent, DialogData } from '@shared/components/dialog/dialog.component';
import {
  ChatSaveLibraryDialogComponent,
  ChatSaveLibraryDialogActionBridge,
} from '@features/chat/components/chat-save-library-dialog/chat-save-library-dialog.component';
import { LibraryService } from '@features/chat/services/library.service';
import { ViewerService } from '@features/chat/services/viewer.service';
import { ViewerListItem } from '@core/constants/mock-data/viewer-content.mock';
import { MarkdownComponent } from 'ngx-markdown';
import { ChartBlockDirective } from '@shared/directives/chart-block.directive';
import { printHtmlContent } from '@core/utils/common.helpers';
import { CircularLoadingComponent } from '@shared/components/circular-loading/circular-loading.component';

export interface ViewerDocument {
  id: string;
  title: string;
}

@Component({
  selector: 'app-chat-summary',
  standalone: true,
  imports: [
    TranslateModule,
    NgClass,
    MatIcon,
    MarkdownComponent,
    ChartBlockDirective,
    CircularLoadingComponent,
  ],
  templateUrl: './chat-summary.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col w-full h-full overflow-hidden',
  },
})
export class ChatSummaryComponent {
  private readonly dropdownService = inject(DropdownService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly libraryService = inject(LibraryService);
  private readonly viewerService = inject(ViewerService);
  private readonly router = inject(Router);

  readonly chatId = input<string | null>(null);
  readonly isDetailPage = input<boolean>(false);
  readonly isReadOnly = input<boolean>(false);
  readonly headerOptions = input<ViewerListItem[]>([]);

  readonly activeDoc = computed<ViewerDocument>(() => {
    if (this.isStreamingForThisViewer() && this.viewerService.streamingLibraryTitle()) {
      return { id: '', title: this.viewerService.streamingLibraryTitle() };
    }
    return this.viewerService.activeLibrary() ?? { id: '', title: '' };
  });

  readonly isCollapsed = signal<boolean>(false);
  /** 自動折りたたみによる状態か（手動操作と区別する） */
  private readonly autoCollapsed = signal<boolean>(false);

  readonly collapseChange = output<boolean>();
  readonly openNewTab = output<void>();
  readonly saveLibrary = output<void>();
  readonly savePdf = output<void>();

  readonly isTitleMenuOpen = signal<boolean>(false);
  readonly titleMenuStyle = signal<{ top: string; left: string }>({ top: '0px', left: '0px' });
  readonly titleMenuTrigger = viewChild<ElementRef<HTMLButtonElement>>('titleMenuTrigger');

  readonly isMoreMenuOpen = signal<boolean>(false);
  readonly moreMenuStyle = signal<{ top: string; left: string }>({ top: '0px', left: '0px' });
  readonly moreMenuTrigger = viewChild<ElementRef<HTMLButtonElement>>('moreMenuTrigger');
  readonly markdownContent = viewChild<ElementRef<HTMLElement>>('markdownContent');

  /** このビューワーが表示しているルームに対するライブラリストリーミングかどうか */
  private readonly isStreamingForThisViewer = computed(
    () =>
      this.viewerService.isLibraryStreaming() &&
      this.viewerService.streamingRoomId() === this.chatId(),
  );

  readonly canSaveLibrary = computed(
    () =>
      !this.isReadOnly() &&
      !this.isDetailPage() &&
      !this.isStreamingForThisViewer() &&
      !!this.activeDoc().id,
  );

  readonly isListLoading = computed(() => this.viewerService.isLoadingList());
  readonly hasListLoadError = computed(() => this.viewerService.listLoadError());
  readonly hasContentLoadError = computed(() => this.viewerService.contentLoadError());
  readonly isContentLoading = computed(() => this.viewerService.isLoading());
  readonly isViewerEmpty = computed(
    () =>
      !this.isListLoading() &&
      !this.hasListLoadError() &&
      this.headerOptions().length === 0 &&
      !this.isStreamingForThisViewer(),
  );

  /** 一覧取得完了後にのみ自動折りたたみを評価する */
  private readonly shouldAutoCollapse = computed(() => {
    if (this.isDetailPage() || this.isStreamingForThisViewer()) {
      return false;
    }

    const chatId = this.chatId();
    if (chatId && !this.viewerService.hasListLoadedFor(chatId)) {
      return false;
    }

    return this.isViewerEmpty();
  });

  constructor() {
    // ライブラリのストリーミング開始時は本文を表示できるよう自動展開する
    // （collapseChange の伝播で chat-data-panel 側の折りたたみも解除される）
    effect(() => {
      if (this.isStreamingForThisViewer() && this.isCollapsed()) {
        this.isCollapsed.set(false);
        this.collapseChange.emit(false);
      }
    });

    // ライブラリが1件も存在しないルームでは、一覧取得完了後にビューワーを閉じる
    effect(() => {
      if (this.shouldAutoCollapse()) {
        if (!this.isCollapsed()) {
          this.isCollapsed.set(true);
          this.autoCollapsed.set(true);
          this.collapseChange.emit(true);
        }
        return;
      }

      if (this.autoCollapsed() && this.isCollapsed() && !this.isViewerEmpty()) {
        this.isCollapsed.set(false);
        this.autoCollapsed.set(false);
        this.collapseChange.emit(false);
      }
    });
  }

  readonly markdownData = computed(() => this.viewerService.markdownContent());

  toggleCollapse(): void {
    this.isTitleMenuOpen.set(false);
    this.isMoreMenuOpen.set(false);
    this.dropdownService.notifyClosed();
    this.autoCollapsed.set(false);
    this.isCollapsed.update((v) => !v);
    this.collapseChange.emit(this.isCollapsed());
  }

  toggleTitleMenu(): void {
    if (this.isTitleMenuOpen()) {
      this.isTitleMenuOpen.set(false);
      this.dropdownService.notifyClosed();
      return;
    }

    const rect = this.titleMenuTrigger()?.nativeElement.getBoundingClientRect();
    if (rect) {
      this.titleMenuStyle.set({ top: `${rect.bottom + 4}px`, left: `${rect.left}px` });
    }
    this.isMoreMenuOpen.set(false);
    this.isTitleMenuOpen.set(true);

    this.dropdownService.open(() => this.closeTitleMenu());
  }

  closeTitleMenu(): void {
    this.isTitleMenuOpen.set(false);
  }

  selectDocument(doc: ViewerDocument): void {
    this.viewerService.selectLibrary(doc);
    this.isTitleMenuOpen.set(false);
    this.dropdownService.notifyClosed();
  }

  toggleMoreMenu(): void {
    if (this.isMoreMenuOpen()) {
      this.isMoreMenuOpen.set(false);
      this.dropdownService.notifyClosed();
      return;
    }

    const rect = this.moreMenuTrigger()?.nativeElement.getBoundingClientRect();
    if (rect) {
      this.moreMenuStyle.set({
        top: `${rect.bottom + 4}px`,
        left: `${rect.right - 280}px`,
      });
    }
    this.isTitleMenuOpen.set(false);
    this.isMoreMenuOpen.set(true);

    this.dropdownService.open(() => this.closeMoreMenu());
  }

  closeMoreMenu(): void {
    this.isMoreMenuOpen.set(false);
  }

  openInNewTab(): void {
    this.openNewTab.emit();
    this.isMoreMenuOpen.set(false);
    this.dropdownService.notifyClosed();

    const chatId = this.chatId();
    if (!chatId) return;
    const libraryId = this.activeDoc().id;
    const url = libraryId
      ? `/chat/viewer/${chatId}?libraryId=${libraryId}`
      : `/chat/viewer/${chatId}`;
    window.open(url, '_blank');
  }

  onSaveToLibrary(): void {
    this.isMoreMenuOpen.set(false);
    this.dropdownService.notifyClosed();

    const noop = (): void => {
      void 0;
    };
    const contentName: WritableSignal<string> = signal(this.activeDoc().title);
    const selectedTagIds: WritableSignal<string[]> = signal([]);
    const selectedTeamIds: WritableSignal<string[]> = signal([]);
    const confirmDisabled = computed(() => contentName().trim().length === 0);

    const actionBridge: ChatSaveLibraryDialogActionBridge = {
      runCancel: noop,
      runSave: noop,
      contentName,
      selectedTagIds,
      selectedTeamIds,
    };

    const dialogRef = this.dialog.open(DialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      panelClass: 'dialog-overflow-visible',
      autoFocus: false,
      data: {
        title: this.translate.instant('CHAT.VIEWER.SAVE_LIBRARY_DIALOG.TITLE'),
        showClose: false,
        showCancel: true,
        showConfirm: true,
        buttonAlign: 'right',
        cancelText: this.translate.instant('COMMON.CANCEL'),
        confirmText: this.translate.instant('CHAT.VIEWER.SAVE_LIBRARY_DIALOG.SAVE'),
        cancelAction: () => actionBridge.runCancel(),
        confirmAction: () => actionBridge.runSave(),
        confirmLoadingSignal: this.libraryService.isSavingToLibrary,
        confirmDisabledSignal: confirmDisabled,
        contentComponent: ChatSaveLibraryDialogComponent,
        contentComponentInputs: { actionBridge },
      } as DialogData,
    });

    actionBridge.runCancel = () => dialogRef.close(null);
    actionBridge.runSave = () => {
      const libraryId = this.activeDoc().id;
      if (!libraryId) return;

      void this.libraryService
        .updateLibraryMetadata(libraryId, {
          name: contentName().trim(),
          tags: selectedTagIds(),
          groups: selectedTeamIds(),
        })
        .then((result) => {
          if (!result) return;
          this.viewerService.updateLibraryTitle(libraryId, contentName().trim());
          dialogRef.close(true);
          this.saveLibrary.emit();
        });
    };
  }

  onMarkdownContentClick(event: MouseEvent): void {
    if (this.isReadOnly()) {
      return;
    }

    // Check if the clicked element is a button inside the markdown content (not in dropdown menus)
    const clickedButton = (event.target as HTMLElement).closest('button');
    const isDropdownButton = clickedButton?.closest('.dropdown-menu');

    if (clickedButton && !isDropdownButton) {
      this.onSaveToPdf();
    }
  }

  onSaveToPdf(): void {
    this.isMoreMenuOpen.set(false);
    this.dropdownService.notifyClosed();
    const title = this.activeDoc().title || this.translate.instant('CHAT.VIEWER.TITLE');
    printHtmlContent(this.markdownContent()?.nativeElement, title);
    this.savePdf.emit();
  }
}
