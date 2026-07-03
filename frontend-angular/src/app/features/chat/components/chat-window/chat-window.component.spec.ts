import { CommonModule } from '@angular/common';
import { Component, input, output, Pipe, PipeTransform, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { UiStore } from '@core/stores/ui.store';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { Message } from '@app-types/chat';
import { ChatWindowComponent } from './chat-window.component';
import { ChatService } from '../../services/chat.service';
import { AssistantsService } from '../../services/assistants.service';
import { SharesService } from '../../services/shares.service';
import { ViewerService } from '../../services/viewer.service';

// ─── Fake translate pipe ──────────────────────────────────────────────────────
@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

// ─── Stub components ──────────────────────────────────────────────────────────
@Component({ selector: 'app-chat-header', standalone: true, template: '' })
class ChatHeaderStub {
  title = input<string>('');
  isReadOnly = input<boolean>(false);
  isHideName = input<boolean>(false);
  renameClick = output<void>();
  newChatClick = output<void>();
  shareClick = output<void>();
  likeClick = output<void>();
  settingsClick = output<void>();
}

@Component({ selector: 'app-chat-message-list', standalone: true, template: '' })
class ChatMessageListStub {
  messages = input<Message[]>([]);
  isLoading = input<boolean>(false);
  isReadOnly = input<boolean>(false);
  isNewChat = input<boolean>(false);
  assistantDescription = input<string>('');
  copyMessage = output<string>();
  regenerate = output<string>();
  retry = output<string>();
  delete = output<string>();
  rate = output<{ messageId: string; rating: 'up' | 'down' }>();
  editSubmit = output<{ messageId: string; newText: string }>();
}

@Component({ selector: 'app-chat-input', standalone: true, template: '' })
class ChatInputStub {
  roomId = input<string | null>(null);
  defaultAssistantId = input<string | null>(null);
  isAlert = input<boolean>(true);
  isError = input<boolean>(false);
  send = output<{
    content: string;
    files: File[];
    assistantId: string | null;
    useWebSearch: boolean;
  }>();
}

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {
  name = input<string>('');
}

@Component({ selector: 'app-chat-assistant-exam', standalone: true, template: '' })
class ChatAssistantExamStub {}

@Component({ selector: 'app-chat-summary', standalone: true, template: '' })
class ChatSummaryStub {
  chatId = input<string | null>(null);
  headerOptions = input<unknown[]>([]);
  isReadOnly = input<boolean>(false);
  collapseChange = output<boolean>();
}

// ─── Mock data ────────────────────────────────────────────────────────────────
const mockActiveRoom: {
  id: string;
  name: string;
  shareId: string;
  teamIds: string[];
  rating: string;
  isPinned: boolean;
  lastMessage: string;
  lastMessageTime: Date;
  defaultAssistantId?: string;
} = {
  id: 'room-1',
  name: 'テストルーム',
  shareId: 'share-123',
  teamIds: [],
  rating: 'GOOD',
  isPinned: false,
  lastMessage: '',
  lastMessageTime: new Date(),
};

const mockMessages = [
  { id: 'msg-1', content: 'こんにちは', role: 'user', createdAt: new Date() },
  { id: 'msg-2', content: 'はい、こんにちは', role: 'assistant', createdAt: new Date() },
];

const mockActiveRoomSignal = signal<typeof mockActiveRoom | undefined>(mockActiveRoom);

// ─── Mocks ────────────────────────────────────────────────────────────────────
const mockChatService = {
  activeRoom: mockActiveRoomSignal,
  activeRoomId: signal<string | null>('room-1'),
  isRenamingRoom: signal(false),
  isSubmittingFeedback: signal(false),
  loadMessagesForRoom: vi.fn().mockResolvedValue(undefined),
  sendMessage: vi.fn().mockResolvedValue(undefined),
  regenerateMessage: vi.fn().mockResolvedValue(undefined),
  retryMessage: vi.fn().mockResolvedValue(undefined),
  webSearchRetryMessage: vi.fn().mockResolvedValue(undefined),
  editMessage: vi.fn().mockResolvedValue(undefined),
  deleteMessage: vi.fn().mockResolvedValue(undefined),
  rateMessage: vi.fn().mockResolvedValue(undefined),
  createNewRoom: vi.fn().mockResolvedValue('new-room-id'),
  setActiveRoomId: vi.fn(),
  renameRoom: vi.fn().mockResolvedValue(undefined),
  submitRoomFeedback: vi.fn().mockResolvedValue(undefined),
};

const mockAssistantsData = signal<{ id: string; description: string }[] | undefined>(undefined);

const mockAssistantsService = {
  assistantsQuery: { data: mockAssistantsData },
};

const mockSharesService = {
  shareId: signal<string | null>('share-123'),
  isSharing: signal(false),
  isUnsharing: signal(false),
  shareRoom: vi.fn().mockResolvedValue({ id: 'share-123', roomId: 'room-1', teamIds: [] }),
  unshareRoom: vi.fn().mockResolvedValue(undefined),
};

const mockDialogRef = {
  close: vi.fn(),
  afterClosed: vi.fn(() => of(null)),
};

const mockDialog = {
  open: vi.fn(() => mockDialogRef),
};

const mockTranslate = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  onLangChange: { subscribe: vi.fn() },
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

const mockUiStore = {
  isMobile: signal(false),
};

const mockRouter = {
  navigate: vi.fn().mockResolvedValue(true),
};

const mockViewerService = {
  viewers: signal([]),
  loadList: vi.fn().mockResolvedValue(undefined),
};

// ─── TestBed factory ──────────────────────────────────────────────────────────
const configureTestingModule = async () => {
  return await TestBed.configureTestingModule({
    imports: [ChatWindowComponent, NoopAnimationsModule],
    providers: [
      { provide: ChatService, useValue: mockChatService },
      { provide: AssistantsService, useValue: mockAssistantsService },
      { provide: SharesService, useValue: mockSharesService },
      { provide: MatDialog, useValue: mockDialog },
      { provide: TranslateService, useValue: mockTranslate },
      { provide: UiStore, useValue: mockUiStore },
      { provide: Router, useValue: mockRouter },
      { provide: ViewerService, useValue: mockViewerService },
    ],
  })
    .overrideComponent(ChatWindowComponent, {
      set: {
        imports: [
          CommonModule,
          MatIconModule,
          FakeTranslatePipe,
          ChatHeaderStub,
          ChatMessageListStub,
          ChatInputStub,
          ChatAssistantExamStub,
          ChatSummaryStub,
        ],
      },
    })
    .compileComponents();
};

describe('ChatWindowComponent', () => {
  let fixture: ComponentFixture<ChatWindowComponent>;
  let component: ChatWindowComponent;

  beforeEach(async () => {
    mockActiveRoomSignal.set(mockActiveRoom);
    mockAssistantsData.set(undefined);
    await configureTestingModule();
    fixture = TestBed.createComponent(ChatWindowComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('messages', mockMessages);
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  // ─── 初期値・ゲッター ──────────────────────────────────────────────────────
  describe('初期値・ゲッター', () => {
    test('showHeader のデフォルト値が true であること', () => {
      expect(component.showHeader()).toBe(true);
    });

    test('isLoading のデフォルト値が false であること', () => {
      expect(component.isLoading()).toBe(false);
    });

    test('isError の初期値が false であること', () => {
      expect(component.isError()).toBe(false);
    });

    test('isAlert の初期値が true であること', () => {
      expect(component.isAlert()).toBe(true);
    });

    test('showDataPanel の初期値が false であること', () => {
      expect(component.showDataPanel()).toBe(false);
    });

    test('activeRoom が正しく取得できること', () => {
      expect(component.activeRoom()).toEqual(mockActiveRoom);
    });

    test('messages が正しく取得できること', () => {
      expect(component.messages()).toEqual(mockMessages);
    });

    test('activeRoom に shareId があるとき shareUrl に shareId が含まれること', () => {
      fixture.detectChanges();
      expect(component.shareUrl()).toContain('/chat/share/share-123');
    });

    test('activeRoom に shareId がないとき shareUrl が空文字であること', () => {
      mockActiveRoomSignal.set({ ...mockActiveRoom, shareId: undefined as unknown as string });
      mockSharesService.shareId.set(null);
      fixture.detectChanges();
      expect(component.shareUrl()).toBe('');
    });
  });

  // ─── assistantDescription ────────────────────────────────────────────────
  describe('assistantDescription', () => {
    test('ルームの defaultAssistantId に一致するアシスタントが存在する場合、その説明文を算出すること', () => {
      mockAssistantsData.set([
        { id: 'asst-001', description: '社内情報を検索・回答するアシスタントです。' },
      ]);
      mockActiveRoomSignal.set({ ...mockActiveRoom, defaultAssistantId: 'asst-001' });
      fixture.detectChanges();
      expect(component.assistantDescription()).toBe('社内情報を検索・回答するアシスタントです。');
    });

    test('ルームに defaultAssistantId が無い場合、空文字を算出すること', () => {
      mockAssistantsData.set([
        { id: 'asst-001', description: '社内情報を検索・回答するアシスタントです。' },
      ]);
      mockActiveRoomSignal.set({ ...mockActiveRoom, defaultAssistantId: undefined });
      fixture.detectChanges();
      expect(component.assistantDescription()).toBe('');
    });

    test('defaultAssistantId に一致するアシスタントが一覧に存在しない場合、空文字を算出すること', () => {
      mockAssistantsData.set([
        { id: 'asst-001', description: '社内情報を検索・回答するアシスタントです。' },
      ]);
      mockActiveRoomSignal.set({ ...mockActiveRoom, defaultAssistantId: 'asst-999' });
      fixture.detectChanges();
      expect(component.assistantDescription()).toBe('');
    });

    test('アシスタント一覧が未取得の場合、空文字を算出すること', () => {
      mockAssistantsData.set(undefined);
      mockActiveRoomSignal.set({ ...mockActiveRoom, defaultAssistantId: 'asst-001' });
      fixture.detectChanges();
      expect(component.assistantDescription()).toBe('');
    });
  });

  // ─── DOM要素表示 ───────────────────────────────────────────────────────────
  describe('DOM要素表示', () => {
    test('app-chat-header が常に表示されること', () => {
      const header = fixture.debugElement.query(By.css('app-chat-header'));
      expect(header).toBeTruthy();
    });

    test('isChatExamList が false の場合 app-chat-message-list が表示されること', () => {
      fixture.componentRef.setInput('isChatExamList', false);
      fixture.detectChanges();
      const list = fixture.debugElement.query(By.css('app-chat-message-list'));
      expect(list).toBeTruthy();
    });

    test('isChatExamList が true の場合 app-chat-message-list は表示されないこと', () => {
      fixture.componentRef.setInput('isChatExamList', true);
      fixture.detectChanges();
      const list = fixture.debugElement.query(By.css('app-chat-message-list'));
      expect(list).toBeFalsy();
    });

    test('isChatExamList が true の場合 app-chat-assistant-exam が表示されること', () => {
      fixture.componentRef.setInput('isChatExamList', true);
      fixture.detectChanges();
      const exam = fixture.debugElement.query(By.css('app-chat-assistant-exam'));
      expect(exam).toBeTruthy();
    });

    test('isReadOnly が false のとき app-chat-input が表示されること', () => {
      fixture.componentRef.setInput('isReadOnly', false);
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('app-chat-input'))).toBeTruthy();
    });

    test('isReadOnly が true のとき app-chat-input が表示されないこと', () => {
      fixture.componentRef.setInput('isReadOnly', true);
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('app-chat-input'))).toBeFalsy();
    });

    test('showDataPanel が true の場合データパネルが表示されること', () => {
      mockUiStore.isMobile.set(true);
      component.showDataPanel.set(true);
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('[role="dialog"]'))).toBeTruthy();
    });

    test('showDataPanel が false の場合データパネルが表示されないこと', () => {
      expect(fixture.debugElement.query(By.css('[role="dialog"]'))).toBeFalsy();
    });
  });

  // ─── DOM要素イベント ───────────────────────────────────────────────────────
  describe('DOM要素イベント', () => {
    test('toggleDataPanel で showDataPanel がトグルされること', () => {
      mockUiStore.isMobile.set(true);
      expect(component.showDataPanel()).toBe(false);
      component.toggleDataPanel();
      fixture.detectChanges();
      expect(component.showDataPanel()).toBe(true);
      component.toggleDataPanel();
      fixture.detectChanges();
      expect(component.showDataPanel()).toBe(false);
    });

    test('データパネルの背景クリックで toggleDataPanel が呼ばれること', () => {
      mockUiStore.isMobile.set(true);
      component.showDataPanel.set(true);
      fixture.detectChanges();
      const spy = vi.spyOn(component, 'toggleDataPanel');
      const overlay = fixture.debugElement.query(By.css('[aria-hidden="true"]'));
      overlay?.triggerEventHandler('click', null);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    test('データパネルの閉じる操作で showDataPanel が false になること', () => {
      mockUiStore.isMobile.set(true);
      component.showDataPanel.set(true);
      fixture.detectChanges();
      const summary = fixture.debugElement.query(By.css('app-chat-summary'));
      summary.componentInstance.collapseChange.emit(true);
      expect(component.showDataPanel()).toBe(false);
    });

    test('chat-header の renameClick イベントで openRenameDialog が呼ばれること', () => {
      const spy = vi.spyOn(component, 'openRenameDialog');
      const header = fixture.debugElement.query(By.directive(ChatHeaderStub));
      (header.componentInstance as ChatHeaderStub).renameClick.emit();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    test('chat-header の newChatClick イベントで createNewChat が呼ばれること', () => {
      const spy = vi.spyOn(component, 'createNewChat');
      const header = fixture.debugElement.query(By.directive(ChatHeaderStub));
      (header.componentInstance as ChatHeaderStub).newChatClick.emit();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    test('chat-header の shareClick イベントで openShareDialog が呼ばれること', () => {
      const spy = vi.spyOn(component, 'openShareDialog');
      const header = fixture.debugElement.query(By.directive(ChatHeaderStub));
      (header.componentInstance as ChatHeaderStub).shareClick.emit();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    test('chat-header の likeClick イベントで openRatingDialog が呼ばれること', () => {
      const spy = vi.spyOn(component, 'openRatingDialog');
      const header = fixture.debugElement.query(By.directive(ChatHeaderStub));
      (header.componentInstance as ChatHeaderStub).likeClick.emit();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    test('chat-header の settingsClick イベントで toggleDataPanel が呼ばれること', () => {
      const spy = vi.spyOn(component, 'toggleDataPanel');
      const header = fixture.debugElement.query(By.directive(ChatHeaderStub));
      (header.componentInstance as ChatHeaderStub).settingsClick.emit();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    test('chat-message-list の regenerate イベントで chatService.regenerateMessage が呼ばれること', async () => {
      const list = fixture.debugElement.query(By.directive(ChatMessageListStub));
      (list.componentInstance as ChatMessageListStub).regenerate.emit('msg-1');
      await fixture.whenStable();
      expect(mockChatService.regenerateMessage).toHaveBeenCalledWith('msg-1');
    });

    test('chat-message-list の retry イベントで chatService.retryMessage が呼ばれること', async () => {
      const list = fixture.debugElement.query(By.directive(ChatMessageListStub));
      (list.componentInstance as ChatMessageListStub).retry.emit('msg-1');
      await fixture.whenStable();
      expect(mockChatService.retryMessage).toHaveBeenCalledWith('msg-1');
    });

    test('chat-message-list の delete イベントで chatService.deleteMessage が呼ばれること', async () => {
      const list = fixture.debugElement.query(By.directive(ChatMessageListStub));
      (list.componentInstance as ChatMessageListStub).delete.emit('msg-1');
      await fixture.whenStable();
      expect(mockChatService.deleteMessage).toHaveBeenCalledWith('msg-1');
    });

    test('chat-message-list の rate イベント（up）で GOOD の評価が渡されること', async () => {
      const list = fixture.debugElement.query(By.directive(ChatMessageListStub));
      (list.componentInstance as ChatMessageListStub).rate.emit({
        messageId: 'msg-1',
        rating: 'up',
      });
      await fixture.whenStable();
      expect(mockChatService.rateMessage).toHaveBeenCalledWith('msg-1', 'GOOD');
    });

    test('chat-message-list の rate イベント（down）で BAD の評価が渡されること', async () => {
      const list = fixture.debugElement.query(By.directive(ChatMessageListStub));
      (list.componentInstance as ChatMessageListStub).rate.emit({
        messageId: 'msg-1',
        rating: 'down',
      });
      await fixture.whenStable();
      expect(mockChatService.rateMessage).toHaveBeenCalledWith('msg-1', 'BAD');
    });

    test('chat-message-list の editSubmit イベントで chatService.editMessage が呼ばれること', async () => {
      const list = fixture.debugElement.query(By.directive(ChatMessageListStub));
      (list.componentInstance as ChatMessageListStub).editSubmit.emit({
        messageId: 'msg-1',
        newText: '編集後テキスト',
      });
      await fixture.whenStable();
      expect(mockChatService.editMessage).toHaveBeenCalledWith('msg-1', '編集後テキスト');
    });

    test('roomId がある場合に handleSend を呼ぶと chatService.sendMessage が呼ばれること', async () => {
      fixture.componentRef.setInput('roomId', 'room-1');
      fixture.detectChanges();
      await component.handleSend({
        content: 'テスト',
        files: [],
        assistantId: null,
        useWebSearch: false,
        createLibrary: false,
      });
      expect(mockChatService.sendMessage).toHaveBeenCalledWith('テスト', [], {
        assistantId: undefined,
        useWebSearch: false,
        additionalPrompt: undefined,
        createLibrary: false,
      });
    });

    test('roomId がない場合に handleSend を呼ぶと chatService.createNewRoom が呼ばれること', async () => {
      fixture.componentRef.setInput('roomId', null);
      fixture.detectChanges();
      await component.handleSend({
        content: 'テスト',
        files: [],
        assistantId: 'asst-1',
        useWebSearch: false,
        createLibrary: false,
      });
      await fixture.whenStable();
      expect(mockChatService.createNewRoom).toHaveBeenCalledWith('asst-1');
    });

    test('handleRegenerate が呼ばれると chatService.regenerateMessage が呼ばれること', () => {
      component.handleRegenerate('msg-1');
      expect(mockChatService.regenerateMessage).toHaveBeenCalledWith('msg-1');
    });

    test('handleRetry が呼ばれると chatService.retryMessage が呼ばれること', () => {
      component.handleRetry('msg-1');
      expect(mockChatService.retryMessage).toHaveBeenCalledWith('msg-1');
    });

    test('handleEditSubmit が呼ばれると chatService.editMessage が呼ばれること', () => {
      component.handleEditSubmit({ messageId: 'msg-1', newText: '編集後' });
      expect(mockChatService.editMessage).toHaveBeenCalledWith('msg-1', '編集後');
    });

    test('handleDelete が呼ばれると chatService.deleteMessage が呼ばれること', () => {
      component.handleDelete('msg-1');
      expect(mockChatService.deleteMessage).toHaveBeenCalledWith('msg-1');
    });

    test('handleRate（up）で chatService.rateMessage に GOOD が渡されること', () => {
      component.handleRate({ messageId: 'msg-1', rating: 'up' });
      expect(mockChatService.rateMessage).toHaveBeenCalledWith('msg-1', 'GOOD');
    });

    test('handleRate（down）で chatService.rateMessage に BAD が渡されること', () => {
      component.handleRate({ messageId: 'msg-1', rating: 'down' });
      expect(mockChatService.rateMessage).toHaveBeenCalledWith('msg-1', 'BAD');
    });

    test('createNewChat でダイアログが開かれること', () => {
      component.createNewChat();
      expect(mockDialog.open).toHaveBeenCalled();
    });

    test('openRenameDialog で activeRoom がある場合ダイアログが開かれること', () => {
      mockActiveRoomSignal.set(mockActiveRoom);
      component.openRenameDialog();
      expect(mockDialog.open).toHaveBeenCalled();
    });

    test('openRenameDialog で activeRoom が undefined の場合ダイアログが開かれないこと', () => {
      mockActiveRoomSignal.set(undefined);
      component.openRenameDialog();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    test('openRatingDialog でダイアログが開かれること', () => {
      component.openRatingDialog();
      expect(mockDialog.open).toHaveBeenCalled();
    });

    test('openShareDialog でダイアログが開かれること', () => {
      component.openShareDialog();
      expect(mockDialog.open).toHaveBeenCalled();
    });
  });
});
