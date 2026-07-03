import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DropdownService } from '@core/services/dropdown.service';
import { TranslateModule } from '@ngx-translate/core';
import {
  TemplateSelectorComponent,
  Template,
} from '../template-selector/template-selector.component';
import { ActiveFeaturesWidgetComponent } from '../active-features-widget/active-features-widget.component';
import { AssistantsService } from '../../services/assistants.service';
import { PromptTemplatesService } from '../../services/prompt-templates.service';
import { Assistant } from '@app-types/chat/assistant.type';
import { filterAssistants, parseLeadingMention } from '@core/utils/assistant-filter.helpers';
import { getFilePreviewUrl } from '@core/utils/file.helpers';
import { resolveInitialAssistant } from '@core/utils/resolve-initial-assistant.helpers';
import { ChatAssistantSelectorComponent } from '../chat-assistant-selector/chat-assistant-selector.component';
import { ChatAssistantMentionPanelComponent } from '../chat-assistant-mention-panel/chat-assistant-mention-panel.component';
import { FileChipComponent, FileImageChipComponent } from '@app/shared/components/file';
import { ChatClaudeComponent } from '../chat-claude/chat-claude.component';
import { SvgIconComponent } from '@app/shared/components/icons/svg-icon.component';
import { ChatAlertComponent } from '../chat-alert/chat-alert.component';
import { ChatErrorComponent } from '../chat-error/chat-error.component';
import {
  CHAT_ATTACHMENT_ACCEPT,
  isAllowedChatAttachment,
} from '@features/chat/constants/chat-attachment.constants';

@Component({
  selector: 'app-chat-input',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MatIconModule,
    TemplateSelectorComponent,
    ActiveFeaturesWidgetComponent,
    ChatAssistantSelectorComponent,
    ChatAssistantMentionPanelComponent,
    FileImageChipComponent,
    FileChipComponent,
    ChatClaudeComponent,
    SvgIconComponent,
    ChatAlertComponent,
    ChatErrorComponent,
  ],
  templateUrl: './chat-input.component.html',
  styleUrl: './chat-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'hostClass()',
  },
})
export class ChatInputComponent {
  readonly hostClass = input<string>('chat-input');
  private readonly dropdownService = inject(DropdownService);
  private readonly assistantsService = inject(AssistantsService);
  private readonly promptTemplatesService = inject(PromptTemplatesService);
  readonly getFilePreviewUrl = getFilePreviewUrl;
  readonly chatAttachmentAccept = CHAT_ATTACHMENT_ACCEPT;
  readonly send = output<{
    content: string;
    files: File[];
    assistantId: string | null;
    useWebSearch: boolean;
    additionalPrompt?: string;
    createLibrary: boolean;
  }>();
  readonly isAlert = input<boolean>(false);
  readonly isError = input<boolean>(false);
  readonly roomId = input<string | null>(null);
  readonly defaultAssistantId = input<string | null>(null);

  readonly messageContent = signal<string>('');
  readonly attachedFiles = signal<File[]>([]);
  readonly isDragging = signal<boolean>(false);
  readonly isSending = signal<boolean>(false);
  readonly isAddMenuOpen = signal<boolean>(false);
  readonly addMenuStyle = signal<{ bottom: string; left: string }>({ bottom: '0px', left: '0px' });
  readonly selectedAssistant = signal<Assistant | null>(null);
  readonly isClaude = signal<boolean>(false);

  private readonly assistantsQuery = this.assistantsService.assistantsQuery;
  private readonly promptTemplatesQuery = this.promptTemplatesService.promptTemplatesQuery;
  readonly assistants = computed(() => this.assistantsQuery.data() ?? []);
  readonly isAssistantsLoading = computed(() => this.assistantsQuery.isPending());
  readonly templates = computed(() => this.promptTemplatesQuery.data() ?? []);
  readonly isTemplatesLoading = computed(() => this.promptTemplatesQuery.isPending());

  readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  readonly textarea = viewChild<ElementRef<HTMLTextAreaElement>>('textarea');
  readonly addMenuTrigger = viewChild<ElementRef<HTMLButtonElement>>('addMenuTrigger');
  readonly activeFeaturesWidget = viewChild(ActiveFeaturesWidgetComponent);

  private isComposing = false;
  private justFinishedComposing = false;
  private syncedRoomKey: string | null = null;

  // Active feature state
  readonly webSearchActive = signal<boolean>(false);
  readonly templateActive = signal<Template | null>(null);
  readonly createLibraryActive = signal<boolean>(false);
  readonly activeCount = computed(
    () =>
      (this.webSearchActive() ? 1 : 0) +
      (this.templateActive() ? 1 : 0) +
      (this.createLibraryActive() ? 1 : 0),
  );

