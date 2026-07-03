import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateService } from '@ngx-translate/core';
import { FakeTranslatePipe } from 'src/testing/fake-translate.pipe';
import { ChatMessageFooterComponent } from './chat-message-footer.component';

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

describe('ChatMessageFooterComponent', () => {
  let fixture: ComponentFixture<ChatMessageFooterComponent>;
  let component: ChatMessageFooterComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatMessageFooterComponent, NoopAnimationsModule],
      providers: [{ provide: TranslateService, useValue: mockTranslate }],
    })
      .overrideComponent(ChatMessageFooterComponent, {
        set: { imports: [FakeTranslatePipe, SvgIconStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ChatMessageFooterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  function getThumbsUpButton(): HTMLButtonElement {
    return fixture.debugElement.query(By.css('[data-thumbs-up-btn]')).nativeElement;
  }

  function getThumbsDownButton(): HTMLButtonElement {
    return fixture.debugElement.query(By.css('[data-thumbs-down-btn]')).nativeElement;
  }

  describe('評価ボタンの表示', () => {
    test('未評価時: 両ボタンが有効で is-on クラスを持たないこと', () => {
      expect(getThumbsUpButton().disabled).toBe(false);
      expect(getThumbsDownButton().disabled).toBe(false);
      expect(getThumbsUpButton().classList.contains('is-on')).toBe(false);
      expect(getThumbsDownButton().classList.contains('is-on')).toBe(false);
    });

    test('GOOD 評価済み: GOOD ボタンのみ disabled かつ is-on であること', () => {
      fixture.componentRef.setInput('thumbsUpActive', true);
      fixture.detectChanges();

      expect(getThumbsUpButton().disabled).toBe(true);
      expect(getThumbsUpButton().classList.contains('is-on')).toBe(true);
      expect(getThumbsDownButton().disabled).toBe(false);
      expect(getThumbsDownButton().classList.contains('is-on')).toBe(false);
    });

    test('BAD 評価済み: BAD ボタンのみ disabled かつ is-on であること', () => {
      fixture.componentRef.setInput('thumbsDownActive', true);
      fixture.detectChanges();

      expect(getThumbsDownButton().disabled).toBe(true);
      expect(getThumbsDownButton().classList.contains('is-on')).toBe(true);
      expect(getThumbsUpButton().disabled).toBe(false);
      expect(getThumbsUpButton().classList.contains('is-on')).toBe(false);
    });
  });

  describe('read-only', () => {
    test('isReadOnly=true のときコピー以外の操作ボタンが非表示であること', () => {
      fixture.componentRef.setInput('isReadOnly', true);
      fixture.detectChanges();

      expect(getThumbsUpButton().hidden).toBe(true);
      expect(getThumbsDownButton().hidden).toBe(true);
      expect(fixture.debugElement.query(By.css('[data-copy-btn]')).nativeElement.hidden).toBe(
        false,
      );
    });
  });

  describe('評価ボタンのイベント', () => {
    test('未評価時: handleThumbsUp で thumbsUp が発火すること', () => {
      const spy = vi.spyOn(component.thumbsUp, 'emit');
      component.handleThumbsUp();
      expect(spy).toHaveBeenCalled();
    });

    test('未評価時: handleThumbsDown で thumbsDown が発火すること', () => {
      const spy = vi.spyOn(component.thumbsDown, 'emit');
      component.handleThumbsDown();
      expect(spy).toHaveBeenCalled();
    });

    test('GOOD 評価済み: handleThumbsUp では thumbsUp が発火しないこと', () => {
      fixture.componentRef.setInput('thumbsUpActive', true);
      fixture.detectChanges();
      const spy = vi.spyOn(component.thumbsUp, 'emit');
      component.handleThumbsUp();
      expect(spy).not.toHaveBeenCalled();
    });

    test('GOOD 評価済み: handleThumbsDown では thumbsDown が発火すること', () => {
      fixture.componentRef.setInput('thumbsUpActive', true);
      fixture.detectChanges();
      const spy = vi.spyOn(component.thumbsDown, 'emit');
      component.handleThumbsDown();
      expect(spy).toHaveBeenCalled();
    });

    test('BAD 評価済み: handleThumbsDown では thumbsDown が発火しないこと', () => {
      fixture.componentRef.setInput('thumbsDownActive', true);
      fixture.detectChanges();
      const spy = vi.spyOn(component.thumbsDown, 'emit');
      component.handleThumbsDown();
      expect(spy).not.toHaveBeenCalled();
    });

    test('BAD 評価済み: handleThumbsUp では thumbsUp が発火すること', () => {
      fixture.componentRef.setInput('thumbsDownActive', true);
      fixture.detectChanges();
      const spy = vi.spyOn(component.thumbsUp, 'emit');
      component.handleThumbsUp();
      expect(spy).toHaveBeenCalled();
    });
  });
});
