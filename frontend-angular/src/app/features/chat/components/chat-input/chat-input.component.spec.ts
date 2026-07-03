import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { Component, Pipe, PipeTransform, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateService } from '@ngx-translate/core';
import { DropdownService } from '@core/services/dropdown.service';
import { AssistantsService } from '../../services/assistants.service';
import { PromptTemplatesService } from '../../services/prompt-templates.service';
import { Assistant } from '@app-types/chat/assistant.type';
import { Template } from '../template-selector/template-selector.component';
import { ChatInputComponent } from './chat-input.component';
import { CHAT_ATTACHMENT_ACCEPT } from '@features/chat/constants/chat-attachment.constants';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

@Component({ selector: 'app-mat-icon', standalone: true, template: '' })
class MatIconStub {}

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {
  readonly name = input<string>('');
}

@Component({ selector: 'app-chat-claude', standalone: true, template: '' })
class ChatClaudeStub {}

@Component({ selector: 'app-chat-alert', standalone: true, template: '' })
class ChatAlertStub {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly dismissed = output<void>();
}

@Component({ selector: 'app-chat-error', standalone: true, template: '' })
class ChatErrorStub {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly dismissed = output<void>();
}

@Component({ selector: 'app-file-chip', standalone: true, template: '' })
class FileChipStub {
  readonly file = input.required<File>();
  readonly showRemoveBtn = input<boolean>(true);
  readonly remove = output<void>();
}

@Component({ selector: 'app-file-image-chip', standalone: true, template: '' })
class FileImageChipStub {
  readonly file = input.required<File>();
  readonly showRemoveBtn = input<boolean>(true);
  readonly remove = output<void>();
}

@Component({ selector: 'app-chat-assistant-selector', standalone: true, template: '' })
class ChatAssistantSelectorStub {
  readonly assistants = input.required<Assistant[]>();
  readonly selectedAssistant = input<Assistant | null>(null);
  readonly assistantSelect = output<Assistant>();
}

@Component({ selector: 'app-chat-assistant-mention-panel', standalone: true, template: '' })
class ChatAssistantMentionPanelStub {
  readonly assistants = input.required<Assistant[]>();
  readonly activeIndex = input<number>(0);
  readonly isEmpty = input<boolean>(false);
  readonly selectedAssistantId = input<string | null>(null);
  readonly select = output<Assistant>();
  readonly hoverIndex = output<number>();
}

@Component({ selector: 'app-template-selector', standalone: true, template: '' })
class TemplateSelectorStub {
  readonly templates = input.required<Template[]>();
  readonly activeTemplate = input<Template | null>(null);
  readonly showBackButton = input<boolean>(false);
  readonly showPreviewImage = input<boolean>(false);
  readonly templateSelect = output<Template>();
  readonly back = output<void>();
}

@Component({ selector: 'app-active-features-widget', standalone: true, template: '' })
class ActiveFeaturesWidgetStub {
  readonly webSearchActive = input<boolean>(false);
  readonly templateActive = input<Template | null>(null);
  readonly createLibraryActive = input<boolean>(false);
  readonly activeCount = input<number>(0);
  readonly clearWebSearch = output<void>();
  readonly clearTemplate = output<void>();
  readonly clearCreateLibrary = output<void>();
  readonly clearFeature = output<'web' | 'template' | 'library'>();
  closeMultiPanel(): void {
    /* empty */
  }
}

const mockTranslate = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  onLangChange: { subscribe: vi.fn() },
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

const mockDropdownService = {
  open: vi.fn(),
  closeAll: vi.fn(),
  notifyClosed: vi.fn(),
};

const mockAssistant: Assistant = {
  id: 'asst-001',
  name: '社内情報アシスタント',
  description: 'テスト用アシスタント',
  category: '社内知識',
  model: 'gpt-4o',
  isDefault: true,
};

const mockAssistant2: Assistant = {
  id: 'asst-002',
  name: 'データ分析アシスタント',
  description: 'テスト2',
  category: 'データ分析',
  model: 'gpt-4o',
};

const mockAssistantsService = {
  assistantsQuery: {
    data: signal<Assistant[] | undefined>([mockAssistant, mockAssistant2]),
    isPending: signal(false),
  },
};

const mockPromptTemplatesService = {
  promptTemplatesQuery: {
    data: signal<Template[] | undefined>([]),
    isPending: signal(false),
  },
};

