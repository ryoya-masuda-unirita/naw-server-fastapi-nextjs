import { Component, input, Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateService } from '@ngx-translate/core';
import { ChatErrorComponent } from './chat-error.component';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {
  readonly name = input.required<string>();
}

const mockTranslate = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  onLangChange: { subscribe: vi.fn() },
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

describe('ChatErrorComponent', () => {
  let fixture: ComponentFixture<ChatErrorComponent>;
  let component: ChatErrorComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatErrorComponent],
      providers: [{ provide: TranslateService, useValue: mockTranslate }],
    })
      .overrideComponent(ChatErrorComponent, {
        set: { imports: [FakeTranslatePipe, SvgIconStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ChatErrorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('title', 'エラータイトル');
    fixture.componentRef.setInput('message', 'エラーメッセージ');
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('title入力が正しく設定されること', () => {
      expect(component.title()).toBe('エラータイトル');
    });

    test('message入力が正しく設定されること', () => {
      expect(component.message()).toBe('エラーメッセージ');
    });

    test('titleを別の値に更新できること', () => {
      fixture.componentRef.setInput('title', '新しいエラー');
      fixture.detectChanges();
      expect(component.title()).toBe('新しいエラー');
    });

    test('messageを別の値に更新できること', () => {
      fixture.componentRef.setInput('message', '別のエラーメッセージ');
      fixture.detectChanges();
      expect(component.message()).toBe('別のエラーメッセージ');
    });
  });

  describe('DOM要素表示', () => {
    test('role="alert"属性が設定されること', () => {
      const alertEl = fixture.debugElement.query(By.css('[role="alert"]'));
      expect(alertEl).toBeTruthy();
    });

    test('bg-bg-errorクラスがコンテナに適用されること', () => {
      const containerEl = fixture.debugElement.query(By.css('.bg-bg-error'));
      expect(containerEl).toBeTruthy();
    });

    test('タイトルがDOMに表示されること', () => {
      const titleEl = fixture.debugElement.query(By.css('p.text-label-x-large'));
      expect(titleEl.nativeElement.textContent.trim()).toBe('エラータイトル');
    });

    test('メッセージがDOMに表示されること', () => {
      const messageEl = fixture.debugElement.query(By.css('p.text-body-small'));
      expect(messageEl.nativeElement.textContent.trim()).toBe('エラーメッセージ');
    });

    test('エラーアイコンコンポーネントが表示されること', () => {
      const iconEl = fixture.debugElement.query(By.directive(SvgIconStub));
      expect(iconEl).toBeTruthy();
    });

    test('エラーアイコンのnameがerrorであること', () => {
      const iconEl = fixture.debugElement.query(By.directive(SvgIconStub));
      expect(iconEl.componentInstance.name()).toBe('error');
    });

    test('titleが変わるとDOMに反映されること', () => {
      fixture.componentRef.setInput('title', '更新されたタイトル');
      fixture.detectChanges();
      const titleEl = fixture.debugElement.query(By.css('p.text-label-x-large'));
      expect(titleEl.nativeElement.textContent.trim()).toBe('更新されたタイトル');
    });

    test('messageが変わるとDOMに反映されること', () => {
      fixture.componentRef.setInput('message', '更新されたメッセージ');
      fixture.detectChanges();
      const messageEl = fixture.debugElement.query(By.css('p.text-body-small'));
      expect(messageEl.nativeElement.textContent.trim()).toBe('更新されたメッセージ');
    });
  });

  describe('DOM要素イベント', () => {
    test('dismiss()メソッドでdismissedイベントが発火すること', () => {
      const emitted: void[] = [];
      component.dismissed.subscribe(() => emitted.push(undefined));

      component.dismiss();

      expect(emitted.length).toBe(1);
    });

    test('dismiss()を複数回呼ぶと複数回dismissedイベントが発火すること', () => {
      const emitted: void[] = [];
      component.dismissed.subscribe(() => emitted.push(undefined));

      component.dismiss();
      component.dismiss();
      component.dismiss();

      expect(emitted.length).toBe(3);
    });

    test('dismissedイベントにvoidが渡されること', () => {
      const spy = vi.spyOn(component.dismissed, 'emit');

      component.dismiss();

      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});
