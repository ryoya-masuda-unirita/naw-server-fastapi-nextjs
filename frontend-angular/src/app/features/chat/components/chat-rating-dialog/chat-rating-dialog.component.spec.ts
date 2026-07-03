import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import {
  ChatRatingDialogComponent,
  ChatRatingDialogActionBridge,
} from './chat-rating-dialog.component';
import { FakeTranslatePipe } from 'src/testing/fake-translate.pipe';
import { FormRadioComponent } from '@shared/components/form/form-radio/form-radio.component';

const mockActionBridge: ChatRatingDialogActionBridge = {
  runCancel: vi.fn(),
  runSubmit: vi.fn(),
  selectedRating: signal<number | null>(null),
  isLoading: signal(false),
};

describe('ChatRatingDialogComponent', () => {
  let fixture: ComponentFixture<ChatRatingDialogComponent>;
  let component: ChatRatingDialogComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatRatingDialogComponent, NoopAnimationsModule],
      providers: [],
    })
      .overrideComponent(ChatRatingDialogComponent, {
        set: { imports: [FakeTranslatePipe, FormRadioComponent] },
      })
      .compileComponents();
    fixture = TestBed.createComponent(ChatRatingDialogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('actionBridge', mockActionBridge);
    fixture.componentRef.setInput('initialRating', 3);
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('初期値が正しくセットされること', () => {
      expect(component.selectedRating()).toBe(3);
      expect(mockActionBridge.selectedRating()).toBe(3);
    });

    test('ratingOptions配列が5件であること', () => {
      expect(component.ratingOptions.length).toBe(5);
    });
  });

  describe('DOM要素表示', () => {
    test('app-form-radioが1つ表示されること', () => {
      const radio = fixture.debugElement.query(By.directive(FormRadioComponent));
      expect(radio).toBeTruthy();
    });

    test('app-form-radioにratingOptionsが渡されること', () => {
      const radio = fixture.debugElement.query(By.directive(FormRadioComponent));
      expect(radio.componentInstance.options()).toEqual(component.ratingOptions);
    });
  });

  describe('DOM要素イベント', () => {
    test('valueChangeイベントでselectedRatingが更新されること', () => {
      const radio = fixture.debugElement.query(By.directive(FormRadioComponent));
      radio.triggerEventHandler('valueChange', 4);
      fixture.detectChanges();
      expect(component.selectedRating()).toBe(4);
      expect(mockActionBridge.selectedRating()).toBe(4);
    });

    test('selectRating()でselectedRatingが設定されること', () => {
      component.selectRating(2);
      expect(component.selectedRating()).toBe(2);
      expect(mockActionBridge.selectedRating()).toBe(2);
    });
  });
});
