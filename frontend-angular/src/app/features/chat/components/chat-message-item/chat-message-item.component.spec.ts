/* eslint-disable @angular-eslint/no-output-native */
import { Component, input, output, Pipe, PipeTransform, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { DropdownService } from '@core/services/dropdown.service';
import { AssistantsService } from '../../services/assistants.service';
import { of } from 'rxjs';
import { ChatMessageItemComponent } from './chat-message-item.component';
import { Message } from '../../../../../types/chat/message.type';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

@Component({ selector: 'markdown', standalone: true, template: '<ng-content />' })
class MarkdownStub {
  readonly data = input<string | undefined>(undefined);
  readonly disableSanitizer = input<boolean>(false);
}

@Component({ selector: 'app-file-chip-document', standalone: true, template: '' })
class FileChipDocumentStub {
  readonly name = input.required<string>();
}

@Component({ selector: 'app-file-chip', standalone: true, template: '' })
class FileChipStub {
  readonly file = input.required<File>();
}

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {
  readonly name = input.required<string>();
}

@Component({ selector: 'app-circular-loading', standalone: true, template: '' })
class CircularLoadingStub {}

@Component({ selector: 'app-skeleton', standalone: true, template: '' })
class SkeletonStub {
  readonly variant = input<string>('rect');
  readonly width = input<string>('100%');
  readonly height = input<string>('1rem');
}

@Component({ selector: 'app-button', standalone: true, template: '<ng-content />' })
class ButtonStub {
  readonly variant = input<string>('solid');
  readonly size = input<string>('md');
  readonly disabled = input<boolean>(false);
  readonly loading = input<boolean>(false);
  readonly heightPx = input<number | undefined>(undefined);
  readonly classProps = input<string | undefined>('');
  readonly buttonClick = output<MouseEvent>();
}

@Component({ selector: 'app-chat-message-footer', standalone: true, template: '' })
class ChatMessageFooterStub {
  readonly showPagination = input<boolean>(false);
  readonly versionCurrent = input<number>(1);
  readonly versionTotal = input<number>(1);
  readonly canPrevVersion = input<boolean>(false);
  readonly canNextVersion = input<boolean>(false);
  readonly isUser = input<boolean>(false);
  readonly isReadOnly = input<boolean>(false);
  readonly assistantName = input<string | null>(null);
  readonly assistantUnresolved = input<boolean>(false);
  readonly thumbsUpActive = input<boolean>(false);
  readonly thumbsDownActive = input<boolean>(false);
  readonly copy = output<void>();
  readonly thumbsUp = output<void>();
  readonly thumbsDown = output<void>();
  readonly regenerate = output<void>();
  readonly delete = output<void>();
  readonly openEdit = output<void>();
  readonly prevVersion = output<void>();
  readonly nextVersion = output<void>();
}

@Component({ selector: 'app-reference', standalone: true, template: '' })
class ReferenceStub {
  readonly referenceFilePaths = input.required<unknown[]>();
}

@Component({ selector: 'app-message-error-section', standalone: true, template: '' })
class MessageErrorSectionStub {
  readonly errorMessage = input.required<string | undefined>();
}

@Component({ selector: 'app-chat-reasoning-display', standalone: true, template: '' })
class ChatReasoningDisplayStub {
  readonly reasoning = input.required<NonNullable<Message['reasoning']>>();
}

const userMessage: Message = {
  id: 'msg-1',
  messageId: 'msg-1',
  role: 'user',
  status: 'OK',
  question: 'Test question',
  answer: '',
  context: '',
  isRated: false,
  assistantId: 'asst-1',
};

const assistantMessage: Message = {
  id: 'content-msg-2',
  messageId: 'msg-2',
  role: 'assistant',
  status: 'OK',
  question: '',
  answer: '<p>Test answer</p>',
  context: '',
  isRated: false,
  assistantId: 'asst-1',
};

const pendingAssistantMessage: Message = {
  ...assistantMessage,
  status: 'PENDING',
  answer: '',
};

const mockDialogRef = {
  afterClosed: vi.fn().mockReturnValue(of(true)),
};
const mockDialog = {
  open: vi.fn().mockReturnValue(mockDialogRef),
};

const mockTranslate = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  onLangChange: { subscribe: vi.fn() },
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

const mockDropdownService = {
  open: vi.fn(),
  notifyClosed: vi.fn(),
  closeAll: vi.fn(),
};

const mockAssistantsService = {
  assistantsQuery: {
    data: signal([{ id: 'asst-1', name: 'Test Assistant' }]),
    isPending: signal(false),
  },
};

const configureTestingModule = async () => {
  return await TestBed.configureTestingModule({
    imports: [ChatMessageItemComponent, NoopAnimationsModule],
    providers: [
      { provide: MatDialog, useValue: mockDialog },
      { provide: TranslateService, useValue: mockTranslate },
      { provide: DropdownService, useValue: mockDropdownService },
      { provide: AssistantsService, useValue: mockAssistantsService },
    ],
  })
    .overrideComponent(ChatMessageItemComponent, {
      set: {
        imports: [
          CommonModule,
          FormsModule,
          FakeTranslatePipe,
          FileChipDocumentStub,
          FileChipStub,
          ButtonStub,
          SvgIconStub,
          CircularLoadingStub,
          SkeletonStub,
          ChatMessageFooterStub,
          ReferenceStub,
          MessageErrorSectionStub,
          MarkdownStub,
          ChatReasoningDisplayStub,
        ],
      },
    })
    .compileComponents();
};

describe('ChatMessageItemComponent', () => {
  let component: ChatMessageItemComponent;
  let fixture: ComponentFixture<ChatMessageItemComponent>;

  beforeEach(async () => {
    mockAssistantsService.assistantsQuery.isPending.set(false);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
    await configureTestingModule();
    fixture = TestBed.createComponent(ChatMessageItemComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('message', userMessage);
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('初期状態: isEditing がfalseであること', () => {
      expect(component.isEditing()).toBe(false);
    });

    test('初期状態: isCopied がfalseであること', () => {
      expect(component.isCopied()).toBe(false);
    });

    test('rating 未設定時 thumbsUpActive / thumbsDownActive がfalseであること', () => {
      expect(component.thumbsUpActive()).toBe(false);
      expect(component.thumbsDownActive()).toBe(false);
    });

    test('isRated のみ true で rating 未設定の場合: どちらも active にならないこと', () => {
      fixture.componentRef.setInput('message', { ...assistantMessage, isRated: true });
      fixture.detectChanges();
      expect(component.thumbsUpActive()).toBe(false);
      expect(component.thumbsDownActive()).toBe(false);
    });

    test('rating が GOOD の場合: thumbsUpActive がtrueであること', () => {
      fixture.componentRef.setInput('message', {
        ...assistantMessage,
        isRated: true,
        rating: 'GOOD',
      });
      fixture.detectChanges();
      expect(component.thumbsUpActive()).toBe(true);
      expect(component.thumbsDownActive()).toBe(false);
    });

    test('rating が BAD の場合: thumbsDownActive がtrueであること', () => {
      fixture.componentRef.setInput('message', {
        ...assistantMessage,
        isRated: true,
        rating: 'BAD',
      });
      fixture.detectChanges();
      expect(component.thumbsUpActive()).toBe(false);
      expect(component.thumbsDownActive()).toBe(true);
    });

    test('初期状態: isMoreMenuOpen がfalseであること', () => {
      expect(component.isMoreMenuOpen()).toBe(false);
    });

    test('ユーザーメッセージ: isUser がtrueでisAssistant がfalseであること', () => {
      expect(component.isUser()).toBe(true);
      expect(component.isAssistant()).toBe(false);
    });

    test('アシスタントメッセージ: isAssistant がtrueでisUser がfalseであること', () => {
      fixture.componentRef.setInput('message', assistantMessage);
      fixture.detectChanges();
      expect(component.isAssistant()).toBe(true);
      expect(component.isUser()).toBe(false);
    });

    test('ペンディングアシスタント: isPendingAssistant がtrueであること', () => {
      fixture.componentRef.setInput('message', pendingAssistantMessage);
      fixture.detectChanges();
      expect(component.isPendingAssistant()).toBe(true);
    });

    test('通常アシスタント: isPendingAssistant がfalseであること', () => {
      fixture.componentRef.setInput('message', assistantMessage);
      fixture.detectChanges();
      expect(component.isPendingAssistant()).toBe(false);
    });

    test('添付ファイルなし: hasAttachments がfalseであること', () => {
      expect(component.hasAttachments()).toBe(false);
    });

    test('attachmentFilesあり: hasAttachments がtrueであること', () => {
      const msgWithAttachment: Message = {
        ...userMessage,
        attachmentFiles: [{ id: 'file-1', name: 'test.png', type: 'image/png', size: 1000 }],
      };
      fixture.componentRef.setInput('message', msgWithAttachment);
      fixture.detectChanges();
      expect(component.hasAttachments()).toBe(true);
    });

    test('versionInfo 未設定時は pagination を表示しないこと', () => {
      expect(component.showPagination()).toBe(false);
    });

    test('versionInfo がある場合は pagination を表示すること', () => {
      fixture.componentRef.setInput('versionInfo', {
        groupKey: '__root__',
        current: 2,
        total: 2,
        canPrev: true,
        canNext: false,
      });
      fixture.detectChanges();
      expect(component.showPagination()).toBe(true);
      expect(component.versionCurrent()).toBe(2);
      expect(component.versionTotal()).toBe(2);
    });

    test('assistantId あり: assistantName が取得されること', () => {
      const msgWithAssistant: Message = { ...assistantMessage, assistantId: 'asst-1' };
      fixture.componentRef.setInput('message', msgWithAssistant);
      fixture.detectChanges();
      expect(component.assistantName()).toBe('Test Assistant');
    });

    test('assistantId なし: assistantName が空文字であること', () => {
      fixture.componentRef.setInput('message', { ...assistantMessage, assistantId: undefined });
      fixture.detectChanges();
      expect(component.assistantName()).toBe('');
    });

    test('assistantId が存在しないIDの場合: assistantName が空文字であること', () => {
      const msgWithUnknownAssistant: Message = { ...assistantMessage, assistantId: 'unknown' };
      fixture.componentRef.setInput('message', msgWithUnknownAssistant);
      fixture.detectChanges();
      expect(component.assistantName()).toBe('');
    });

    test('一覧読込中かつ名前未解決: assistantNamePending が true であること', () => {
      mockAssistantsService.assistantsQuery.isPending.set(true);
      const msgWithUnknownAssistant: Message = { ...assistantMessage, assistantId: 'loading-id' };
      fixture.componentRef.setInput('message', msgWithUnknownAssistant);
      fixture.detectChanges();
      expect(component.assistantNamePending()).toBe(true);
      mockAssistantsService.assistantsQuery.isPending.set(false);
    });

    test('一覧読込中でも名前が解決済みなら assistantNamePending が false であること', () => {
      mockAssistantsService.assistantsQuery.isPending.set(true);
      const msgWithAssistant: Message = { ...assistantMessage, assistantId: 'asst-1' };
      fixture.componentRef.setInput('message', msgWithAssistant);
      fixture.detectChanges();
      expect(component.assistantNamePending()).toBe(false);
      mockAssistantsService.assistantsQuery.isPending.set(false);
    });

    test('assistantId が null（アシスタント削除済み）: isAssistantUnresolved が true であること', () => {
      const msgWithDeletedAssistant: Message = { ...assistantMessage, assistantId: undefined };
      fixture.componentRef.setInput('message', msgWithDeletedAssistant);
      fixture.detectChanges();
      expect(component.isAssistantUnresolved()).toBe(true);
    });

    test('assistantId が一覧に存在しない場合: isAssistantUnresolved が true であること', () => {
      const msgWithUnknownAssistant: Message = { ...assistantMessage, assistantId: 'unknown' };
      fixture.componentRef.setInput('message', msgWithUnknownAssistant);
      fixture.detectChanges();
      expect(component.isAssistantUnresolved()).toBe(true);
    });

    test('assistantId が解決できる場合: isAssistantUnresolved が false であること', () => {
      const msgWithAssistant: Message = { ...assistantMessage, assistantId: 'asst-1' };
      fixture.componentRef.setInput('message', msgWithAssistant);
      fixture.detectChanges();
      expect(component.isAssistantUnresolved()).toBe(false);
    });

    test('一覧読込中で未解決の場合: isAssistantUnresolved が false であること（誤って無効化しない）', () => {
      mockAssistantsService.assistantsQuery.isPending.set(true);
      const msgWithUnknownAssistant: Message = { ...assistantMessage, assistantId: 'loading-id' };
      fixture.componentRef.setInput('message', msgWithUnknownAssistant);
      fixture.detectChanges();
      expect(component.isAssistantUnresolved()).toBe(false);
      mockAssistantsService.assistantsQuery.isPending.set(false);
    });
  });

  describe('DOM要素表示', () => {
    test('ユーザーメッセージ: user articleが表示されること', () => {
      const article = fixture.debugElement.query(By.css('.chat-message--user'));
      expect(article).toBeTruthy();
    });

    test('ユーザーメッセージ: assistant articleは表示されないこと', () => {
      const article = fixture.debugElement.query(By.css('.chat-message--assistant'));
      expect(article).toBeFalsy();
    });

    test('アシスタントメッセージ: assistant articleが表示されること', () => {
      fixture.componentRef.setInput('message', assistantMessage);
      fixture.detectChanges();
      const article = fixture.debugElement.query(By.css('.chat-message--assistant'));
      expect(article).toBeTruthy();
    });

    test('推論テキストあり: chat-reasoning-display が表示されること', () => {
      fixture.componentRef.setInput('message', {
        ...assistantMessage,
        reasoning: {
          sections: [{ summary: 'Checking weather', detail: 'The user is asking' }],
        },
      });
      fixture.detectChanges();
      const reasoning = fixture.debugElement.query(By.directive(ChatReasoningDisplayStub));
      expect(reasoning).toBeTruthy();
    });

    test('ペンディングアシスタント: app-circular-loadingが表示されること', () => {
      fixture.componentRef.setInput('message', pendingAssistantMessage);
      fixture.detectChanges();
      const loading = fixture.debugElement.query(By.css('app-circular-loading'));
      expect(loading).toBeTruthy();
    });

    test('通常アシスタント: app-circular-loadingが表示されないこと', () => {
      fixture.componentRef.setInput('message', assistantMessage);
      fixture.detectChanges();
      const loading = fixture.debugElement.query(By.css('app-circular-loading'));
      expect(loading).toBeFalsy();
    });

    test('編集モードでない場合: ユーザーバブルが表示されること', () => {
      const bubble = fixture.debugElement.query(By.css('.chat-user-bubble'));
      expect(bubble).toBeTruthy();
      expect(bubble.nativeElement.hidden).toBe(false);
    });

    test('編集モードの場合: 編集エリアが表示されること', () => {
      component.openEdit();
      fixture.detectChanges();
      const editArea = fixture.debugElement.query(By.css('.chat-user-edit'));
      expect(editArea.nativeElement.hidden).toBe(false);
    });

    test('編集モードの場合: ユーザーバブルが非表示になること', () => {
      component.openEdit();
      fixture.detectChanges();
      const bubble = fixture.debugElement.query(By.css('.chat-user-bubble'));
      expect(bubble.nativeElement.hidden).toBe(true);
    });

    test('ペンディングでないアシスタント: app-chat-message-footerが表示されること', () => {
      fixture.componentRef.setInput('message', assistantMessage);
      fixture.detectChanges();
      const footer = fixture.debugElement.query(By.css('app-chat-message-footer'));
      expect(footer).toBeTruthy();
    });

    test('ペンディングアシスタント: app-chat-message-footerが表示されないこと', () => {
      fixture.componentRef.setInput('message', pendingAssistantMessage);
      fixture.detectChanges();
      // user section always has footer; assistant section hides footer when pending
      const assistantArticle = fixture.debugElement.query(By.css('.chat-message--assistant'));
      expect(assistantArticle.query(By.css('app-chat-message-footer'))).toBeFalsy();
    });
  });

  describe('DOM要素イベント', () => {
    test('footerのcopyイベント: copyMessage が発火すること', () => {
      const spy = vi.spyOn(component.copyMessage, 'emit');
      const footer = fixture.debugElement.query(By.directive(ChatMessageFooterStub));
      footer.triggerEventHandler('copy', null);
      expect(spy).toHaveBeenCalledWith('msg-1');
    });

    test('footerのcopyイベント: navigator.clipboard.writeText が呼ばれること', () => {
      const footer = fixture.debugElement.query(By.directive(ChatMessageFooterStub));
      footer.triggerEventHandler('copy', null);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(userMessage.question);
    });

    test('openEdit: isEditing がtrueになりeditText がセットされること', () => {
      component.openEdit();
      expect(component.isEditing()).toBe(true);
      expect(component.editText()).toBe(userMessage.question);
    });

    test('openEdit: アシスタントが未解決の場合は isEditing が変化しないこと', () => {
      fixture.componentRef.setInput('message', { ...userMessage, assistantId: 'unknown' });
      fixture.detectChanges();
      component.openEdit();
      expect(component.isEditing()).toBe(false);
    });

    test('cancelEdit: isEditing がfalseになりeditText がリセットされること', () => {
      component.openEdit();
      component.cancelEdit();
      expect(component.isEditing()).toBe(false);
      expect(component.editText()).toBe('');
    });

    test('cancelEditボタンクリック: isEditing がfalseになること', () => {
      component.openEdit();
      fixture.detectChanges();
      const cancelBtn = fixture.debugElement.queryAll(By.directive(ButtonStub))[0];
      cancelBtn.triggerEventHandler('buttonClick', new MouseEvent('click'));
      expect(component.isEditing()).toBe(false);
    });

    test('submitEdit: handleSend が発火すること', () => {
      const spy = vi.spyOn(component.handleSend, 'emit');
      component.editText.set('New text');
      component.submitEdit();
      expect(spy).toHaveBeenCalledWith('New text');
    });

    test('submitEdit: テキストが空の場合は発火しないこと', () => {
      const spy = vi.spyOn(component.handleSend, 'emit');
      component.editText.set('   ');
      component.submitEdit();
      expect(spy).not.toHaveBeenCalled();
    });

    test('submitEdit: アシスタントが未解決の場合は発火しないこと', () => {
      fixture.componentRef.setInput('message', { ...userMessage, assistantId: 'unknown' });
      fixture.detectChanges();
      const spy = vi.spyOn(component.handleSend, 'emit');
      component.editText.set('New text');
      component.submitEdit();
      expect(spy).not.toHaveBeenCalled();
    });

    test('submitEdit 後: isEditing がfalseになること', () => {
      component.editText.set('Some text');
      component.submitEdit();
      expect(component.isEditing()).toBe(false);
    });

    test('handleEditKeyDown: Enter キーで submitEdit が呼ばれること', () => {
      const spy = vi.spyOn(component, 'submitEdit');
      component.editText.set('Some text');
      const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false });
      component.handleEditKeyDown(event);
      expect(spy).toHaveBeenCalled();
    });

    test('handleEditKeyDown: Shift+Enter では submitEdit が呼ばれないこと', () => {
      const spy = vi.spyOn(component, 'submitEdit');
      const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true });
      component.handleEditKeyDown(event);
      expect(spy).not.toHaveBeenCalled();
    });

    describe('編集時のキーボード操作（IME）', () => {
      test('日本語変換中にEnterキーを押しても送信されないこと', () => {
        const spy = vi.spyOn(component, 'submitEdit');
        component.editText.set('テキスト');
        component.onCompositionStart();
        const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false });
        component.handleEditKeyDown(event);
        expect(spy).not.toHaveBeenCalled();
      });

      test('日本語変換確定直後のEnterキーで意図しない送信が発生しないこと', () => {
        const spy = vi.spyOn(component, 'submitEdit');
        component.editText.set('テキスト');
        component.onCompositionStart();
        component.onCompositionEnd();
        const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false });
        component.handleEditKeyDown(event);
        expect(spy).not.toHaveBeenCalled();
      });

      test('日本語変換確定後にEnterキーを押すと送信されること', () => {
        const spy = vi.spyOn(component, 'submitEdit');
        component.editText.set('テキスト');
        component.onCompositionStart();
        component.onCompositionEnd();
        // compositionend直後のEnterでjustFinishedComposingを消費する
        const event1 = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false });
        component.handleEditKeyDown(event1);
        // フラグがリセットされた後のEnterで送信される
        const event2 = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false });
        component.handleEditKeyDown(event2);
        expect(spy).toHaveBeenCalled();
      });
    });

    test('削除ボタンクリック: ダイアログが開くこと', () => {
      component.handleDelete();
      expect(mockDialog.open).toHaveBeenCalled();
    });

    test('ダイアログで確認した場合: delete が発火すること', () => {
      const spy = vi.spyOn(component.delete, 'emit');
      mockDialogRef.afterClosed.mockReturnValue(of(true));
      component.handleDelete();
      expect(spy).toHaveBeenCalledWith('msg-1');
    });

    test('assistant 削除確認時: delete が messageId で発火すること', () => {
      fixture.componentRef.setInput('message', assistantMessage);
      fixture.detectChanges();
      const spy = vi.spyOn(component.delete, 'emit');
      mockDialogRef.afterClosed.mockReturnValue(of(true));
      component.handleDelete();
      expect(spy).toHaveBeenCalledWith('msg-2');
    });

    test('ダイアログでキャンセルした場合: delete が発火しないこと', () => {
      const spy = vi.spyOn(component.delete, 'emit');
      mockDialogRef.afterClosed.mockReturnValue(of(false));
      component.handleDelete();
      expect(spy).not.toHaveBeenCalled();
    });

    test('handleThumbsUp: rate がupで発火すること', () => {
      fixture.componentRef.setInput('message', assistantMessage);
      fixture.detectChanges();
      const spy = vi.spyOn(component.rate, 'emit');
      component.handleThumbsUp();
      expect(spy).toHaveBeenCalledWith({ messageId: 'msg-2', rating: 'up' });
    });

    test('handleThumbsDown: rate がdownで発火すること', () => {
      fixture.componentRef.setInput('message', assistantMessage);
      fixture.detectChanges();
      const spy = vi.spyOn(component.rate, 'emit');
      component.handleThumbsDown();
      expect(spy).toHaveBeenCalledWith({ messageId: 'msg-2', rating: 'down' });
    });

    test('GOOD評価済み: handleThumbsUp では rate が発火しないこと', () => {
      fixture.componentRef.setInput('message', {
        ...assistantMessage,
        isRated: true,
        rating: 'GOOD',
      });
      fixture.detectChanges();
      const spy = vi.spyOn(component.rate, 'emit');
      component.handleThumbsUp();
      expect(spy).not.toHaveBeenCalled();
    });

    test('GOOD評価済み: handleThumbsDown では rate が発火すること', () => {
      fixture.componentRef.setInput('message', {
        ...assistantMessage,
        isRated: true,
        rating: 'GOOD',
      });
      fixture.detectChanges();
      const spy = vi.spyOn(component.rate, 'emit');
      component.handleThumbsDown();
      expect(spy).toHaveBeenCalledWith({ messageId: 'msg-2', rating: 'down' });
    });

    test('BAD評価済み: handleThumbsDown では rate が発火しないこと', () => {
      fixture.componentRef.setInput('message', {
        ...assistantMessage,
        isRated: true,
        rating: 'BAD',
      });
      fixture.detectChanges();
      const spy = vi.spyOn(component.rate, 'emit');
      component.handleThumbsDown();
      expect(spy).not.toHaveBeenCalled();
    });

    test('BAD評価済み: handleThumbsUp では rate が発火すること', () => {
      fixture.componentRef.setInput('message', {
        ...assistantMessage,
        isRated: true,
        rating: 'BAD',
      });
      fixture.detectChanges();
      const spy = vi.spyOn(component.rate, 'emit');
      component.handleThumbsUp();
      expect(spy).toHaveBeenCalledWith({ messageId: 'msg-2', rating: 'up' });
    });

    test('handleRegenerate: regenerate が発火すること', () => {
      fixture.componentRef.setInput('message', assistantMessage);
      fixture.detectChanges();
      const spy = vi.spyOn(component.regenerate, 'emit');
      component.handleRegenerate();
      expect(spy).toHaveBeenCalledWith('content-msg-2');
    });

    test('handleRetry: retry が発火すること', () => {
      const spy = vi.spyOn(component.retry, 'emit');
      component.handleRetry();
      expect(spy).toHaveBeenCalledWith('msg-1');
    });

    test('handleRegenerate: アシスタントが未解決の場合は regenerate が発火しないこと', () => {
      fixture.componentRef.setInput('message', { ...assistantMessage, assistantId: 'unknown' });
      fixture.detectChanges();
      const spy = vi.spyOn(component.regenerate, 'emit');
      component.handleRegenerate();
      expect(spy).not.toHaveBeenCalled();
    });

    test('handleRetry: アシスタントが未解決の場合は retry が発火しないこと', () => {
      fixture.componentRef.setInput('message', { ...assistantMessage, assistantId: 'unknown' });
      fixture.detectChanges();
      const spy = vi.spyOn(component.retry, 'emit');
      component.handleRetry();
      expect(spy).not.toHaveBeenCalled();
    });

    test('toggleMoreMenu: isMoreMenuOpen がtrueになること', () => {
      component.toggleMoreMenu();
      expect(component.isMoreMenuOpen()).toBe(true);
      expect(mockDropdownService.open).toHaveBeenCalled();
    });

    test('toggleMoreMenu 2回: isMoreMenuOpen がfalseになること', () => {
      component.toggleMoreMenu();
      component.toggleMoreMenu();
      expect(component.isMoreMenuOpen()).toBe(false);
      expect(mockDropdownService.notifyClosed).toHaveBeenCalled();
    });

    test('closeMoreMenu: isMoreMenuOpen がfalseになること', () => {
      component.isMoreMenuOpen.set(true);
      component.closeMoreMenu();
      expect(component.isMoreMenuOpen()).toBe(false);
    });

    test('saveToLibrary: isMoreMenuOpen がfalseになること', () => {
      component.isMoreMenuOpen.set(true);
      component.saveToLibrary();
      expect(component.isMoreMenuOpen()).toBe(false);
      expect(mockDropdownService.notifyClosed).toHaveBeenCalled();
    });

    test('footerのopenEditイベント: openEdit が呼ばれること', () => {
      const spy = vi.spyOn(component, 'openEdit');
      const footer = fixture.debugElement.query(By.directive(ChatMessageFooterStub));
      footer.triggerEventHandler('openEdit', null);
      expect(spy).toHaveBeenCalled();
    });

    test('footerのregenerateイベント: regenerate が発火すること', () => {
      const spy = vi.spyOn(component.regenerate, 'emit');
      const footer = fixture.debugElement.query(By.directive(ChatMessageFooterStub));
      footer.triggerEventHandler('regenerate', null);
      expect(spy).toHaveBeenCalledWith('msg-1');
    });

    test('footerのdeleteイベント: ダイアログが開くこと', () => {
      const footer = fixture.debugElement.query(By.directive(ChatMessageFooterStub));
      footer.triggerEventHandler('delete', null);
      expect(mockDialog.open).toHaveBeenCalled();
    });
  });
});
