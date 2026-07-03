import { Component, input, output, Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslateService } from '@ngx-translate/core';
import { ChatService } from '@features/chat/services/chat.service';
import { ChatMessageListComponent } from './chat-message-list.component';
import { Message } from '../../../../../types/chat/message.type';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

@Component({ selector: 'app-chat-message-logo', standalone: true, template: '' })
class ChatMessageLogoStub {
  readonly isNewChat = input<boolean>(false);
  readonly assistantDescription = input<string>('');
}

@Component({ selector: 'app-chat-message-item', standalone: true, template: '' })
class ChatMessageItemStub {
  readonly message = input.required<Message>();
  readonly isLast = input<boolean>(false);
  readonly isReadOnly = input<boolean>(false);
  readonly versionInfo = input<unknown>(null);
  readonly retry = output<string>();
  readonly copyMessage = output<string>();
  readonly regenerate = output<string>();
  readonly delete = output<string>();
  readonly rate = output<{ messageId: string; rating: 'up' | 'down' }>();
  readonly handleSend = output<string>();
  readonly prevVersion = output<void>();
  readonly nextVersion = output<void>();
}

const mockChatService = {
  versionInfoByMessageId: vi.fn(() => new Map()),
  switchMessageVersion: vi.fn(),
};

const mockTranslate = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  onLangChange: { subscribe: vi.fn() },
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

const sampleMessage: Message = {
  id: 'msg-1',
  messageId: 'msg-1',
  role: 'user',
  status: 'OK',
  question: 'Hello',
  answer: '',
  context: '',
  isRated: false,
};

const sampleMessages: Message[] = [
  sampleMessage,
  { ...sampleMessage, id: 'msg-2', messageId: 'msg-2' },
];

const configureTestingModule = async () => {
  return await TestBed.configureTestingModule({
    imports: [ChatMessageListComponent, NoopAnimationsModule],
    providers: [
      { provide: TranslateService, useValue: mockTranslate },
      { provide: ChatService, useValue: mockChatService },
    ],
  })
    .overrideComponent(ChatMessageListComponent, {
      set: {
        imports: [
          CommonModule,
          MatIconModule,
          FakeTranslatePipe,
          ChatMessageItemStub,
          ChatMessageLogoStub,
        ],
      },
    })
    .compileComponents();
};

