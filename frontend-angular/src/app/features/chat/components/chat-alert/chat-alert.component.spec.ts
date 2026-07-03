import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Pipe, PipeTransform } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ChatAlertComponent } from './chat-alert.component';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

const mockTranslate = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  onLangChange: { subscribe: vi.fn() },
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

describe('ChatAlertComponent', () => {
  let fixture: ComponentFixture<ChatAlertComponent>;
  let component: ChatAlertComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatAlertComponent],
      providers: [{ provide: TranslateService, useValue: mockTranslate }],
    })
      .overrideComponent(ChatAlertComponent, {
        set: { imports: [FakeTranslatePipe] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ChatAlertComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('title', 'テストタイトル');
    fixture.componentRef.setInput('message', 'テストメッセージ');
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('title入力が正しく設定されること', () => {
      expect(component.title()).toBe('テストタイトル');
    });

    test('message入力が正しく設定されること', () => {
      expect(component.message()).toBe('テストメッセージ');
    });
  });

  describe('DOM要素表示', () => {
    test('role="alert"属性が設定されること', () => {
      const alertEl = fixture.debugElement.query(By.css('[role="alert"]'));
      expect(alertEl).toBeTruthy();
    });

    test('タイトルがDOMに表示されること', () => {
      const titleEl = fixture.debugElement.query(By.css('p.text-label-x-large'));
      expect(titleEl.nativeElement.textContent.trim()).toBe('テストタイトル');
    });

    test('メッセージがDOMに表示されること', () => {
      const messageEl = fixture.debugElement.query(By.css('p.text-body-small'));
      expect(messageEl.nativeElement.textContent.trim()).toBe('テストメッセージ');
    });

    test('閉じるボタンが表示されること', () => {
      const closeBtn = fixture.debugElement.query(By.css('button[type="button"]'));
      expect(closeBtn).toBeTruthy();
    });
  });

  describe('DOM要素イベント', () => {
    test('閉じるボタンクリックでdismissedイベントが発火すること', () => {
      const emitted: void[] = [];
      component.dismissed.subscribe(() => emitted.push(undefined));

      const closeBtn = fixture.debugElement.query(By.css('button[type="button"]'));
      closeBtn.nativeElement.click();

      expect(emitted.length).toBe(1);
    });

    test('dismiss()メソッドでdismissedイベントが発火すること', () => {
      const emitted: void[] = [];
      component.dismissed.subscribe(() => emitted.push(undefined));

      component.dismiss();

      expect(emitted.length).toBe(1);
    });

    test('複数回クリックすると複数回dismissedイベントが発火すること', () => {
      const emitted: void[] = [];
      component.dismissed.subscribe(() => emitted.push(undefined));

      component.dismiss();
      component.dismiss();

      expect(emitted.length).toBe(2);
    });
  });
});
