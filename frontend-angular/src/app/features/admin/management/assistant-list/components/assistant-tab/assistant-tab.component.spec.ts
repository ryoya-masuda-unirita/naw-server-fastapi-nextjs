import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, input, output, Pipe, PipeTransform, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { AssistantApiItem } from '@app-types/admin/assistant.types';
import { ToastService } from '@core/services/toast.service';
import { TranslateService } from '@ngx-translate/core';
import { AssistantListApiService } from '../../services/assistant-list-api.service';
import { AssistantListStore } from '../../stores/assistant-list.store';
import { AssistantTabComponent } from './assistant-tab.component';

@Pipe({ name: 'translate', standalone: true })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
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
  heightPx = input<number>();
  fullWidth = input<boolean>();
  iconPosition = input<string>();
  buttonClick = output<void>();
}

@Component({ selector: 'app-pagination', standalone: true, template: '' })
class PaginationStub {
  showPageSize = input<boolean>();
  showPageNumbers = input<boolean>();
  countDisplay = input<string>();
  totalPages = input<number>();
  currentPageOverride = input<number>();
  useQueryParams = input<boolean>();
  showFirstLast = input<boolean>();
  pageChange = output<number>();
}

@Component({ selector: 'app-select', standalone: true, template: '' })
class SelectStub {
  placeholder = input<string>();
  options = input<any[]>();
  value = input<any>();
  size = input<string>();
  valueChange = output<any>();
}

@Component({ selector: 'app-form-sort-input', standalone: true, template: '' })
class FormSortInputStub {
  size = input<string>();
  fields = input<any[]>();
  selectedField = input<string>();
  selectedOrder = input<string>();
  placeholder = input<string>();
  fieldChange = output<string | null>();
  orderChange = output<string>();
}

@Component({ selector: 'app-search-input', standalone: true, template: '' })
class SearchInputStub {
  size = input<string>();
  value = input<string>();
  placeholder = input<string>();
  valueChange = output<string>();
}

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {
  name = input<string>();
}

@Component({ selector: 'app-assistant-tab-menu', standalone: true, template: '' })
class AssistantTabMenuStub {
  item = input<any>();
  editAssistant = output<any>();
  deleteAssistant = output<any>();
}

@Component({
  selector: 'app-table-list',
  standalone: true,
  template: '<div><ng-content></ng-content></div>',
})
class TableListStub {}

@Component({
  selector: 'app-table-list-item',
  standalone: true,
  template: '<div (click)="checkedChange.emit(!checked())"><ng-content></ng-content></div>',
})
class TableListItemStub {
  isHeader = input<boolean>();
  showCheckbox = input<boolean>();
  checked = input<boolean>();
  indeterminate = input<boolean>();
  checkedChange = output<boolean>();
}

@Component({ selector: 'app-assistant-add-dialog', standalone: true, template: '' })
class AssistantAddDialogStub {
  formGroup = input<FormGroup>();
}

@Component({ selector: 'app-assistant-edit-dialog', standalone: true, template: '' })
class AssistantEditDialogStub {
  formGroup = input<FormGroup>();
  assistantId = input<string>();
}

