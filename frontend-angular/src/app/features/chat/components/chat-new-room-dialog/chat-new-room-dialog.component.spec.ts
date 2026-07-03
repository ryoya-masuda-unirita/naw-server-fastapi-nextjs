import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import {
  ChatNewRoomDialogComponent,
  ChatNewRoomDialogActionBridge,
} from './chat-new-room-dialog.component';
import { AssistantsService } from '../../services/assistants.service';
import { FakeTranslatePipe } from 'src/testing/fake-translate.pipe';
import { SkeletonBlockComponent } from '@shared/components/skeleton/skeleton-block.component';

const mockAssistants = [
  {
    id: 'asst-001',
    name: 'A1',
    description: 'desc1',
    category: 'cat1',
    model: 'm1',
    isDefault: true,
  },
  { id: 'asst-002', name: 'A2', description: 'desc2', category: 'cat2', model: 'm2' },
];

const mockAssistantsService = {
  assistantsQuery: {
    data: signal(mockAssistants),
    isPending: signal(false),
  },
};

const selectedAssistantId = signal<string | null>(null);
const mockActionBridge: ChatNewRoomDialogActionBridge = {
  runCancel: vi.fn(),
  runCreate: vi.fn(),
  selectedAssistantId,
};

describe('ChatNewRoomDialogComponent', () => {
  let fixture: ComponentFixture<ChatNewRoomDialogComponent>;
  let component: ChatNewRoomDialogComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        ChatNewRoomDialogComponent,
        NoopAnimationsModule,
        SkeletonBlockComponent,
        FakeTranslatePipe,
      ],
      providers: [{ provide: AssistantsService, useValue: mockAssistantsService }],
    })
      .overrideComponent(ChatNewRoomDialogComponent, {
        set: { imports: [SkeletonBlockComponent, FakeTranslatePipe] },
      })
      .compileComponents();
    fixture = TestBed.createComponent(ChatNewRoomDialogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('actionBridge', mockActionBridge);
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('assistants, isAssistantsLoadingが正しく取得できること', () => {
      expect(component.assistants()).toEqual(mockAssistants);
      expect(component.isAssistantsLoading()).toBe(false);
    });
  });

  describe('DOM要素表示', () => {
    test('アシスタントリストが正しく表示されること', () => {
      const buttons = fixture.debugElement.queryAll(By.css('button[role=option]'));
      expect(buttons.length).toBe(mockAssistants.length);
      expect(buttons[0].nativeElement.textContent).toContain('A1');
      expect(buttons[1].nativeElement.textContent).toContain('A2');
    });
    test('ローディング時にSkeletonBlockが表示されること', () => {
      mockAssistantsService.assistantsQuery.isPending.set(true);
      fixture.detectChanges();
      const skeleton = fixture.debugElement.query(By.directive(SkeletonBlockComponent));
      expect(skeleton).toBeTruthy();
      mockAssistantsService.assistantsQuery.isPending.set(false);
      fixture.detectChanges();
    });
  });

  describe('DOM要素イベント', () => {
    test('アシスタント選択ボタンをクリックするとselectedAssistantIdが更新されること', () => {
      const buttons = fixture.debugElement.queryAll(By.css('button[role=option]'));
      buttons[1].nativeElement.click();
      fixture.detectChanges();
      expect(selectedAssistantId()).toBe('asst-002');
    });
  });
});
