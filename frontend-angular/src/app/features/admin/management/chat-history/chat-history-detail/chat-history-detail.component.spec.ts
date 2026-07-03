import { Component, input, Pipe, PipeTransform, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';

import { AdminChatHistoryDetailComponent } from './chat-history-detail.component';
import { ChatService } from '@features/chat/services/chat.service';
import type { MessageLoadError } from '@features/chat/services/messages.service';

@Component({ selector: 'app-icon-button', standalone: true, template: '' })
class IconButtonStub {
  readonly link = input<string>('');
  readonly ariaLabel = input<string>('');
}

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {}

@Component({ selector: 'app-chat-window', standalone: true, template: '' })
class ChatWindowStub {
  readonly showHeader = input<boolean>();
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

const mockMessages = signal<{ role: string }[]>([]);
const mockIsLoading = signal(false);
const mockLoadError = signal<MessageLoadError>(null);
const mockActiveRoom = signal<{ name: string } | undefined>(undefined);

const mockChatService = {
  messages: mockMessages,
  isLoading: mockIsLoading,
  messagesLoadError: mockLoadError,
  activeRoom: mockActiveRoom,
  openAdminHistoryRoom: vi.fn(),
  loadMessagesForRoom: vi.fn(),
  clearAdminHistoryRoomContext: vi.fn(),
  startNewChat: vi.fn(),
};

const mockTranslate = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  onLangChange: { subscribe: vi.fn() },
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

let paramsSubject: Subject<Record<string, string>>;

describe('AdminChatHistoryDetailComponent', () => {
  let fixture: ComponentFixture<AdminChatHistoryDetailComponent>;
  let component: AdminChatHistoryDetailComponent;

  beforeEach(async () => {
    paramsSubject = new Subject<Record<string, string>>();
    mockMessages.set([]);
    mockIsLoading.set(false);
    mockLoadError.set(null);
    mockActiveRoom.set(undefined);
    mockChatService.openAdminHistoryRoom.mockReset();
    mockChatService.loadMessagesForRoom.mockReset();
    mockChatService.clearAdminHistoryRoomContext.mockReset();
    mockChatService.startNewChat.mockReset();

    await TestBed.configureTestingModule({
      imports: [AdminChatHistoryDetailComponent, NoopAnimationsModule],
      providers: [
        { provide: ChatService, useValue: mockChatService },
        { provide: TranslateService, useValue: mockTranslate },
        {
          provide: ActivatedRoute,
          useValue: { params: paramsSubject.asObservable() },
        },
      ],
    })
      .overrideComponent(AdminChatHistoryDetailComponent, {
        set: {
          imports: [
            FakeTranslatePipe,
            IconButtonStub,
            SvgIconStub,
            ChatWindowStub,
            ChatDataPanelStub,
            LoadingStub,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AdminChatHistoryDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  test('roomIdがある場合openAdminHistoryRoomとloadMessagesForRoomが呼ばれること', () => {
    paramsSubject.next({ roomId: 'room-123' });
    fixture.detectChanges();

    expect(component.roomId()).toBe('room-123');
    expect(mockChatService.openAdminHistoryRoom).toHaveBeenCalledWith({
      id: 'room-123',
      name: '',
      userId: undefined,
      userName: undefined,
    });
    expect(mockChatService.loadMessagesForRoom).toHaveBeenCalledWith('room-123', true);
  });

  test('ヘッダーに戻るボタンが表示されること', () => {
    const backButton = fixture.debugElement.query(By.css('app-icon-button'));
    expect(backButton).toBeTruthy();
    expect(backButton.componentInstance.link()).toBe('/admin/chat-history');
  });

  test('isLoadingがtrueの場合app-loadingが表示されること', () => {
    mockIsLoading.set(true);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('app-loading'))).toBeTruthy();
  });

  test('403エラー時にFORBIDDENメッセージが表示されること', () => {
    mockIsLoading.set(false);
    mockLoadError.set('forbidden');
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('CHAT_HISTORY.DETAIL.FORBIDDEN');
    expect(fixture.debugElement.query(By.css('app-chat-window'))).toBeNull();
  });

  test('メッセージが空の場合EMPTYメッセージが表示されること', () => {
    mockIsLoading.set(false);
    mockLoadError.set(null);
    mockMessages.set([]);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('CHAT_HISTORY.DETAIL.EMPTY');
    expect(fixture.debugElement.query(By.css('app-chat-window'))).toBeNull();
  });

  test('メッセージがある場合read-onlyのchat-windowが表示されること', () => {
    mockIsLoading.set(false);
    mockLoadError.set(null);
    mockMessages.set([{ role: 'user' }]);
    fixture.detectChanges();
    const chatWindow = fixture.debugElement.query(By.css('app-chat-window'));
    expect(chatWindow).toBeTruthy();
    expect(chatWindow.componentInstance.isReadOnly()).toBe(true);
    expect(chatWindow.componentInstance.showHeader()).toBe(false);
  });

  test('destroy時にコンテキストをクリアすること', () => {
    fixture.destroy();
    expect(mockChatService.clearAdminHistoryRoomContext).toHaveBeenCalled();
    expect(mockChatService.startNewChat).toHaveBeenCalled();
  });
});