  // Template submenu
  readonly menuSection = signal<'main' | 'templates'>('main');
  readonly isTemplateMenuOpen = signal<boolean>(false);
  readonly templateMenuStyle = signal<{ bottom: string; left: string }>({
    bottom: '0px',
    left: '0px',
  });
  readonly isMentionDismissed = signal<boolean>(false);
  readonly mentionActiveIndex = signal<number>(0);

  readonly isMentionOpen = computed(
    () => this.messageContent().startsWith('@') && !this.isMentionDismissed(),
  );
  readonly isMentionPending = computed(() => this.messageContent().startsWith('@'));
  readonly mentionQuery = computed(() => parseLeadingMention(this.messageContent()).query);
  readonly filteredMentionAssistants = computed(() => {
    if (!this.isMentionOpen()) {
      return [];
    }
    return filterAssistants(this.mentionQuery(), this.assistants());
  });
  readonly isMentionEmpty = computed(
    () => this.isMentionOpen() && this.filteredMentionAssistants().length === 0,
  );

  readonly canSend = computed(() => {
    return (
      !this.isSending() &&
      !this.isMentionPending() &&
      (this.messageContent().trim().length > 0 || this.attachedFiles().length > 0)
    );
  });

  readonly totalFileSize = computed(() => {
    return this.attachedFiles().reduce((total, file) => total + file.size, 0);
  });

  constructor() {
    effect(() => {
      const list = this.assistantsQuery.data();
      if (!list?.length) {
        return;
      }

      const roomId = this.roomId();
      const roomKey = roomId ?? '__new__';
      const defaultAssistantId = roomId ? this.defaultAssistantId() : null;

      if (this.syncedRoomKey === roomKey && this.selectedAssistant()) {
        return;
      }

      const resolved = resolveInitialAssistant(list, defaultAssistantId);
      if (!resolved) {
        return;
      }

      this.selectedAssistant.set(resolved);
      this.syncedRoomKey = roomKey;
    });
  }