describe('AssistantTabComponent', () => {
  let component: AssistantTabComponent;
  let fixture: ComponentFixture<AssistantTabComponent>;

  const mockItems = signal<AssistantApiItem[]>([
    {
      id: '1',
      name: 'Asst 1',
      description: 'Desc 1',
      type: 'SAAS_CHAT',
      includeHistory: true,
      iconColor: '#000000',
      groups: ['g1'],
      category: { id: 'cat1', name: 'Cat 1', description: '' },
      categories: [{ id: 'cat1', name: 'Cat 1', description: '' }],
      endpoints: [{ id: 'api1', label: 'API 1', model: 'm1', url: '', type: 'AZURE_OPENAI_CHAT' }],
    },
  ]);

  const mockStore = {
    items: mockItems,
    totalItems: signal(1),
    isLoading: signal(false),
    filter: signal({ pageIndex: 0, sortField: 'updatedAt', sortOrder: 'desc' }),
    totalPages: signal(1),
    countDisplay: signal('1-1件 / 1件'),
    serverOptions: signal([{ value: 'SAAS_CHAT', label: 'Type 1' }]),
    categoriesOptions: signal([{ value: 'cat1', label: 'Cat 1' }]),
    groupOptions: signal([{ value: 'g1', label: 'Group 1' }]),
    dictionaryOptions: signal([{ value: 'd1', label: 'Dict 1' }]),
    modelOptions: signal({}),
    serverApiOptions: signal<Record<string, { value: string; label: string }[]>>({
      SAAS_CHAT: [{ value: 'api1', label: 'API 1' }],
    }),
    folderOptions: signal([]),
    loadItems: vi.fn(),
    loadOptions: vi.fn(),
    updateFilter: vi.fn(),
    addOne: vi.fn(),
    updateOne: vi.fn(),
    removeMany: vi.fn(),
  };

  const mockTranslate = {
    instant: vi.fn((key: string) => key),
  };

  const mockRef = {
    close: vi.fn(),
    componentInstance: { data: { confirmAction: null as any } },
  };

  const mockDialog = {
    open: vi.fn().mockReturnValue(mockRef),
  };

  const mockApi = {
    create: vi.fn(),
    update: vi.fn(),
    deleteOne: vi.fn(),
    list: vi.fn(),
  };

  const mockToast = {
    success: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssistantTabComponent, ReactiveFormsModule, CommonModule],
      providers: [
        { provide: AssistantListStore, useValue: mockStore },
        { provide: TranslateService, useValue: mockTranslate },
        { provide: MatDialog, useValue: mockDialog },
        { provide: AssistantListApiService, useValue: mockApi },
        { provide: ToastService, useValue: mockToast },
      ],
    })
      .overrideComponent(AssistantTabComponent, {
        set: {
          imports: [
            CommonModule,
            FakeTranslatePipe,
            ButtonStub,
            PaginationStub,
            SelectStub,
            FormSortInputStub,
            SearchInputStub,
            SvgIconStub,
            AssistantTabMenuStub,
            TableListStub,
            TableListItemStub,
            AssistantAddDialogStub,
            AssistantEditDialogStub,
            ReactiveFormsModule,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AssistantTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllMocks();
    component.selectedAssistants.set([]);
    mockStore.serverApiOptions.set({
      SAAS_CHAT: [{ value: 'api1', label: 'API 1' }],
    });
    mockItems.set([
      {
        id: '1',
        name: 'Asst 1',
        description: 'Desc 1',
        type: 'SAAS_CHAT',
        includeHistory: true,
        iconColor: '#000000',
        groups: ['g1'],
        category: { id: 'cat1', name: 'Cat 1', description: '' },
        categories: [{ id: 'cat1', name: 'Cat 1', description: '' }],
        endpoints: [
          { id: 'api1', label: 'API 1', model: 'm1', url: '', type: 'AZURE_OPENAI_CHAT' },
        ],
      },
    ]);
  });

  describe('初期値・ゲッター', () => {
    test('初期化時に store.loadItems が呼ばれること', () => {
      expect(mockStore.loadItems).toHaveBeenCalled();
    });

    test('全選択の状態が正しく計算されること', () => {
      expect(component.allSelected()).toBe(false);
      component.selectedAssistants.set([...mockItems()]);
      expect(component.allSelected()).toBe(true);
    });
  });

  describe('DOM要素表示', () => {
    test('データがある場合、テーブル行が表示されること', () => {
      const rows = fixture.debugElement.queryAll(By.directive(TableListItemStub));
      // 1 header + 1 data = 2
      expect(rows.length).toBe(2);
    });

    test('データが空の場合、NO_DATA メッセージが表示されること', () => {
      mockItems.set([]);
      fixture.detectChanges();
      const noData = fixture.debugElement.query(By.css('.text-center'));
      expect(noData.nativeElement.textContent).toContain('ADMIN.ASSISTANT.ASSISTANT_NO_DATA');
    });
  });

  describe('DOM要素イベント', () => {
    test('検索入力時に、300ms後にsearch条件が更新され1ページ目に戻ること', async () => {
      vi.useFakeTimers();
      const searchInput = fixture.debugElement.query(
        By.directive(SearchInputStub),
      ).componentInstance;
      searchInput.valueChange.emit('test query');
      vi.advanceTimersByTime(300);
      expect(mockStore.updateFilter).toHaveBeenCalledWith({
        search: 'test query',
        pageIndex: 0,
      });
      vi.useRealTimers();
    });

    test('接続サーバーフィルター変更時に、絞り込み条件が更新され1ページ目に戻ること', () => {
      const selects = fixture.debugElement.queryAll(By.directive(SelectStub));
      selects[0].componentInstance.valueChange.emit('server1');
      expect(mockStore.updateFilter).toHaveBeenCalledWith({
        filterServer: 'server1',
        pageIndex: 0,
      });
    });

    test('カテゴリ・所属チームのフィルター変更・解除時に、絞り込み条件が更新され1ページ目に戻ること', () => {
      const selects = fixture.debugElement.queryAll(By.directive(SelectStub));

      selects[1].componentInstance.valueChange.emit('cat1');
      expect(mockStore.updateFilter).toHaveBeenCalledWith({
        filterCategory: 'cat1',
        pageIndex: 0,
      });

      selects[2].componentInstance.valueChange.emit('NONE');
      expect(mockStore.updateFilter).toHaveBeenCalledWith({
        filterTeam: 'NONE',
        pageIndex: 0,
      });

      selects[1].componentInstance.valueChange.emit(null);
      expect(mockStore.updateFilter).toHaveBeenCalledWith({
        filterCategory: null,
        pageIndex: 0,
      });
    });

    test('並べ替え変更時に、ソート条件が更新され一覧が再取得されること', () => {
      const sortInput = fixture.debugElement.query(
        By.directive(FormSortInputStub),
      ).componentInstance;
      sortInput.fieldChange.emit('name');
      expect(mockStore.updateFilter).toHaveBeenCalledWith({ sortField: 'name', sortOrder: 'desc' });
    });
  });

  describe('アクション', () => {
    test('アシスタント作成が成功すること', async () => {
      mockApi.create.mockResolvedValue({ id: '2', name: 'New Asst' });

      component.onAddAssistant();
      component.addForm.patchValue({
        name: 'New Asst',
        serverType: 'SAAS_CHAT',
        serverApi: 'api1',
        model: 'm1',
        categories: ['cat1'],
      });

      await mockRef.componentInstance.data.confirmAction();

      expect(mockApi.create).toHaveBeenCalled();
      expect(mockStore.loadItems).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalled();
      expect(mockRef.close).toHaveBeenCalled();
    });

    test('カテゴリ未選択でもアシスタント作成が成功すること', async () => {
      mockApi.create.mockResolvedValue({ id: '2', name: 'New Asst' });

      component.onAddAssistant();
      component.addForm.patchValue({
        name: 'New Asst',
        serverType: 'SAAS_CHAT',
        serverApi: 'api1',
        model: 'm1',
        categories: [],
      });

      await mockRef.componentInstance.data.confirmAction();

      expect(mockApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Asst',
          categoryIds: [],
        }),
      );
    });

    test('アシスタント作成時にフォーム値をAPIサーバ向けpayloadへ変換すること', async () => {
      mockApi.create.mockResolvedValue({ id: '2', name: 'New Asst' });

      component.onAddAssistant();
      component.addForm.patchValue({
        name: 'New Asst',
        description: 'Desc',
        serverType: 'SAAS_RAG',
        serverApi: 'api1',
        model: 'm1',
        categories: ['cat1', 'cat2'],
        groups: ['NONE', 'g1'],
        folder: 'idx-global',
        includeHistory: true,
        iconColor: '#123456',
      });

      await mockRef.componentInstance.data.confirmAction();

      expect(mockApi.create).toHaveBeenCalledWith({
        type: 'SAAS_RAG',
        name: 'New Asst',
        description: 'Desc',
        includeHistory: true,
        iconColor: '#123456',
        groups: ['g1'],
        categoryIds: ['cat1', 'cat2'],
        indexId: 'idx-global',
        endpoints: [{ id: 'api1', model: 'm1', url: '' }],
      });
    });

    test('アシスタント作成が失敗した場合はエラートーストを表示しダイアログを閉じないこと', async () => {
      mockApi.create.mockRejectedValue(new Error('create failed'));

      component.onAddAssistant();
      component.addForm.patchValue({
        name: 'New Asst',
        serverType: 'SAAS_CHAT',
        serverApi: 'api1',
        model: 'm1',
        categories: ['cat1'],
      });

      await mockRef.componentInstance.data.confirmAction();

      expect(mockToast.error).toHaveBeenCalledWith('TEMPLATES.CREATE_FAILED');
      expect(mockRef.close).not.toHaveBeenCalled();
    });

    test('アシスタント編集が成功すること', async () => {
      mockApi.update.mockResolvedValue({ id: '1', name: 'Updated Asst' });

      component.onEditAssistant(mockItems()[0]);
      component.editForm.patchValue({ name: 'Updated Asst' });

      await mockRef.componentInstance.data.confirmAction();

      expect(mockApi.update).toHaveBeenCalled();
      expect(mockStore.loadItems).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalled();
      expect(mockRef.close).toHaveBeenCalled();
    });

    test('編集ダイアログ初期表示で既存値をフォームに復元すること', () => {
      mockStore.serverApiOptions.set({
        SAAS_RAG: [{ value: 'api-rag', label: 'RAG API' }],
      });
      const assistant: AssistantApiItem = {
        id: 'rag-1',
        name: 'RAG Asst',
        description: 'RAG Desc',
        type: 'SAAS_RAG',
        includeHistory: false,
        iconColor: '#ABCDEF',
        groups: ['g1', 'g2'],
        category: { id: 'cat1', name: 'Cat 1', description: '' },
        categories: [
          { id: 'cat1', name: 'Cat 1', description: '' },
          { id: 'cat2', name: 'Cat 2', description: '' },
        ],
        endpoints: [
          { id: 'api-rag', label: 'RAG API', model: 'gpt-rag', url: '', type: 'AZURE_OPENAI_CHAT' },
        ],
        indexId: 'idx-global',
      };

      component.onEditAssistant(assistant);

      expect(component.editForm.getRawValue()).toMatchObject({
        id: 'rag-1',
        name: 'RAG Asst',
        description: 'RAG Desc',
        serverType: 'SAAS_RAG',
        serverApi: 'api-rag',
        model: 'gpt-rag',
        categories: ['cat1', 'cat2'],
        groups: ['g1', 'g2'],
        folder: 'idx-global',
      });
    });

    test('編集時に選択肢に存在しない接続APIは復元しないこと', () => {
      mockStore.serverApiOptions.set({
        SAAS_CHAT: [{ value: 'api-current', label: 'Current API' }],
      });
      const assistant: AssistantApiItem = {
        ...mockItems()[0],
        endpoints: [
          {
            id: 'api-missing',
            label: 'Missing API',
            model: 'm-missing',
            url: '',
            type: 'AZURE_OPENAI_CHAT',
          },
        ],
      };

      component.onEditAssistant(assistant);

      expect(component.editForm.getRawValue()).toMatchObject({
        serverApi: '',
        model: '',
      });
    });

    test('SAAS_RAGから別タイプへ編集する場合はindexId解除用の空文字を送信すること', async () => {
      mockStore.serverApiOptions.set({
        SAAS_RAG: [{ value: 'api-rag', label: 'RAG API' }],
        SAAS_CHAT: [{ value: 'api-chat', label: 'Chat API' }],
      });
      mockApi.update.mockResolvedValue({ id: 'rag-1', name: 'RAG Asst' });
      const assistant: AssistantApiItem = {
        id: 'rag-1',
        name: 'RAG Asst',
        description: 'RAG Desc',
        type: 'SAAS_RAG',
        includeHistory: true,
        iconColor: '#000000',
        groups: ['g1'],
        category: { id: 'cat1', name: 'Cat 1', description: '' },
        categories: [{ id: 'cat1', name: 'Cat 1', description: '' }],
        endpoints: [
          { id: 'api-rag', label: 'RAG API', model: 'gpt-rag', url: '', type: 'AZURE_OPENAI_CHAT' },
        ],
        indexId: 'idx-global',
      };

      component.onEditAssistant(assistant);
      component.editForm.patchValue({
        serverType: 'SAAS_CHAT',
        serverApi: 'api-chat',
        model: 'gpt-chat',
        folder: '',
      });

      await mockRef.componentInstance.data.confirmAction();

      expect(mockApi.update).toHaveBeenCalledWith(
        'rag-1',
        expect.objectContaining({
          type: 'SAAS_CHAT',
          indexId: '',
          endpoints: [{ id: 'api-chat', model: 'gpt-chat', url: '' }],
        }),
      );
    });

    test('カテゴリ未選択でもアシスタント編集が成功すること', async () => {
      mockApi.update.mockResolvedValue({ id: '1', name: 'Updated Asst' });

      component.onEditAssistant(mockItems()[0]);
      component.editForm.patchValue({ categories: [] });

      await mockRef.componentInstance.data.confirmAction();

      expect(mockApi.update).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({
          categoryIds: [],
        }),
      );
    });

    test('カテゴリが登録されていないアシスタントを編集して保存できること', async () => {
      const assistantWithNoCategories: AssistantApiItem = {
        ...mockItems()[0],
        categories: [],
        category: undefined as any,
      };
      mockApi.update.mockResolvedValue({ id: '1', name: 'Asst 1' });

      component.onEditAssistant(assistantWithNoCategories);

      await mockRef.componentInstance.data.confirmAction();

      expect(mockApi.update).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({
          categoryIds: [],
        }),
      );
    });

    test('アシスタント編集が失敗した場合はエラートーストを表示しダイアログを閉じないこと', async () => {
      mockApi.update.mockRejectedValue(new Error('update failed'));

      component.onEditAssistant(mockItems()[0]);

      await mockRef.componentInstance.data.confirmAction();

      expect(mockToast.error).toHaveBeenCalledWith('TEMPLATES.UPDATE_FAILED');
      expect(mockRef.close).not.toHaveBeenCalled();
    });

    test('アシスタント削除が成功すること', async () => {
      mockApi.deleteOne.mockResolvedValue({});

      component.onDeleteAssistant(mockItems()[0]);

      await mockRef.componentInstance.data.confirmAction();

      expect(mockApi.deleteOne).toHaveBeenCalledWith('1');
      expect(mockStore.removeMany).toHaveBeenCalledWith(['1']);
      expect(mockToast.success).toHaveBeenCalled();
      expect(mockRef.close).toHaveBeenCalled();
    });

    test('アシスタント削除が409エラーで失敗した場合はデフォルトアシスタント用のエラートーストを表示しダイアログを閉じないこと', async () => {
      mockApi.deleteOne.mockRejectedValue(
        new HttpErrorResponse({ status: 409, statusText: 'Conflict' }),
      );

      component.onDeleteAssistant(mockItems()[0]);

      await mockRef.componentInstance.data.confirmAction();

      expect(mockToast.error).toHaveBeenCalledWith(
        'ADMIN.ASSISTANT.DELETE_ASSISTANT_DEFAULT_CONFLICT',
      );
      expect(mockStore.removeMany).not.toHaveBeenCalled();
      expect(mockRef.close).not.toHaveBeenCalled();
    });

    test('アシスタント削除が409以外のエラーで失敗した場合は汎用のエラートーストを表示しダイアログを閉じないこと', async () => {
      mockApi.deleteOne.mockRejectedValue(
        new HttpErrorResponse({ status: 500, statusText: 'Internal Server Error' }),
      );

      component.onDeleteAssistant(mockItems()[0]);

      await mockRef.componentInstance.data.confirmAction();

      expect(mockToast.error).toHaveBeenCalledWith('ADMIN.ASSISTANT.DELETE_FAILED');
      expect(mockStore.removeMany).not.toHaveBeenCalled();
      expect(mockRef.close).not.toHaveBeenCalled();
    });

    test('アシスタント削除がHttpErrorResponse以外のエラーで失敗した場合も汎用のエラートーストを表示すること', async () => {
      mockApi.deleteOne.mockRejectedValue(new Error('unexpected failure'));

      component.onDeleteAssistant(mockItems()[0]);

      await mockRef.componentInstance.data.confirmAction();

      expect(mockToast.error).toHaveBeenCalledWith('ADMIN.ASSISTANT.DELETE_FAILED');
      expect(mockRef.close).not.toHaveBeenCalled();
    });
  });
});