describe('ChatInputComponent', () => {
  let fixture: ComponentFixture<ChatInputComponent>;
  let component: ChatInputComponent;

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [ChatInputComponent, NoopAnimationsModule],
      providers: [
        { provide: TranslateService, useValue: mockTranslate },
        { provide: DropdownService, useValue: mockDropdownService },
        { provide: AssistantsService, useValue: mockAssistantsService },
        { provide: PromptTemplatesService, useValue: mockPromptTemplatesService },
      ],
    })
      .overrideComponent(ChatInputComponent, {
        set: {
          imports: [
            CommonModule,
            FormsModule,
            FakeTranslatePipe,
            MatIconModule,
            MatIconStub,
            SvgIconStub,
            TemplateSelectorStub,
            ActiveFeaturesWidgetStub,
            FileChipStub,
            FileImageChipStub,
            ChatAssistantSelectorStub,
            ChatAssistantMentionPanelStub,
            ChatClaudeStub,
            ChatAlertStub,
            ChatErrorStub,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ChatInputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('初期状態でmessageContentが空文字であること', () => {
      expect(component.messageContent()).toBe('');
    });

    test('初期状態でattachedFilesが空であること', () => {
      expect(component.attachedFiles()).toEqual([]);
    });

    test('初期状態でisSendingがfalseであること', () => {
      expect(component.isSending()).toBe(false);
    });

    test('初期状態でisAddMenuOpenがfalseであること', () => {
      expect(component.isAddMenuOpen()).toBe(false);
    });

    test('初期状態でwebSearchActiveがfalseであること', () => {
      expect(component.webSearchActive()).toBe(false);
    });

    test('初期状態でtemplateActiveがnullであること', () => {
      expect(component.templateActive()).toBeNull();
    });

    test('メッセージが空の場合、canSendがfalseであること', () => {
      expect(component.canSend()).toBe(false);
    });

    test('メッセージがある場合、canSendがtrueであること', () => {
      component.messageContent.set('テストメッセージ');
      expect(component.canSend()).toBe(true);
    });

    test('ファイルが添付されている場合、canSendがtrueであること', () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      component.attachedFiles.set([file]);
      expect(component.canSend()).toBe(true);
    });

    test('isSending=trueの場合、canSendがfalseであること', () => {
      component.messageContent.set('テストメッセージ');
      component.isSending.set(true);
      expect(component.canSend()).toBe(false);
    });

    test('webSearchActiveのみの場合、activeCountが1であること', () => {
      component.webSearchActive.set(true);
      expect(component.activeCount()).toBe(1);
    });

    test('webSearchActiveとtemplateActive両方の場合、activeCountが2であること', () => {
      component.webSearchActive.set(true);
      component.templateActive.set({ value: 'tpl-1', label: 'テンプレート', desc: '説明' });
      expect(component.activeCount()).toBe(2);
    });

    test('初期状態でcreateLibraryActiveがfalseであること', () => {
      expect(component.createLibraryActive()).toBe(false);
    });

    test('3機能すべて有効の場合、activeCountが3であること', () => {
      component.webSearchActive.set(true);
      component.templateActive.set({ value: 'tpl-1', label: 'テンプレート', desc: '説明' });
      component.createLibraryActive.set(true);
      expect(component.activeCount()).toBe(3);
    });

    test('totalFileSizeが添付ファイルの合計サイズを返すこと', () => {
      const file1 = new File(['content'], 'test1.txt', { type: 'text/plain' });
      Object.defineProperty(file1, 'size', { value: 100 });
      const file2 = new File(['content'], 'test2.txt', { type: 'text/plain' });
      Object.defineProperty(file2, 'size', { value: 200 });
      component.attachedFiles.set([file1, file2]);
      expect(component.totalFileSize()).toBe(300);
    });
  });

  describe('DOM要素表示', () => {
    test('textareaが表示されること', () => {
      const textarea = fixture.debugElement.query(By.css('textarea'));
      expect(textarea).toBeTruthy();
    });

    test('送信ボタンが表示されること', () => {
      const sendBtn = fixture.debugElement.query(By.css('button.chat-input-send'));
      expect(sendBtn).toBeTruthy();
    });

    test('メッセージが空の場合、送信ボタンが無効であること', () => {
      const sendBtn = fixture.debugElement.query(By.css('button.chat-input-send'));
      expect(sendBtn.nativeElement.disabled).toBe(true);
    });

    test('メッセージがある場合、送信ボタンが有効であること', () => {
      component.messageContent.set('テスト');
      fixture.detectChanges();

      const sendBtn = fixture.debugElement.query(By.css('button.chat-input-send'));
      expect(sendBtn.nativeElement.disabled).toBe(false);
    });

    test('ファイルが添付されている場合、ファイルチップが表示されること', () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      component.attachedFiles.set([file]);
      fixture.detectChanges();

      const chips = fixture.debugElement.queryAll(By.css('app-file-chip, app-file-image-chip'));
      expect(chips.length).toBeGreaterThan(0);
    });
  });

  describe('DOM要素イベント', () => {
    test('handleSend()でsendイベントが発火すること', () => {
      const emitted: {
        content: string;
        files: File[];
        assistantId: string | null;
        useWebSearch: boolean;
        additionalPrompt?: string;
      }[] = [];
      component.send.subscribe((v) => emitted.push(v));

      component.messageContent.set('送信テスト');
      component.handleSend();

      expect(emitted.length).toBe(1);
      expect(emitted[0].content).toBe('送信テスト');
      expect(emitted[0].useWebSearch).toBe(false);
    });

    test('テンプレート選択時は additionalPrompt に systemPrompt が含まれること', () => {
      const emitted: { additionalPrompt?: string }[] = [];
      component.send.subscribe((v) => emitted.push(v));

      component.templateActive.set({
        value: '1',
        label: '日英レスポンス',
        desc: '説明',
        systemPrompt: '返答は日本語と英語両方を返してください',
      });
      component.messageContent.set('送信テスト');
      component.handleSend();

      expect(emitted[0].additionalPrompt).toBe('返答は日本語と英語両方を返してください');
    });

    test('Web検索有効時は useWebSearch=true で送信すること', () => {
      const emitted: { useWebSearch: boolean }[] = [];
      component.send.subscribe((v) => emitted.push(v));

      component.webSearchActive.set(true);
      component.messageContent.set('検索して');
      component.handleSend();

      expect(emitted[0].useWebSearch).toBe(true);
    });

    test('ライブラリ作成有効時は createLibrary=true で送信し、送信後に自動OFFになること', () => {
      const emitted: { createLibrary: boolean; useWebSearch: boolean }[] = [];
      component.send.subscribe((v) => emitted.push(v));

      component.createLibraryActive.set(true);
      component.webSearchActive.set(true);
      component.messageContent.set('まとめて');
      component.handleSend();

      expect(emitted[0].createLibrary).toBe(true);
      // ライブラリ作成は1回ごとに解除、Web検索は維持される
      expect(component.createLibraryActive()).toBe(false);
      expect(component.webSearchActive()).toBe(true);
    });

    test('ライブラリ作成無効時は createLibrary=false で送信すること', () => {
      const emitted: { createLibrary: boolean }[] = [];
      component.send.subscribe((v) => emitted.push(v));

      component.messageContent.set('送信テスト');
      component.handleSend();

      expect(emitted[0].createLibrary).toBe(false);
    });

    test('handleSend()でmessageContentがリセットされること', () => {
      component.messageContent.set('送信テスト');
      component.handleSend();

      expect(component.messageContent()).toBe('');
    });

    test('handleSend()でattachedFilesがリセットされること', () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      component.attachedFiles.set([file]);
      component.messageContent.set('テスト');
      component.handleSend();

      expect(component.attachedFiles()).toEqual([]);
    });

    test('canSend=falseの場合、handleSend()でsendイベントが発火しないこと', () => {
      const emitted: unknown[] = [];
      component.send.subscribe((v) => emitted.push(v));

      component.messageContent.set('');
      component.handleSend();

      expect(emitted.length).toBe(0);
    });

    test('EnterキーでhandlSendが呼ばれること', () => {
      const emitted: unknown[] = [];
      component.send.subscribe((v) => emitted.push(v));

      component.messageContent.set('テストメッセージ');
      const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      component.handleKeyDown(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(emitted.length).toBe(1);
    });

    test('Shift+Enterでは送信されないこと', () => {
      const emitted: unknown[] = [];
      component.send.subscribe((v) => emitted.push(v));

      component.messageContent.set('テストメッセージ');
      const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true });
      component.handleKeyDown(event);

      expect(emitted.length).toBe(0);
    });

    test('toggleWebSearch()でwebSearchActiveがtrueになること', () => {
      component.toggleWebSearch();
      expect(component.webSearchActive()).toBe(true);
    });

    test('clearWebSearch()でwebSearchActiveがfalseになること', () => {
      component.webSearchActive.set(true);
      component.clearWebSearch();
      expect(component.webSearchActive()).toBe(false);
    });

    test('selectTemplate()でtemplateActiveが設定されること', () => {
      const tpl: Template = { value: 'tpl-1', label: 'テンプレート', desc: '説明' };
      component.selectTemplate(tpl);
      expect(component.templateActive()).toEqual(tpl);
    });

    test('clearTemplate()でtemplateActiveがnullになること', () => {
      component.templateActive.set({ value: 'tpl-1', label: 'テンプレート', desc: '説明' });
      component.clearTemplate();
      expect(component.templateActive()).toBeNull();
    });

    test('clearActiveFeature("web")でwebSearchActiveがfalseになること', () => {
      component.webSearchActive.set(true);
      component.clearActiveFeature('web');
      expect(component.webSearchActive()).toBe(false);
    });

    test('clearActiveFeature("template")でtemplateActiveがnullになること', () => {
      component.templateActive.set({ value: 'tpl-1', label: 'テンプレート', desc: '説明' });
      component.clearActiveFeature('template');
      expect(component.templateActive()).toBeNull();
    });

    test('removeFile()でインデックスのファイルが削除されること', () => {
      const file1 = new File(['a'], 'file1.txt', { type: 'text/plain' });
      const file2 = new File(['b'], 'file2.txt', { type: 'text/plain' });
      component.attachedFiles.set([file1, file2]);

      component.removeFile(0);

      expect(component.attachedFiles()).toEqual([file2]);
    });

    test('onAssistantSelect()でselectedAssistantが変更されること', () => {
      const other: Assistant = {
        id: 'asst-002',
        name: 'データ分析アシスタント',
        description: 'テスト',
        category: 'データ分析',
        model: 'gpt-4o',
      };
      component.onAssistantSelect(other);
      expect(component.selectedAssistant()?.id).toBe('asst-002');
    });

    test('formatFileSize(0)が"0 Bytes"を返すこと', () => {
      expect(component.formatFileSize(0)).toBe('0 Bytes');
    });

    test('getFileIcon()が画像ファイルで"image"を返すこと', () => {
      const file = new File([''], 'img.png', { type: 'image/png' });
      expect(component.getFileIcon(file)).toBe('image');
    });

    test('getFileIcon()がPDFファイルで"picture_as_pdf"を返すこと', () => {
      const file = new File([''], 'doc.pdf', { type: 'application/pdf' });
      expect(component.getFileIcon(file)).toBe('picture_as_pdf');
    });

    test('closeAddMenu()でisAddMenuOpenがfalseになること', () => {
      component.isAddMenuOpen.set(true);
      component.closeAddMenu();
      expect(component.isAddMenuOpen()).toBe(false);
    });

    test('closeAddMenu()でisTemplateMenuOpenがfalseになること', () => {
      component.isTemplateMenuOpen.set(true);
      component.closeAddMenu();
      expect(component.isTemplateMenuOpen()).toBe(false);
    });

    test('backToMain()でmenuSectionが"main"に戻ること', () => {
      component.menuSection.set('templates');
      component.backToMain();
      expect(component.menuSection()).toBe('main');
    });
  });

  describe('ファイル添付', () => {
    test('file input の accept に許可形式が設定されていること', () => {
      const fileInput = fixture.debugElement.query(By.css('#chat-file-upload'));
      expect(fileInput.nativeElement.accept).toBe(CHAT_ATTACHMENT_ACCEPT);
    });

    test('handleFileSelect()で許可されたファイルが添付されること', () => {
      const file = new File(['content'], 'report.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [file] });

      component.handleFileSelect({ target: input } as unknown as Event);

      expect(component.attachedFiles()).toEqual([file]);
    });

    test('handleFileSelect()で許可されていないファイルは添付されないこと', () => {
      const file = new File(['content'], 'archive.zip', { type: 'application/zip' });
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [file] });

      component.handleFileSelect({ target: input } as unknown as Event);

      expect(component.attachedFiles()).toEqual([]);
    });

    test('handleFileSelect()で許可ファイルと非許可ファイルが混在する場合、許可ファイルのみ添付されること', () => {
      const allowed = new File(['content'], 'notes.txt', { type: 'text/plain' });
      const disallowed = new File(['content'], 'archive.zip', { type: 'application/zip' });
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [allowed, disallowed] });

      component.handleFileSelect({ target: input } as unknown as Event);

      expect(component.attachedFiles()).toEqual([allowed]);
    });

    test('onDrop()で許可されたファイルが添付されること', () => {
      const file = new File(['content'], 'data.csv', { type: 'text/csv' });
      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: { files: [file] },
      } as unknown as DragEvent;

      component.onDrop(event);

      expect(component.attachedFiles()).toEqual([file]);
    });

    test('onDrop()で許可されていないファイルは添付されないこと', () => {
      const file = new File(['content'], 'archive.zip', { type: 'application/zip' });
      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: { files: [file] },
      } as unknown as DragEvent;

      component.onDrop(event);

      expect(component.attachedFiles()).toEqual([]);
    });

    test('onDragOver()でisDraggingがtrueになること', () => {
      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as DragEvent;

      component.onDragOver(event);

      expect(component.isDragging()).toBe(true);
    });

    test('onDragLeave()でisDraggingがfalseになること', () => {
      component.isDragging.set(true);
      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as DragEvent;

      component.onDragLeave(event);

      expect(component.isDragging()).toBe(false);
    });
  });

  describe('@ mention', () => {
    test('先頭が@の場合、canSendがfalseであること', () => {
      component.messageContent.set('@');
      expect(component.canSend()).toBe(false);
    });

    test('先頭が@の場合、isMentionOpenがtrueであること', () => {
      component.messageContent.set('@');
      fixture.detectChanges();
      expect(component.isMentionOpen()).toBe(true);
    });

    test('@mention確定でselectedAssistantが更新され、@部分が削除されること', () => {
      component.messageContent.set('@データ');
      component.confirmMentionSelection(mockAssistant2);

      expect(component.selectedAssistant()?.id).toBe('asst-002');
      expect(component.messageContent()).toBe('');
      expect(component.isMentionOpen()).toBe(false);
    });

    test('@mention確定後に本文が残ること', () => {
      component.messageContent.set('@データ こんにちは');
      component.confirmMentionSelection(mockAssistant2);

      expect(component.messageContent()).toBe('こんにちは');
      expect(component.canSend()).toBe(true);
    });

    test('Escでmentionパネルが閉じ、@は残ること', () => {
      component.messageContent.set('@データ');
      component.dismissMention();

      expect(component.isMentionOpen()).toBe(false);
      expect(component.messageContent()).toBe('@データ');
      expect(component.canSend()).toBe(false);
    });

    test('mention表示中のEnterでアシスタントが確定されること', () => {
      component.messageContent.set('@データ');
      fixture.detectChanges();

      const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      component.handleKeyDown(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(component.selectedAssistant()?.id).toBe('asst-002');
      expect(component.messageContent()).toBe('');
    });

    test('mention未確定のままEnterでは送信されないこと', () => {
      const emitted: unknown[] = [];
      component.send.subscribe((v) => emitted.push(v));

      component.messageContent.set('@');
      component.dismissMention();
      const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false });
      component.handleKeyDown(event);

      expect(emitted.length).toBe(0);
    });
  });

  describe('ルーム default アシスタント', () => {
    test('defaultAssistantId が指定されている場合、そのアシスタントが選択されること', () => {
      fixture.componentRef.setInput('roomId', 'room-1');
      fixture.componentRef.setInput('defaultAssistantId', 'asst-002');
      fixture.detectChanges();

      expect(component.selectedAssistant()?.id).toBe('asst-002');
    });

    test('ルーム切替時に defaultAssistantId が更新されること', () => {
      fixture.componentRef.setInput('roomId', 'room-1');
      fixture.componentRef.setInput('defaultAssistantId', 'asst-002');
      fixture.detectChanges();

      fixture.componentRef.setInput('roomId', 'room-2');
      fixture.componentRef.setInput('defaultAssistantId', 'asst-001');
      fixture.detectChanges();

      expect(component.selectedAssistant()?.id).toBe('asst-001');
    });

    test('roomId が null の場合、isDefault アシスタントが選択されること', () => {
      fixture.componentRef.setInput('roomId', 'room-1');
      fixture.componentRef.setInput('defaultAssistantId', 'asst-002');
      fixture.detectChanges();

      fixture.componentRef.setInput('roomId', null);
      fixture.componentRef.setInput('defaultAssistantId', null);
      fixture.detectChanges();

      expect(component.selectedAssistant()?.id).toBe('asst-001');
    });

    test('ルーム内でユーザーが変更したアシスタントは維持されること', () => {
      fixture.componentRef.setInput('roomId', 'room-1');
      fixture.componentRef.setInput('defaultAssistantId', 'asst-002');
      fixture.detectChanges();

      component.onAssistantSelect(mockAssistant);
      fixture.detectChanges();

      expect(component.selectedAssistant()?.id).toBe('asst-001');
    });

    test('存在しない defaultAssistantId の場合、isDefault にフォールバックすること', () => {
      fixture.componentRef.setInput('roomId', 'room-1');
      fixture.componentRef.setInput('defaultAssistantId', 'missing-id');
      fixture.detectChanges();

      expect(component.selectedAssistant()?.id).toBe('asst-001');
    });
  });
});
