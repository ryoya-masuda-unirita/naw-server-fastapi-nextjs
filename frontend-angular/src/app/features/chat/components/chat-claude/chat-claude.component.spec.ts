import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Pipe, PipeTransform, Component, Input, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ChatClaudeComponent, Question, Answer } from './chat-claude.component';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

@Component({
  selector: 'app-svg-icon',
  standalone: true,
  template: '<span></span>',
})
class MockSvgIconComponent {
  @Input() name: string = '';
}

@Component({
  selector: 'app-button',
  standalone: true,
  template: '<button><ng-content></ng-content></button>',
})
class MockButtonComponent {
  @Input() variant: string = 'solid';
  @Input() intent: string = 'default';
}

const mockTranslate = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  onLangChange: { subscribe: vi.fn() },
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

const defaultQuestions: Question[] = [
  {
    text: '質問のテキストテキストがここの部分に入ります',
    options: ['選択肢A', '選択肢B', '選択肢C'],
  },
  {
    text: '2番目の質問テキストがここに入ります（複数選択）',
    options: ['選択肢A', '選択肢B', '選択肢C'],
    multi: true,
  },
  { text: '最後の質問テキストがここに入ります', options: ['選択肢A', '選択肢B', '選択肢C'] },
];

describe('ChatClaudeComponent', () => {
  let fixture: ComponentFixture<ChatClaudeComponent>;
  let component: ChatClaudeComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatClaudeComponent],
      providers: [{ provide: TranslateService, useValue: mockTranslate }],
    })
      .overrideComponent(ChatClaudeComponent, {
        set: {
          imports: [FakeTranslatePipe, MockSvgIconComponent, MockButtonComponent],
          schemas: [CUSTOM_ELEMENTS_SCHEMA],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ChatClaudeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('デフォルトのquestionsが設定されること', () => {
      expect(component.questions()).toEqual(defaultQuestions);
    });

    test('デフォルトのdisplayIndexが1であること', () => {
      expect(component.displayIndex()).toBe(1);
    });

    test('デフォルトのtotalCountが3であること', () => {
      expect(component.totalCount()).toBe(3);
    });

    test('currentQuestion()で現在の質問が取得できること', () => {
      expect(component.currentQuestion().text).toBe('質問のテキストテキストがここの部分に入ります');
    });
  });

  describe('DOM要素表示', () => {
    test('アシストカードが表示されること', () => {
      const card = fixture.debugElement.query(By.css('#assist-card'));
      expect(card).toBeTruthy();
    });

    test('閉じるボタンが表示されること', () => {
      const closeBtn = fixture.debugElement.query(By.css('button[aria-label="閉じる"]'));
      expect(closeBtn).toBeTruthy();
    });

    test('ページネーションが表示されること', () => {
      const current = fixture.debugElement.query(By.css('#assist-current'));
      const total = fixture.debugElement.query(By.css('#assist-total'));
      expect(current.nativeElement.textContent).toBe('1');
      expect(total.nativeElement.textContent).toBe('3');
    });
  });

  describe('DOM要素イベント', () => {
    test('閉じるボタンクリックでclosedイベントが発火すること', () => {
      const emitted: void[] = [];
      component.closed.subscribe(() => emitted.push(undefined));

      const closeBtn = fixture.debugElement.query(By.css('button[aria-label="閉じる"]'));
      closeBtn.nativeElement.click();

      expect(emitted.length).toBe(1);
    });

    test('前ボタンクリックで前の質問に移動すること', () => {
      // まず2番目の質問に移動
      component.onNext();
      fixture.detectChanges();
      expect(component.displayIndex()).toBe(2);

      // 前に戻る
      const prevBtn = fixture.debugElement.query(By.css('button[aria-label="前の質問"]'));
      prevBtn.nativeElement.click();
      fixture.detectChanges();

      expect(component.displayIndex()).toBe(1);
    });

    test('次ボタンクリックで次の質問に移動すること', () => {
      expect(component.displayIndex()).toBe(1);

      const nextBtn = fixture.debugElement.query(By.css('button[aria-label="次の質問へ"]'));
      nextBtn.nativeElement.click();
      fixture.detectChanges();

      expect(component.displayIndex()).toBe(2);
    });

    test('onSkip()でスキップして次の質問に移動すること', () => {
      expect(component.displayIndex()).toBe(1);

      component.onSkip();
      fixture.detectChanges();

      expect(component.displayIndex()).toBe(2);
    });

    test('最後の質問でonAdvance()を呼ぶとsubmittedイベントが発火すること', () => {
      const emitted: Answer[][] = [];
      component.submitted.subscribe((data) => emitted.push(data));

      // 最後の質問まで移動
      component.onNext();
      component.onNext();
      fixture.detectChanges();
      expect(component.isLastQuestion()).toBe(true);

      // 送信
      component.onAdvance();

      expect(emitted.length).toBe(1);
      expect(emitted[0].length).toBe(3);
    });
  });

  describe('選択肢操作', () => {
    test('selectOption()で単一選択ができること', () => {
      component.selectOption(1);
      expect(component.selectedIndex()).toBe(1);
      expect(component.isOptionSelected(1)).toBe(true);
      expect(component.isOptionSelected(0)).toBe(false);
    });

    test('同じオプションを再クリックで選択解除されること', () => {
      component.selectOption(1);
      expect(component.selectedIndex()).toBe(1);

      component.selectOption(1);
      expect(component.selectedIndex()).toBe(null);
    });

    test('2番目の質問(multi)でtoggleSelectAll()が動作すること', () => {
      // 2番目の質問に移動（multi: true）
      component.onNext();
      fixture.detectChanges();
      expect(component.isMulti()).toBe(true);

      component.toggleSelectAll();
      expect(component.isAllSelected()).toBe(true);
      expect(component.selectedIndices()).toEqual([0, 1, 2]);

      component.toggleSelectAll();
      expect(component.isAllSelected()).toBe(false);
      expect(component.selectedIndices()).toEqual([]);
    });

    test('onOtherFocus()で単一選択モードのとき他のオプションが解除されること', () => {
      component.selectOption(1);
      expect(component.selectedIndex()).toBe(1);

      component.onOtherFocus();
      expect(component.selectedIndex()).toBe(null);
    });
  });

  describe('ページナビゲーション', () => {
    test('3つの質問を順番にナビゲートできること', () => {
      // 1ページ目
      expect(component.displayIndex()).toBe(1);
      expect(component.currentQuestion().text).toBe('質問のテキストテキストがここの部分に入ります');
      expect(component.isMulti()).toBe(false);
      expect(component.isLastQuestion()).toBe(false);

      // 2ページ目へ
      component.onNext();
      fixture.detectChanges();
      expect(component.displayIndex()).toBe(2);
      expect(component.currentQuestion().text).toBe(
        '2番目の質問テキストがここに入ります（複数選択）',
      );
      expect(component.isMulti()).toBe(true);
      expect(component.isLastQuestion()).toBe(false);

      // 3ページ目へ
      component.onNext();
      fixture.detectChanges();
      expect(component.displayIndex()).toBe(3);
      expect(component.currentQuestion().text).toBe('最後の質問テキストがここに入ります');
      expect(component.isMulti()).toBe(false);
      expect(component.isLastQuestion()).toBe(true);
    });

    test('各質問の回答が保持されること', () => {
      // 1ページ目で選択
      component.selectOption(0);
      expect(component.selectedIndex()).toBe(0);

      // 2ページ目へ
      component.onNext();
      fixture.detectChanges();

      // 2ページ目で複数選択
      component.selectOption(1);
      component.selectOption(2);
      expect(component.selectedIndices()).toEqual([1, 2]);

      // 1ページ目に戻る
      component.onPrev();
      fixture.detectChanges();

      // 1ページ目の選択が保持されている
      expect(component.selectedIndex()).toBe(0);

      // 2ページ目に戻る
      component.onNext();
      fixture.detectChanges();

      // 2ページ目の選択が保持されている
      expect(component.selectedIndices()).toEqual([1, 2]);
    });

    test('onPrevが最初の質問では何もしないこと', () => {
      expect(component.displayIndex()).toBe(1);
      component.onPrev();
      expect(component.displayIndex()).toBe(1);
    });

    test('onNextが最後の質問では何もしないこと', () => {
      component.onNext();
      component.onNext();
      fixture.detectChanges();
      expect(component.isLastQuestion()).toBe(true);
      const before = component.displayIndex();
      component.onNext();
      expect(component.displayIndex()).toBe(before);
    });
  });

  describe('その他入力', () => {
    test('onOtherFocusで単一選択の場合otherTextにスペースマーカーが設定されること', () => {
      component.onOtherFocus();
      expect(component.otherText()).toBe(' ');
    });

    test('onOtherFocusで複数選択の場合otherTextにスペースマーカーが設定されること', () => {
      // 2番目の質問（multi: true）へ移動
      component.onNext();
      fixture.detectChanges();
      expect(component.isMulti()).toBe(true);

      component.onOtherFocus();
      expect(component.otherText()).toBe(' ');
    });

    test('onOtherInputで単一選択の場合otherTextが更新されること', () => {
      const event = { target: { value: 'テスト入力' } } as unknown as Event;
      component.onOtherInput(event);
      expect(component.otherText()).toBe('テスト入力');
      expect(component.selectedIndex()).toBeNull();
    });

    test('onOtherInputで複数選択の場合otherTextが更新されること', () => {
      component.onNext();
      fixture.detectChanges();

      const event = { target: { value: 'テスト入力' } } as unknown as Event;
      component.onOtherInput(event);
      expect(component.otherText()).toBe('テスト入力');
    });

    test('onOtherInputで複数選択の場合空文字はスペースマーカーになること', () => {
      component.onNext();
      fixture.detectChanges();

      const event = { target: { value: '' } } as unknown as Event;
      component.onOtherInput(event);
      expect(component.otherText()).toBe(' ');
    });

    test('isOtherSelectedがotherTextあり・selectedIndexなしでtrueになること', () => {
      const event = { target: { value: 'テキスト' } } as unknown as Event;
      component.onOtherInput(event);
      expect(component.isOtherSelected()).toBe(true);
    });

    test('isOtherSelectedが単一選択のとき選択肢を選ぶとfalseになること', () => {
      component.selectOption(0);
      expect(component.isOtherSelected()).toBe(false);
    });
  });

  describe('複数選択その他チェックボックス', () => {
    beforeEach(() => {
      // 2番目の質問（multi: true）へ移動
      component.onNext();
      fixture.detectChanges();
    });

    test('toggleOtherCheckboxでotherTextがトグルされること', () => {
      component.toggleOtherCheckbox();
      expect(component.otherText()).toBe(' ');

      component.toggleOtherCheckbox();
      expect(component.otherText()).toBe('');
    });

    test('toggleOtherCheckboxで実テキストがある場合クリアされること', () => {
      const event = { target: { value: '入力済みテキスト' } } as unknown as Event;
      component.onOtherInput(event);
      expect(component.otherText()).toBe('入力済みテキスト');

      component.toggleOtherCheckbox();
      expect(component.otherText()).toBe('');
    });

    test('isOtherCheckedInMultiがotherTextある場合trueを返すこと', () => {
      component.toggleOtherCheckbox();
      expect(component.isOtherCheckedInMulti()).toBe(true);
    });

    test('isOtherCheckedInMultiがotherTextない場合falseを返すこと', () => {
      expect(component.isOtherCheckedInMulti()).toBe(false);
    });

    test('getOtherDisplayValueがスペースマーカーのとき空文字を返すこと', () => {
      component.toggleOtherCheckbox(); // sets ' '
      expect(component.getOtherDisplayValue()).toBe('');
    });

    test('getOtherDisplayValueが実テキストのときそのまま返すこと', () => {
      const event = { target: { value: '入力テキスト' } } as unknown as Event;
      component.onOtherInput(event);
      expect(component.getOtherDisplayValue()).toBe('入力テキスト');
    });
  });

  describe('DOM要素表示（追加）', () => {
    test('単一選択モードで「すべて選択」ボタンが表示されないこと', () => {
      const allBtns = fixture.debugElement.queryAll(By.css('#assist-options button'));
      const allSelectBtn = allBtns.find((b) => b.nativeElement.textContent.includes('すべて選択'));
      expect(allSelectBtn).toBeUndefined();
    });

    test('2番目の質問（multi）で「すべて選択」ボタンが表示されること', () => {
      component.onNext();
      fixture.detectChanges();

      const allBtns = fixture.debugElement.queryAll(By.css('#assist-options button'));
      const allSelectBtn = allBtns.find((b) => b.nativeElement.textContent.includes('すべて選択'));
      expect(allSelectBtn).toBeDefined();
    });

    test('単一選択モードで選択肢数が正しく表示されること', () => {
      const optionBtns = fixture.debugElement.queryAll(
        By.css('#assist-options button[role="option"]'),
      );
      expect(optionBtns.length).toBe(3);
    });

    test('その他を入力フィールドが表示されること', () => {
      const otherInput = fixture.debugElement.query(By.css('input[placeholder="その他を入力"]'));
      expect(otherInput).toBeTruthy();
    });

    test('最後の質問以外では「次へ」が表示されること', () => {
      const advanceBtns = fixture.debugElement.queryAll(By.css('app-button'));
      const lastBtn = advanceBtns[advanceBtns.length - 1];
      expect(lastBtn.nativeElement.textContent.trim()).toContain('次へ');
    });

    test('最後の質問では「送信」が表示されること', () => {
      component.onNext();
      component.onNext();
      fixture.detectChanges();

      const advanceBtns = fixture.debugElement.queryAll(By.css('app-button'));
      const lastBtn = advanceBtns[advanceBtns.length - 1];
      expect(lastBtn.nativeElement.textContent.trim()).toContain('送信');
    });
  });

  describe('selectOptionのDOMイベント', () => {
    test('選択肢ボタンクリックで単一選択が変わること', () => {
      const optionBtns = fixture.debugElement.queryAll(
        By.css('#assist-options button[role="option"]'),
      );
      optionBtns[1].nativeElement.click();
      expect(component.selectedIndex()).toBe(1);
    });

    test('すべて選択ボタンクリックで全選択されること', () => {
      component.onNext();
      fixture.detectChanges();

      const allBtns = fixture.debugElement.queryAll(By.css('#assist-options button'));
      const allSelectBtn = allBtns.find((b) => b.nativeElement.textContent.includes('すべて選択'));
      allSelectBtn!.nativeElement.click();

      expect(component.isAllSelected()).toBe(true);
    });
  });
});
