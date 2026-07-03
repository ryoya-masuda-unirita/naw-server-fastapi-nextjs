import { CommonModule } from '@angular/common';
import { Component, input, output, Pipe, PipeTransform, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { of } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import type { GetMessageFeedbackViewModel, FeedbackItem } from '@app-types/admin/feedback.types';
import { FeedbackMessageApiService } from '../../services/feedback-message-api.service';
import { FeedbackListOptionsService } from '../../services/feedback-list-options.service';
import { AssistantsService } from '@features/chat/services/assistants.service';
import { AccuracyTabComponent } from './accuracy-tab.component';

// ─── 翻訳パイプスタブ ─────────────────────────────────────────────────────────

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

// ─── 子コンポーネントスタブ ───────────────────────────────────────────────────

@Component({ selector: 'app-pagination', standalone: true, template: '' })
class PaginationStub {
  totalPages = input<number>();
  useQueryParams = input<boolean>();
  showPageSize = input<boolean>();
  showPageNumbers = input<boolean>();
  showFirstLast = input<boolean>();
  currentPageOverride = input<number>();
  countDisplay = input<string>();
  pageChange = output<number>();
}

@Component({ selector: 'app-select', standalone: true, template: '' })
class SelectStub {
  options = input<unknown[]>();
  value = input<string | null>();
  placeholder = input<string>();
  size = input<string>();
  valueChange = output<string | null>();
}

@Component({ selector: 'app-select-with-search', standalone: true, template: '' })
class SelectWithSearchStub {
  options = input<unknown[]>();
  value = input<string | null>();
  placeholder = input<string>();
  supportText = input<string>();
  size = input<string>();
  valueChange = output<string | null>();
}

@Component({ selector: 'app-table-list', standalone: true, template: '<ng-content></ng-content>' })
class TableListStub {
  sortable = input<boolean>();
  headerCheckbox = input<boolean>();
  checked = input<boolean>();
  indeterminate = input<boolean>();
  headerCheckboxChange = output<boolean>();
}

@Component({
  selector: 'app-table-list-item',
  standalone: true,
  template: '<ng-content></ng-content>',
})
class TableListItemStub {
  isHeader = input<boolean>();
  showCheckbox = input<boolean>();
  checked = input<boolean>();
  indeterminate = input<boolean>();
  hasActions = input<boolean>();
  checkedChange = output<boolean>();
  checkboxChange = output<boolean>();
}

@Component({ selector: 'app-form-sort-input', standalone: true, template: '' })
class FormSortInputStub {
  fields = input<unknown[]>();
  orders = input<unknown[]>();
  size = input<string>();
  selectedField = input<string | null>();
  selectedOrder = input<string | null>();
  fieldChange = output<string | null>();
  orderChange = output<string | null>();
}

@Component({
  selector: 'app-icon-button',
  standalone: true,
  template: '<button (click)="buttonClick.emit()"></button>',
})
class IconButtonStub {
  variant = input<string>();
  size = input<string>();
  ariaLabel = input<string>();
  buttonClick = output<void>();
}

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {
  name = input<string>();
}

@Component({
  selector: 'app-button',
  standalone: true,
  template: '<button (click)="buttonClick.emit()"><ng-content></ng-content></button>',
})
class ButtonStub {
  variant = input<string>();
  intent = input<string>();
  size = input<string>();
  classProps = input<string>();
  buttonClick = output<void>();
}

@Component({ selector: 'app-context-menu', standalone: true, template: '' })
class ContextMenuStub {
  items = input<unknown[]>();
  menuTpl = input<unknown>();
  panelClass = input<string>();
}

@Component({ selector: 'app-circular-loading', standalone: true, template: '' })
class CircularLoadingStub {}

// ─── フィクスチャデータ ───────────────────────────────────────────────────────

const FIXTURE_ACCURACY_RESPONSE: GetMessageFeedbackViewModel = {
  feedbacks: {
    content: [
      {
        id: 'fb-001',
        tenantId: 'tenant-001',
        userId: 'user-001',
        messageId: 'msg-001',
        message: {
          assistantId: 'assistant-001',
          content: { question: '質問テスト', answer: '回答テスト' },
        },
        rating: 'GOOD',
        indexId: undefined,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'fb-002',
        tenantId: 'tenant-001',
        userId: 'user-001',
        messageId: 'msg-002',
        message: {
          assistantId: 'assistant-001',
          content: { question: '質問2', answer: '回答2' },
        },
        rating: 'BAD',
        indexId: 'folder-001',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ],
    totalElements: 2,
    totalPages: 1,
    size: 5,
    number: 0,
    sort: { empty: true, sorted: false, unsorted: true },
    pageable: {
      offset: 0,
      paged: true,
      unpaged: false,
      pageNumber: 0,
      pageSize: 5,
      sort: { empty: true, sorted: false, unsorted: true },
    },
    first: true,
    last: true,
    numberOfElements: 2,
    empty: false,
  },
  assistantIdToServerMap: {},
};

// ─── テストユーティリティ ─────────────────────────────────────────────────────

const testQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ─── テスト ───────────────────────────────────────────────────────────────────

describe('AccuracyTabComponent', () => {
  let fixture: ComponentFixture<AccuracyTabComponent>;
  let component: AccuracyTabComponent;
  let mockFeedbackApiService: {
    fetchAccuracyFeedback: ReturnType<typeof vi.fn>;
    learningFoldersQuery: ReturnType<typeof vi.fn>;
    isAddingLearning: ReturnType<typeof signal<boolean>>;
    isAddingBulkLearning: ReturnType<typeof signal<boolean>>;
    addAdditionalLearning: ReturnType<typeof vi.fn>;
    addBulkAdditionalLearning: ReturnType<typeof vi.fn>;
  };
  let mockFolderOptionsService: {
    folders: ReturnType<typeof signal<unknown[]>>;
    folderOptions: ReturnType<typeof signal<unknown[]>>;
    assistantOptions: ReturnType<typeof signal<unknown[]>>;
    assistantNameMap: ReturnType<typeof signal<Map<string, string>>>;
  };
  let mockAssistantsService: {
    assistantsQuery: { data: ReturnType<typeof signal<unknown[]>> };
  };

  beforeEach(async () => {
    mockFeedbackApiService = {
      fetchAccuracyFeedback: vi.fn().mockResolvedValue(FIXTURE_ACCURACY_RESPONSE),
      learningFoldersQuery: vi.fn(),
      isAddingLearning: signal(false),
      isAddingBulkLearning: signal(false),
      addAdditionalLearning: vi.fn(),
      addBulkAdditionalLearning: vi.fn(),
    };

    mockFolderOptionsService = {
      folders: signal([{ id: 'folder-001', name: 'フォルダA' }]),
      folderOptions: signal([{ value: 'folder-001', label: 'フォルダA' }]),
      assistantOptions: signal([{ value: 'assistant-001', label: 'テストアシスタント' }]),
      assistantNameMap: signal(new Map([['assistant-001', 'テストアシスタント']])),
    };

    mockAssistantsService = {
      assistantsQuery: { data: signal([{ id: 'assistant-001', name: 'テストアシスタント' }]) },
    };

    await TestBed.configureTestingModule({
      imports: [AccuracyTabComponent, NoopAnimationsModule],
      providers: [
        provideTanStackQuery(testQueryClient()),
        { provide: FeedbackMessageApiService, useValue: mockFeedbackApiService },
        { provide: FeedbackListOptionsService, useValue: mockFolderOptionsService },
        { provide: AssistantsService, useValue: mockAssistantsService },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        {
          provide: TranslateService,
          useValue: {
            instant: vi.fn((key: string) => key),
            getCurrentLang: vi.fn(() => 'ja'),
            onLangChange: of({ lang: 'ja' }),
          },
        },
      ],
    })
      .overrideComponent(AccuracyTabComponent, {
        set: {
          imports: [
            CommonModule,
            FakeTranslatePipe,
            PaginationStub,
            SelectStub,
            SelectWithSearchStub,
            TableListStub,
            TableListItemStub,
            FormSortInputStub,
            IconButtonStub,
            SvgIconStub,
            ButtonStub,
            ContextMenuStub,
            CircularLoadingStub,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AccuracyTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await flushMicrotasks();
    fixture.detectChanges();
  });

  describe('初期表示', () => {
    test('初期状態でアシスタントが未選択であること', () => {
      expect(component.selectedAssistant()).toBeNull();
    });

    test('初期状態で1ページ目が表示されること', () => {
      expect(component.currentPage()).toBe(1);
    });

    test('初期状態で更新日時の降順ソートが設定されること', () => {
      expect(component.sortField()).toBe('updatedAt');
      expect(component.sortOrder()).toBe('desc');
      expect(mockFeedbackApiService.fetchAccuracyFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          sortField: 'updatedAt',
          sortOrder: 'desc',
          page: 0,
          size: 5,
        }),
      );
    });
  });

  describe('フィルター操作', () => {
    test('アシスタントフィルターを変更するとページが1にリセットされること', () => {
      component.onPageChange(3);
      component.onAssistantChange('assistant-001');
      expect(component.currentPage()).toBe(1);
    });

    test('評価フィルターを変更するとページが1にリセットされること', () => {
      component.onPageChange(2);
      component.onAccuracyChange('accurate');
      expect(component.currentPage()).toBe(1);
    });

    test('フォルダフィルターを変更するとページが1にリセットされること', () => {
      component.onPageChange(2);
      component.onFolderChange('folder-001');
      expect(component.currentPage()).toBe(1);
    });

    test('ソートフィールドを変更するとページが1にリセットされること', () => {
      component.onPageChange(2);
      component.onSortFieldChange('name');
      expect(component.currentPage()).toBe(1);
    });

    test('ソート順序を変更するとページが1にリセットされること', () => {
      component.onPageChange(2);
      component.onSortOrderChange('asc');
      expect(component.currentPage()).toBe(1);
    });
  });

  describe('ページ操作', () => {
    test('ページを変更できること', () => {
      component.onPageChange(2);
      expect(component.currentPage()).toBe(2);
    });
  });

  describe('選択操作', () => {
    test('全選択チェックボックスで全行が選択されること', async () => {
      await flushMicrotasks();
      fixture.detectChanges();
      component.toggleSelectAll(true);
      expect(component.isSelected('fb-001')).toBe(true);
      expect(component.isSelected('fb-002')).toBe(true);
    });

    test('アイテムの選択を解除できること', () => {
      component.toggleItem('fb-001', true);
      component.toggleItem('fb-001', false);
      expect(component.isSelected('fb-001')).toBe(false);
    });

    test('全選択解除で選択がなくなること', () => {
      component.toggleItem('fb-001', true);
      component.toggleItem('fb-002', true);
      component.onDeselectAll();
      expect(component.hasSelection()).toBe(false);
    });

    test('初期状態では何も選択されていないこと', () => {
      expect(component.hasSelection()).toBe(false);
    });
  });

  describe('追加学習', () => {
    const FIXTURE_ITEM: FeedbackItem = {
      id: 'fb-001',
      accuracy: 'accurate',
      assistantName: 'テストアシスタント',
      indexId: 'folder-001',
      learningFolder: 'フォルダA',
      questionSummary: '質問テスト',
      answerSummary: '回答テスト',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    test('個別追加学習モーダルを開けること', () => {
      const dialog = TestBed.inject(MatDialog);
      component.openFolderModal(FIXTURE_ITEM);
      expect(dialog.open).toHaveBeenCalled();
    });

    test('一括追加学習モーダルを開けること', () => {
      const dialog = TestBed.inject(MatDialog);
      component.openBulkFolderModal();
      expect(dialog.open).toHaveBeenCalled();
    });
  });

  describe('精度ラベル', () => {
    test('精度が高い場合に対応するラベルが表示されること', () => {
      expect(component.getAccuracyLabel('accurate')).toBeTruthy();
    });

    test('精度が低い場合に対応するラベルが表示されること', () => {
      expect(component.getAccuracyLabel('inaccurate')).toBeTruthy();
    });
  });
});
