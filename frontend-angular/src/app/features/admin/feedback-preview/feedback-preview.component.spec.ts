import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Component, input, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { FeedbackPreviewComponent } from './feedback-preview.component';
import { ChatService } from '@features/chat/services/chat.service';
import { Message } from '@app-types/chat';

// ── Stubs ────────────────────────────────────────────────────────────────────

@Component({ selector: 'app-chat-window', standalone: true, template: '' })
class ChatWindowStub {
  isReadOnly = input<boolean>(false);
  roomId = input<string | null>(null);
  messages = input<Message[]>([]);
  isLoading = input<boolean>(false);
}

@Component({ selector: 'app-chat-data-panel', standalone: true, template: '' })
class ChatDataPanelStub {
  roomId = input<string | null>(null);
}

@Component({ selector: 'app-loading', standalone: true, template: '' })
class LoadingStub {}

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockMessages = signal<Message[]>([]);
const mockIsLoading = signal<boolean>(false);

const mockChatService = {
  messages: mockMessages,
  isLoading: mockIsLoading,
  loadMessagesForRoom: vi.fn().mockResolvedValue(undefined),
  selectRoom: vi.fn(),
};

// ── Spec ─────────────────────────────────────────────────────────────────────

describe('FeedbackPreviewComponent', () => {
  let fixture: ComponentFixture<FeedbackPreviewComponent>;
  let component: FeedbackPreviewComponent;
  let paramsSubject: Subject<Record<string, string>>;

  beforeEach(async () => {
    paramsSubject = new Subject<Record<string, string>>();
    mockMessages.set([]);
    mockIsLoading.set(false);

    await TestBed.configureTestingModule({
      imports: [FeedbackPreviewComponent, NoopAnimationsModule],
      providers: [
        { provide: ChatService, useValue: mockChatService },
        { provide: ActivatedRoute, useValue: { params: paramsSubject.asObservable() } },
      ],
    })
      .overrideComponent(FeedbackPreviewComponent, {
        set: { imports: [ChatWindowStub, ChatDataPanelStub, LoadingStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(FeedbackPreviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  // ── 初期値・ゲッター ──────────────────────────────────────────────────────

  describe('初期値・ゲッター', () => {
    test('roomIdの初期値がnullであること', () => {
      expect(component.roomId()).toBeNull();
    });

    test('showViewerがメッセージなしのときfalseであること', () => {
      expect(component.showViewer()).toBe(false);
    });

    test('showViewerがassistantロールのメッセージがあるときtrueであること', () => {
      mockMessages.set([
        {
          id: '1',
          messageId: 'msg-1',
          role: 'assistant',
          status: 'OK',
          question: '',
          answer: 'こんにちは',
          context: '',
          isRated: false,
        },
      ]);
      fixture.detectChanges();
      expect(component.showViewer()).toBe(true);
    });

    test('showViewerがuserロールのみのメッセージのときfalseであること', () => {
      mockMessages.set([
        {
          id: '1',
          messageId: 'msg-1',
          role: 'user',
          status: 'OK',
          question: 'テスト質問',
          answer: '',
          context: '',
          isRated: false,
        },
      ]);
      fixture.detectChanges();
      expect(component.showViewer()).toBe(false);
    });

    test('showViewerがuserとassistant混在のメッセージのときtrueであること', () => {
      mockMessages.set([
        {
          id: '1',
          messageId: 'msg-1',
          role: 'user',
          status: 'OK',
          question: 'テスト',
          answer: '',
          context: '',
          isRated: false,
        },
        {
          id: '2',
          messageId: 'msg-2',
          role: 'assistant',
          status: 'OK',
          question: '',
          answer: '回答',
          context: '',
          isRated: false,
        },
      ]);
      fixture.detectChanges();
      expect(component.showViewer()).toBe(true);
    });
  });

  // ── DOM要素表示 ───────────────────────────────────────────────────────────

  describe('DOM要素表示', () => {
    test('isLoadingがtrueのときapp-loadingが表示されること', () => {
      mockIsLoading.set(true);
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('app-loading'))).toBeTruthy();
    });

    test('isLoadingがtrueのときapp-chat-windowが表示されないこと', () => {
      mockIsLoading.set(true);
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('app-chat-window'))).toBeFalsy();
    });

    test('isLoadingがfalseのときapp-chat-windowが表示されること', () => {
      expect(fixture.debugElement.query(By.css('app-chat-window'))).toBeTruthy();
    });

    test('isLoadingがfalseのときapp-loadingが表示されないこと', () => {
      expect(fixture.debugElement.query(By.css('app-loading'))).toBeFalsy();
    });

    test('showViewerがtrueのときapp-chat-data-panelが表示されること', () => {
      mockMessages.set([
        {
          id: '1',
          messageId: 'msg-1',
          role: 'assistant',
          status: 'OK',
          question: '',
          answer: 'こんにちは',
          context: '',
          isRated: false,
        },
      ]);
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('app-chat-data-panel'))).toBeTruthy();
    });

    test('showViewerがfalseのときapp-chat-data-panelが表示されないこと', () => {
      expect(fixture.debugElement.query(By.css('app-chat-data-panel'))).toBeFalsy();
    });

    test('isLoadingがtrueのときapp-chat-data-panelが表示されないこと', () => {
      mockIsLoading.set(true);
      mockMessages.set([
        {
          id: '1',
          messageId: 'msg-1',
          role: 'assistant',
          status: 'OK',
          question: '',
          answer: '回答',
          context: '',
          isRated: false,
        },
      ]);
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('app-chat-data-panel'))).toBeFalsy();
    });
  });

  // ── DOM要素イベント ───────────────────────────────────────────────────────

  describe('DOM要素イベント', () => {
    test('routeパラメータからroomIdが設定されること', async () => {
      paramsSubject.next({ roomId: 'room-123' });
      fixture.detectChanges();
      await fixture.whenStable();
      expect(component.roomId()).toBe('room-123');
    });

    test('roomIdがある場合にloadMessagesForRoomが呼ばれること', async () => {
      paramsSubject.next({ roomId: 'room-123' });
      fixture.detectChanges();
      await fixture.whenStable();
      expect(mockChatService.loadMessagesForRoom).toHaveBeenCalledWith('room-123', true);
    });

    test('roomIdがある場合にselectRoomが呼ばれること', async () => {
      paramsSubject.next({ roomId: 'room-123' });
      fixture.detectChanges();
      await fixture.whenStable();
      expect(mockChatService.selectRoom).toHaveBeenCalledWith('room-123');
    });

    test('roomIdがない場合にloadMessagesForRoomが呼ばれないこと', async () => {
      paramsSubject.next({});
      fixture.detectChanges();
      await fixture.whenStable();
      expect(mockChatService.loadMessagesForRoom).not.toHaveBeenCalled();
    });

    test('roomIdがない場合にselectRoomが呼ばれないこと', async () => {
      paramsSubject.next({});
      fixture.detectChanges();
      await fixture.whenStable();
      expect(mockChatService.selectRoom).not.toHaveBeenCalled();
    });

    test('roomIdが変わったときに新しいroomIdでloadMessagesForRoomが呼ばれること', async () => {
      paramsSubject.next({ roomId: 'room-001' });
      fixture.detectChanges();
      await fixture.whenStable();

      paramsSubject.next({ roomId: 'room-002' });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(mockChatService.loadMessagesForRoom).toHaveBeenCalledWith('room-002', true);
      expect(mockChatService.selectRoom).toHaveBeenCalledWith('room-002');
    });
  });
});
