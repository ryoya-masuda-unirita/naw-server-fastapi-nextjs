import { Component, input, output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import {
  ChatRenameDialogComponent,
  ChatRenameDialogActionBridge,
} from './chat-rename-dialog.component';
import { FakeTranslatePipe } from 'src/testing/fake-translate.pipe';

@Component({
  selector: 'app-form-input',
  standalone: true,
  template: '',
})
class FormInputStub {
  readonly label = input.required<string>();
  readonly placeholder = input<string>('');
  readonly value = input<string>('');
  readonly valueChange = output<string>();
}

const mockActionBridge: ChatRenameDialogActionBridge = {
  runCancel: vi.fn(),
  runSave: vi.fn(),
  name: signal('初期名'),
  isLoading: signal(false),
};

describe('ChatRenameDialogComponent', () => {
  let fixture: ComponentFixture<ChatRenameDialogComponent>;
  let component: ChatRenameDialogComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatRenameDialogComponent, NoopAnimationsModule],
    })
      .overrideComponent(ChatRenameDialogComponent, {
        set: { imports: [FakeTranslatePipe, FormInputStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ChatRenameDialogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('actionBridge', mockActionBridge);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockActionBridge.name.set('初期名');
  });

  describe('初期値・ゲッター', () => {
    test('nameシグナルが初期値であること', () => {
      expect(mockActionBridge.name()).toBe('初期名');
    });

    test('isLoadingシグナルが初期値falseであること', () => {
      expect(mockActionBridge.isLoading()).toBe(false);
    });

    test('actionBridgeが設定されていること', () => {
      expect(component.actionBridge()).toBe(mockActionBridge);
    });
  });

  describe('DOM要素表示', () => {
    test('app-form-inputが表示されること', () => {
      const formInput = fixture.debugElement.query(By.css('app-form-input'));
      expect(formInput).toBeTruthy();
    });

    test('app-form-inputにvalue入力が渡されること', () => {
      const formInput = fixture.debugElement.query(By.css('app-form-input'));
      expect(formInput.componentInstance.value()).toBe('初期名');
    });

    test('app-form-inputにlabel入力が渡されること', () => {
      const formInput = fixture.debugElement.query(By.css('app-form-input'));
      expect(formInput.componentInstance.label()).toBe('CHAT.WINDOW.RENAME_NAME_LABEL');
    });

    test('app-form-inputにplaceholder入力が渡されること', () => {
      const formInput = fixture.debugElement.query(By.css('app-form-input'));
      expect(formInput.componentInstance.placeholder()).toBe('CHAT.WINDOW.RENAME_NAME_PLACEHOLDER');
    });
  });

  describe('DOM要素イベント', () => {
    test('valueChangeイベントでnameシグナルが更新されること', () => {
      const formInput = fixture.debugElement.query(By.css('app-form-input'));
      formInput.triggerEventHandler('valueChange', '新しい名前');
      fixture.detectChanges();
      expect(mockActionBridge.name()).toBe('新しい名前');
    });

    test('nameシグナルを変更するとapp-form-inputのvalueに反映されること', () => {
      mockActionBridge.name.set('更新された名前');
      fixture.detectChanges();
      const formInput = fixture.debugElement.query(By.css('app-form-input'));
      expect(formInput.componentInstance.value()).toBe('更新された名前');
    });
  });
});
