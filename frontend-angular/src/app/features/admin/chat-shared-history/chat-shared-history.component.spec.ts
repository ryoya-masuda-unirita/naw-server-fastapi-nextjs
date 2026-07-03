import { Component, input, Pipe, PipeTransform, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';

import { ChatSharedHistoryComponent } from './chat-shared-history.component';
import { ChatService } from '@features/chat/services/chat.service';

// ─── Stubs ────────────────────────────────────────────────────────────────────

@Component({ selector: 'app-chat-window', standalone: true, template: '' })
class ChatWindowStub {
  readonly isReadOnly = input<boolean>();
  readonly roomId = input<string | null>(null);
  readonly messages = input<{ role: string }[]>([]);
}

@Component({ selector: 'app-chat-data-panel', standalone: true, template: '' })
class ChatDataPanelStub {
  readonly roomId = input<string | null>(null);
}

@Component({ selector: 'app-loading', standalone: true, template: '' })
class LoadingStub {}

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockMessages = signal<{ role: string }[]>([]);
const mockIsLoading = signal(false);

const mockChatService = {
  messages: mockMessages,
  isLoading: mockIsLoading,
  selectRoom: vi.fn(),
};

const mockTranslate = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  onLangChange: { subscribe: vi.fn() },
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

let paramsSubject: Subject<Record<string, string>>;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ChatSharedHistoryComponent', () => {
  let fixture: ComponentFixture<ChatSharedHistoryComponent>;
  let component: ChatSharedHistoryComponent;

  beforeEach(async () => {
    paramsSubject = new Subject<Record<string, string>>();
    mockMessages.set([]);
    mockIsLoading.set(false);
    mockChatService.selectRoom.mockReset();

    await TestBed.configureTestingModule({
      imports: [ChatSharedHistoryComponent, NoopAnimationsModule],
      providers: [
        { provide: ChatService, useValue: mockChatService },
        { provide: TranslateService, useValue: mockTranslate },
        {
          provide: ActivatedRoute,
          useValue: { params: paramsSubject.asObservable() },
        },
      ],
    })
      .overrideComponent(ChatSharedHistoryComponent, {
        set: {
          imports: [FakeTranslatePipe, ChatWindowStub, ChatDataPanelStub, LoadingStub],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ChatSharedHistoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  // ─── 初期値・ゲッター ─────────────────────────────────────────────────────────

  describe('初期値・ゲッター', () => {
    test('roomIdの初期値がnullであること', () => {
      expect(component.roomId()).toBeNull();
    });

    test('assistantメッセージがない場合showViewerがfalseであること', () => {
      mockMessages.set([{ role: 'user' }]);
      fixture.detectChanges();
      expect(component.showViewer()).toBe(false);
    });

    test('assistantメッセージがある場合showViewerがtrueであること', () => {
      mockMessages.set([{ role: 'user' }, { role: 'assistant' }]);
      fixture.detectChanges();
      expect(component.showViewer()).toBe(true);
    });

    test('メッセージが空の場合showViewerがfalseであること', () => {
      mockMessages.set([]);
      fixture.detectChanges();
      expect(component.showViewer()).toBe(false);
    });
  });

  // ─── DOM要素表示 ──────────────────────────────────────────────────────────────

  describe('DOM要素表示', () => {
    test('isLoadingがtrueの場合app-loadingが表示されること', () => {
      mockIsLoading.set(true);
      fixture.detectChanges();
      const loading = fixture.debugElement.query(By.css('app-loading'));
      expect(loading).toBeTruthy();
    });

    test('isLoadingがtrueの場合app-chat-windowが表示されないこと', () => {
      mockIsLoading.set(true);
      fixture.detectChanges();
      const chatWindow = fixture.debugElement.query(By.css('app-chat-window'));
      expect(chatWindow).toBeNull();
    });

    test('isLoadingがfalseの場合app-chat-windowが表示されること', () => {
      mockIsLoading.set(false);
      fixture.detectChanges();
      const chatWindow = fixture.debugElement.query(By.css('app-chat-window'));
      expect(chatWindow).toBeTruthy();
    });

    test('isLoadingがfalseの場合app-loadingが表示されないこと', () => {
      mockIsLoading.set(false);
      fixture.detectChanges();
      const loading = fixture.debugElement.query(By.css('app-loading'));
      expect(loading).toBeNull();
    });

    test('showViewerがtrueの場合app-chat-data-panelが表示されること', () => {
      mockIsLoading.set(false);
      mockMessages.set([{ role: 'assistant' }]);
      fixture.detectChanges();
      const dataPanel = fixture.debugElement.query(By.css('app-chat-data-panel'));
      expect(dataPanel).toBeTruthy();
    });

    test('showViewerがfalseの場合app-chat-data-panelが表示されないこと', () => {
      mockIsLoading.set(false);
      mockMessages.set([{ role: 'user' }]);
      fixture.detectChanges();
      const dataPanel = fixture.debugElement.query(By.css('app-chat-data-panel'));
      expect(dataPanel).toBeNull();
    });
  });

  // ─── DOM要素イベント ──────────────────────────────────────────────────────────

  describe('DOM要素イベント', () => {
    test('route paramsからroomIdが設定されること', () => {
      paramsSubject.next({ roomId: 'room-123' });
      fixture.detectChanges();
      expect(component.roomId()).toBe('room-123');
    });

    test('roomIdがある場合chatService.selectRoomが呼ばれること', () => {
      paramsSubject.next({ roomId: 'room-456' });
      fixture.detectChanges();
      expect(mockChatService.selectRoom).toHaveBeenCalledWith('room-456');
    });

    test('roomIdがない場合chatService.selectRoomが呼ばれないこと', () => {
      paramsSubject.next({});
      fixture.detectChanges();
      expect(mockChatService.selectRoom).not.toHaveBeenCalled();
    });

    test('app-chat-windowにisReadOnly=trueが渡されること', () => {
      mockIsLoading.set(false);
      fixture.detectChanges();
      const chatWindow = fixture.debugElement.query(By.css('app-chat-window'));
      expect(chatWindow.componentInstance.isReadOnly()).toBe(true);
    });

    test('app-chat-windowにroomIdが渡されること', () => {
      mockIsLoading.set(false);
      paramsSubject.next({ roomId: 'room-789' });
      fixture.detectChanges();
      const chatWindow = fixture.debugElement.query(By.css('app-chat-window'));
      expect(chatWindow.componentInstance.roomId()).toBe('room-789');
    });

    test('app-chat-windowにmessagesが渡されること', () => {
      mockIsLoading.set(false);
      const msgs = [{ role: 'user' }];
      mockMessages.set(msgs);
      fixture.detectChanges();
      const chatWindow = fixture.debugElement.query(By.css('app-chat-window'));
      expect(chatWindow.componentInstance.messages()).toEqual(msgs);
    });

    test('app-chat-data-panelにroomIdが渡されること', () => {
      mockIsLoading.set(false);
      mockMessages.set([{ role: 'assistant' }]);
      paramsSubject.next({ roomId: 'room-abc' });
      fixture.detectChanges();
      const dataPanel = fixture.debugElement.query(By.css('app-chat-data-panel'));
      expect(dataPanel.componentInstance.roomId()).toBe('room-abc');
    });
  });
});