describe('ChatMessageListComponent', () => {
  let component: ChatMessageListComponent;
  let fixture: ComponentFixture<ChatMessageListComponent>;

  beforeEach(async () => {
    await configureTestingModule();
    fixture = TestBed.createComponent(ChatMessageListComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('messages', []);
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('初期状態: isLoading がfalseであること', () => {
      expect(component.isLoading()).toBe(false);
    });

    test('初期状態: isNewChat がfalseであること', () => {
      expect(component.isNewChat()).toBe(false);
    });

    test('初期状態: messages が空配列であること', () => {
      expect(component.messages()).toEqual([]);
    });

    test('messages に値がセットされること', () => {
      fixture.componentRef.setInput('messages', sampleMessages);
      fixture.detectChanges();
      expect(component.messages().length).toBe(2);
    });
  });

  describe('DOM要素表示', () => {
    test('messages が空の場合: app-chat-message-logo が表示されること', () => {
      const logo = fixture.debugElement.query(By.directive(ChatMessageLogoStub));
      expect(logo).toBeTruthy();
    });

    test('messages が空の場合: isNewChat がapp-chat-message-logoに渡されること', () => {
      fixture.componentRef.setInput('isNewChat', true);
      fixture.detectChanges();
      const logo = fixture.debugElement.query(By.directive(ChatMessageLogoStub));
      expect((logo.componentInstance as ChatMessageLogoStub).isNewChat()).toBe(true);
    });

    test('messages が空の場合: assistantDescription がapp-chat-message-logoに渡されること', () => {
      fixture.componentRef.setInput('assistantDescription', 'テストアシスタントの説明');
      fixture.detectChanges();
      const logo = fixture.debugElement.query(By.directive(ChatMessageLogoStub));
      expect((logo.componentInstance as ChatMessageLogoStub).assistantDescription()).toBe(
        'テストアシスタントの説明',
      );
    });

    test('messages が空の場合: メッセージリストが表示されないこと', () => {
      const list = fixture.debugElement.query(By.css('.chat-page-messages'));
      expect(list).toBeFalsy();
    });

    test('messages がある場合: app-chat-message-logo が表示されないこと', () => {
      fixture.componentRef.setInput('messages', sampleMessages);
      fixture.detectChanges();
      const logo = fixture.debugElement.query(By.directive(ChatMessageLogoStub));
      expect(logo).toBeFalsy();
    });

    test('messages がある場合: メッセージリストが表示されること', () => {
      fixture.componentRef.setInput('messages', sampleMessages);
      fixture.detectChanges();
      const list = fixture.debugElement.query(By.css('.chat-page-messages'));
      expect(list).toBeTruthy();
    });

    test('messages がある場合: メッセージアイテムが正しい数だけ表示されること', () => {
      fixture.componentRef.setInput('messages', sampleMessages);
      fixture.detectChanges();
      const items = fixture.debugElement.queryAll(By.directive(ChatMessageItemStub));
      expect(items.length).toBe(2);
    });

    test('最後のメッセージアイテム: isLast がtrueで渡されること', () => {
      fixture.componentRef.setInput('messages', sampleMessages);
      fixture.detectChanges();
      const items = fixture.debugElement.queryAll(By.directive(ChatMessageItemStub));
      const lastItem = items[items.length - 1].componentInstance as ChatMessageItemStub;
      expect(lastItem.isLast()).toBe(true);
    });

    test('最後でないメッセージアイテム: isLast がfalseで渡されること', () => {
      fixture.componentRef.setInput('messages', sampleMessages);
      fixture.detectChanges();
      const items = fixture.debugElement.queryAll(By.directive(ChatMessageItemStub));
      const firstItem = items[0].componentInstance as ChatMessageItemStub;
      expect(firstItem.isLast()).toBe(false);
    });

    test('isReadOnly がtrueの場合: 各メッセージアイテムにisReadOnlyがtrueで渡されること', () => {
      fixture.componentRef.setInput('messages', sampleMessages);
      fixture.componentRef.setInput('isReadOnly', true);
      fixture.detectChanges();
      const items = fixture.debugElement.queryAll(By.directive(ChatMessageItemStub));
      items.forEach((item) => {
        expect((item.componentInstance as ChatMessageItemStub).isReadOnly()).toBe(true);
      });
    });

    test('isReadOnly が未指定の場合: 各メッセージアイテムにisReadOnlyがfalseで渡されること', () => {
      fixture.componentRef.setInput('messages', sampleMessages);
      fixture.detectChanges();
      const items = fixture.debugElement.queryAll(By.directive(ChatMessageItemStub));
      items.forEach((item) => {
        expect((item.componentInstance as ChatMessageItemStub).isReadOnly()).toBe(false);
      });
    });
  });

  describe('DOM要素イベント', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('messages', sampleMessages);
      fixture.detectChanges();
    });

    test('ChatMessageItem copyMessage イベント: copyMessage が転送されること', () => {
      const spy = vi.spyOn(component.copyMessage, 'emit');
      const item = fixture.debugElement.query(By.directive(ChatMessageItemStub));
      (item.componentInstance as ChatMessageItemStub).copyMessage.emit('msg-1');
      expect(spy).toHaveBeenCalledWith('msg-1');
    });

    test('ChatMessageItem regenerate イベント: regenerate が転送されること', () => {
      const spy = vi.spyOn(component.regenerate, 'emit');
      const item = fixture.debugElement.query(By.directive(ChatMessageItemStub));
      (item.componentInstance as ChatMessageItemStub).regenerate.emit('msg-1');
      expect(spy).toHaveBeenCalledWith('msg-1');
    });

    test('ChatMessageItem retry イベント: retry が転送されること', () => {
      const spy = vi.spyOn(component.retry, 'emit');
      const item = fixture.debugElement.query(By.directive(ChatMessageItemStub));
      (item.componentInstance as ChatMessageItemStub).retry.emit('msg-1');
      expect(spy).toHaveBeenCalledWith('msg-1');
    });

    test('ChatMessageItem delete イベント: delete が転送されること', () => {
      const spy = vi.spyOn(component.delete, 'emit');
      const item = fixture.debugElement.query(By.directive(ChatMessageItemStub));
      (item.componentInstance as ChatMessageItemStub).delete.emit('msg-1');
      expect(spy).toHaveBeenCalledWith('msg-1');
    });

    test('ChatMessageItem rate イベント: rate が転送されること', () => {
      const spy = vi.spyOn(component.rate, 'emit');
      const item = fixture.debugElement.query(By.directive(ChatMessageItemStub));
      (item.componentInstance as ChatMessageItemStub).rate.emit({
        messageId: 'msg-1',
        rating: 'up',
      });
      expect(spy).toHaveBeenCalledWith({ messageId: 'msg-1', rating: 'up' });
    });

    test('ChatMessageItem handleSend イベント: editSubmit が発火されること', () => {
      const spy = vi.spyOn(component.editSubmit, 'emit');
      const item = fixture.debugElement.query(By.directive(ChatMessageItemStub));
      (item.componentInstance as ChatMessageItemStub).handleSend.emit('New text');
      expect(spy).toHaveBeenCalledWith({ messageId: 'msg-1', newText: 'New text' });
    });
  });
});
