import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { describe, test, expect, beforeEach } from 'vitest';
import { By } from '@angular/platform-browser';
import { ChatMessageLogoComponent } from './chat-message-logo.component';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

describe('ChatMessageLogoComponent', () => {
  let fixture: ComponentFixture<ChatMessageLogoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatMessageLogoComponent, NoopAnimationsModule],
    })
      .overrideComponent(ChatMessageLogoComponent, {
        set: { imports: [FakeTranslatePipe] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ChatMessageLogoComponent);
  });

  describe('チャットルーム表示時（isNewChat=false）', () => {
    test('アシスタントの説明が渡されている場合、説明文が表示されること', () => {
      fixture.componentRef.setInput('isNewChat', false);
      fixture.componentRef.setInput(
        'assistantDescription',
        '会社の規定・ポリシーなどの社内情報を検索・回答します。',
      );
      fixture.detectChanges();

      const desc = fixture.debugElement.query(By.css('p'));
      expect(desc.nativeElement.textContent.trim()).toBe(
        '会社の規定・ポリシーなどの社内情報を検索・回答します。',
      );
    });

    test('アシスタントの説明が空文字の場合、説明文が表示されないこと', () => {
      fixture.componentRef.setInput('isNewChat', false);
      fixture.componentRef.setInput('assistantDescription', '');
      fixture.detectChanges();

      const desc = fixture.debugElement.query(By.css('p'));
      expect(desc).toBeNull();
    });
  });

  describe('新規チャット表示時（isNewChat=true）', () => {
    test('アシスタントの説明が渡されていても表示されないこと', () => {
      fixture.componentRef.setInput('isNewChat', true);
      fixture.componentRef.setInput('assistantDescription', '何らかの説明');
      fixture.detectChanges();

      const desc = fixture.debugElement.query(By.css('p'));
      expect(desc).toBeNull();
    });
  });

  describe('タイトル表示', () => {
    test('isNewChat=false のとき CHAT.EMPTY.TITLE が表示されること', () => {
      fixture.componentRef.setInput('isNewChat', false);
      fixture.detectChanges();
      const h3 = fixture.debugElement.query(By.css('h3'));
      expect(h3.nativeElement.textContent.trim()).toBe('CHAT.EMPTY.TITLE');
    });

    test('isNewChat=true のとき CHAT.EMPTY.SUBTITLE が表示されること', () => {
      fixture.componentRef.setInput('isNewChat', true);
      fixture.detectChanges();
      const h3 = fixture.debugElement.query(By.css('h3'));
      expect(h3.nativeElement.textContent.trim()).toBe('CHAT.EMPTY.SUBTITLE');
    });
  });
});