  handleSend(): void {
    if (!this.canSend() || this.isSending()) return;

    this.isSending.set(true);

    this.send.emit({
      content: this.messageContent(),
      files: this.attachedFiles(),
      assistantId: this.selectedAssistant()?.id ?? null,
      useWebSearch: this.webSearchActive(),
      additionalPrompt: this.templateActive()?.systemPrompt,
      createLibrary: this.createLibraryActive(),
    });

    this.messageContent.set('');
    this.attachedFiles.set([]);
    // ライブラリ作成は1回の送信ごとに解除する（Web検索は維持）
    this.createLibraryActive.set(false);
    this.resetTextareaHeight();
    this.isSending.set(false);
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (this.isMentionOpen()) {
      const filtered = this.filteredMentionAssistants();

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (filtered.length === 0) return;
        this.mentionActiveIndex.update((index) => Math.min(index + 1, filtered.length - 1));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (filtered.length === 0) return;
        this.mentionActiveIndex.update((index) => Math.max(index - 1, 0));
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        this.dismissMention();
        return;
      }

      if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
        if (this.isComposing || event.isComposing) {
          return;
        }

        if (filtered.length > 0) {
          event.preventDefault();
          this.confirmMentionSelection(filtered[this.mentionActiveIndex()]);
        } else if (event.key === 'Enter') {
          event.preventDefault();
        }
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      if (this.justFinishedComposing) {
        this.justFinishedComposing = false;
        event.preventDefault();
        return;
      }

      if (this.isComposing || event.isComposing) {
        return;
      }

      event.preventDefault();
      this.handleSend();
    }
  }

  onCompositionStart(): void {
    this.isComposing = true;
    this.justFinishedComposing = false;
  }

  onCompositionEnd(): void {
    this.isComposing = false;
    this.justFinishedComposing = true;

    setTimeout(() => {
      this.justFinishedComposing = false;
    }, 100);

    this.syncMentionState();
  }

  handleFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.addAttachedFiles(Array.from(input.files));
      input.value = '';
    }
  }

  openFileSelector(): void {
    this.fileInput()?.nativeElement.click();
  }

  removeFile(index: number): void {
    this.attachedFiles.update((files) => files.filter((_, i) => i !== index));
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  getFileIcon(file: File): string {
    const type = file.type.split('/')[0];
    switch (type) {
      case 'image':
        return 'image';
      case 'video':
        return 'videocam';
      case 'audio':
        return 'audiotrack';
      case 'application':
        if (file.type.includes('pdf')) return 'picture_as_pdf';
        return 'description';
      default:
        return 'attach_file';
    }
  }

  getFileTypeLabel(file: File): string {
    if (file.type.includes('pdf')) return 'PDF';
    if (file.type.includes('word') || file.type.includes('document')) return 'DOC';
    if (file.type.includes('sheet') || file.type.includes('excel')) return 'XLS';
    if (file.type.startsWith('image/')) {
      const format = file.type.split('/')[1]?.toUpperCase();
      return format || 'IMG';
    }
    return file.name.split('.').pop()?.toUpperCase() || 'FILE';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);

    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.addAttachedFiles(Array.from(event.dataTransfer.files));
    }
  }

  private addAttachedFiles(files: File[]): void {
    const allowedFiles = files.filter(isAllowedChatAttachment);
    if (allowedFiles.length === 0) {
      return;
    }

    this.attachedFiles.update((current) => [...current, ...allowedFiles]);
  }

  onInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    this.autoResize(textarea);

    if (!this.isComposing) {
      this.syncMentionState();
    }
  }

  autoResize(textarea: HTMLTextAreaElement): void {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  }

  resetTextareaHeight(): void {
    const textarea = this.textarea()?.nativeElement;
    if (textarea) {
      textarea.style.height = 'auto';
    }
  }

  onAssistantSelect(assistant: Assistant): void {
    this.selectedAssistant.set(assistant);
  }

  onMentionHover(index: number): void {
    this.mentionActiveIndex.set(index);
  }

  onMentionSelect(assistant: Assistant): void {
    this.confirmMentionSelection(assistant);
  }

  confirmMentionSelection(assistant: Assistant): void {
    const { rest } = parseLeadingMention(this.messageContent());
    this.messageContent.set(rest);
    this.onAssistantSelect(assistant);
    this.isMentionDismissed.set(false);
    this.mentionActiveIndex.set(0);
    this.resetTextareaHeight();
    this.textarea()?.nativeElement.focus();
  }

  dismissMention(): void {
    this.isMentionDismissed.set(true);
  }

  private syncMentionState(): void {
    const content = this.messageContent();

    if (!content.startsWith('@')) {
      this.isMentionDismissed.set(false);
      this.mentionActiveIndex.set(0);
      return;
    }

    this.isMentionDismissed.set(false);
    const filtered = filterAssistants(parseLeadingMention(content).query, this.assistants());
    if (this.mentionActiveIndex() >= filtered.length) {
      this.mentionActiveIndex.set(Math.max(0, filtered.length - 1));
    }
  }

  toggleAddMenu(): void {
    if (this.isAddMenuOpen()) {
      this.isAddMenuOpen.set(false);
      this.dropdownService.notifyClosed();
      return;
    }
    this.menuSection.set('main');
    this.activeFeaturesWidget()?.closeMultiPanel();
    const btn = this.addMenuTrigger()?.nativeElement;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const menuWidth = 280;
      const pad = 8;
      this.addMenuStyle.set({
        bottom: `${window.innerHeight - rect.top + 4}px`,
        left: `${Math.max(pad, rect.right - menuWidth)}px`,
      });
    }
    this.isAddMenuOpen.set(true);
    // this.dropdownService.open(() => this.closeAddMenu());
  }

  closeAddMenu(): void {
    this.isAddMenuOpen.set(false);
    this.isTemplateMenuOpen.set(false);
    this.menuSection.set('main');
  }

  // Web search feature
  toggleWebSearch(): void {
    this.webSearchActive.update((v) => !v);
  }

  clearWebSearch(): void {
    this.webSearchActive.set(false);
  }

  // Create library feature
  toggleCreateLibrary(): void {
    this.createLibraryActive.update((v) => !v);
  }

  clearCreateLibrary(): void {
    this.createLibraryActive.set(false);
  }

  // Template feature
  openTemplateMenu(): void {
    // Check if mobile (< 768px)
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      // Mobile: switch section inside same modal
      this.menuSection.set('templates');
    } else {
      // PC: toggle separate popup
      if (this.isTemplateMenuOpen()) {
        this.isTemplateMenuOpen.set(false);
        return;
      }
      // Position template menu to the right of add menu
      const addMenuLeft = parseFloat(this.addMenuStyle().left) || 0;
      const addMenuWidth = 280; // w-70 = 280px
      const gap = 8;
      this.templateMenuStyle.set({
        bottom: this.addMenuStyle().bottom,
        left: `${addMenuLeft + addMenuWidth + gap}px`,
      });
      this.isTemplateMenuOpen.set(true);
    }
  }

  backToMain(): void {
    // Mobile: go back to main section
    this.menuSection.set('main');
    // PC: close template popup
    this.isTemplateMenuOpen.set(false);
  }

  closeTemplateMenu(): void {
    this.isTemplateMenuOpen.set(false);
    this.menuSection.set('main');
  }

  selectTemplate(tpl: Template): void {
    this.templateActive.set(tpl);
    this.closeTemplateMenu();
    this.closeAddMenu();
  }

  clearTemplate(): void {
    this.templateActive.set(null);
  }

  clearActiveFeature(feature: 'web' | 'template' | 'library'): void {
    if (feature === 'web') {
      this.webSearchActive.set(false);
    } else if (feature === 'template') {
      this.templateActive.set(null);
    } else {
      this.createLibraryActive.set(false);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.isAddMenuOpen()) {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-chat-add-menu]')) {
        this.closeAddMenu();
      }
    }
  }
}
