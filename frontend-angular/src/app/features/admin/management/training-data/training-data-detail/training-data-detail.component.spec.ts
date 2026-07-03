import {
  Component,
  forwardRef,
  input,
  output,
  Pipe,
  PipeTransform,
  signal,
  TemplateRef,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { Subject, of } from 'rxjs';
import { TrainingDataDetailComponent } from './training-data-detail.component';
import { TrainingDataStore } from '../stores/training-data.store';
import { TrainingFolderModalService } from '../services/training-folder-modal.service';
import { UiStore } from '@core/stores/ui.store';
import { Location } from '@angular/common';
import { ReactiveFormsModule, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { TrainingDataApiItem } from '@app-types/training-data.types';
import { ROUTES } from '@core/constants/routes.config';

// --------------- Fake TranslatePipe ---------------
@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

// --------------- Mock Services ---------------
const mockTranslateService = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  onLangChange: new Subject().asObservable(),
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

const selectedItem = signal<TrainingDataApiItem | null>(null);
const isLoading = signal(false);

const mockStore = {
  loadDetail: vi.fn(),
  updateFolder: vi.fn().mockResolvedValue(undefined),
  deleteFolder: vi.fn(),
  selectedItem,
  isLoading,
};

const mockUiStore = {
  toggleMobileSidebar: vi.fn(),
};

const mockDialog = {
  open: vi.fn(),
  closeAll: vi.fn(),
};

const mockLocation = {
  back: vi.fn(),
};

const folderModalLoading = signal(false);
const folderModalHasNoEndpoints = signal(false);
const folderModalEndpointOptions = signal<{ value: string; label: string }[]>([
  { value: 'ep-local-1', label: 'Local Server 1' },
]);
const folderModalSelectedEndpointIds = signal<string[]>(['ep-local-1']);

const mockFolderModal = {
  isLoading: folderModalLoading,
  endpointOptions: folderModalEndpointOptions,
  hasNoEndpoints: folderModalHasNoEndpoints,
  selectedEndpointIds: folderModalSelectedEndpointIds,
  reset: vi.fn(),
  initializeGroups: vi.fn().mockResolvedValue(undefined),
  loadEndpointsForType: vi.fn().mockResolvedValue('ep-local-1'),
  getGroupIds: vi.fn(() => ['group-1']),
};

// --------------- Stubs ---------------
@Component({ selector: 'app-loading', standalone: true, template: '' })
class LoadingStub {
  readonly size = input<string>('md');
}

@Component({ selector: 'app-local-view', standalone: true, template: '' })
class LocalViewStub {
  readonly data = input.required<any>();
}

@Component({ selector: 'app-cloud-view', standalone: true, template: '' })
class CloudViewStub {
  readonly data = input.required<any>();
}

@Component({ selector: 'app-icon-button', standalone: true, template: '<ng-content />' })
class IconButtonStub {
  readonly variant = input<string>('solid');
  readonly size = input<string>('md');
  readonly link = input<string>('');
  readonly ariaLabel = input<string>('');
}

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {
  readonly name = input<string>('');
  readonly icon = input<boolean>(false);
}

@Component({ selector: 'app-context-menu', standalone: true, template: '' })
class ContextMenuStub {
  readonly menuTpl = input<TemplateRef<any>>();
  readonly customTrigger = input<TemplateRef<any>>();
  readonly panelClass = input<string>('');
  readonly menuMinWidth = input<string>('');
  close = vi.fn();
}

@Component({ selector: 'app-button', standalone: true, template: '<ng-content />' })
class ButtonStub {
  readonly variant = input<string>('solid');
  readonly size = input<string>('md');
  readonly fullWidth = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly buttonClick = output<void>();
}

@Component({
  selector: 'app-form-input',
  standalone: true,
  template: '',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FormInputStub), multi: true },
  ],
})
class FormInputStub implements ControlValueAccessor {
  readonly label = input<string>('');
  readonly error = input<string>('');
  writeValue(): void {
    // Empty
  }
  registerOnChange(): void {
    // Empty
  }
  registerOnTouched(): void {
    // Empty
  }
}

@Component({
  selector: 'app-form-textarea',
  standalone: true,
  template: '',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FormTextareaStub), multi: true },
  ],
})
class FormTextareaStub implements ControlValueAccessor {
  readonly label = input<string>('');
  readonly error = input<string>('');
  writeValue(): void {
    // Empty
  }
  registerOnChange(): void {
    // Empty
  }
  registerOnTouched(): void {
    // Empty
  }
}

@Component({
  selector: 'app-form-radio',
  standalone: true,
  template: '',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FormRadioStub), multi: true },
  ],
})
class FormRadioStub implements ControlValueAccessor {
  readonly label = input<string>('');
  readonly options = input<any[]>([]);
  readonly disabled = input<boolean>(false);
  writeValue(): void {
    // Empty
  }
  registerOnChange(): void {
    // Empty
  }
  registerOnTouched(): void {
    // Empty
  }
}

describe('TrainingDataDetailComponent', () => {
  let fixture: ComponentFixture<TrainingDataDetailComponent>;
  let component: TrainingDataDetailComponent;

  beforeEach(async () => {
    vi.clearAllMocks();
    selectedItem.set(null);
    isLoading.set(false);

    await TestBed.configureTestingModule({
      imports: [TrainingDataDetailComponent, NoopAnimationsModule],
      providers: [
        { provide: TrainingDataStore, useValue: mockStore },
        { provide: TrainingFolderModalService, useValue: mockFolderModal },
        { provide: UiStore, useValue: mockUiStore },
        { provide: MatDialog, useValue: mockDialog },
        { provide: TranslateService, useValue: mockTranslateService },
        { provide: Location, useValue: mockLocation },
      ],
    })
      .overrideComponent(TrainingDataDetailComponent, {
        set: {
          imports: [
            CommonModule,
            ReactiveFormsModule,
            FakeTranslatePipe,
            LoadingStub,
            LocalViewStub,
            CloudViewStub,
            IconButtonStub,
            SvgIconStub,
            ContextMenuStub,
            ButtonStub,
            FormInputStub,
            FormTextareaStub,
            FormRadioStub,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TrainingDataDetailComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('id', 'test-id');
    fixture.detectChanges();
  });

  describe('初期値・ゲッター', () => {
    test('ngOnInitでstore.loadDetailが呼ばれること', () => {
      expect(mockStore.loadDetail).toHaveBeenCalledWith('test-id');
    });

    test('itemがない場合にタイトルがデフォルトになること', () => {
      selectedItem.set(null);
      fixture.detectChanges();
      const title = fixture.debugElement.query(By.css('h1'));
      expect(title.nativeElement.textContent).toContain('LEARNING_DATA.DETAIL_TITLE');
    });

    test('itemがある場合にタイトルがフォルダ名になること', () => {
      selectedItem.set({ id: '1', name: 'Folder Name', type: 'CLOUD', files: [] } as any);
      fixture.detectChanges();
      const title = fixture.debugElement.query(By.css('h1'));
      expect(title.nativeElement.textContent).toContain('Folder Name');
    });
  });

  describe('DOM要素表示', () => {
    test('isLoadingがtrueのときLoadingStubが表示されること', () => {
      isLoading.set(true);
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.directive(LoadingStub))).toBeTruthy();
    });

    test('LOCALタイプの場合にLocalViewStubが表示されること', () => {
      selectedItem.set({ id: '1', name: 'Local', type: 'LOCAL', files: [] } as any);
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.directive(LocalViewStub))).toBeTruthy();
      expect(fixture.debugElement.query(By.directive(CloudViewStub))).toBeNull();
    });

    test('CLOUDタイプの場合にCloudViewStubが表示されること', () => {
      selectedItem.set({ id: '1', name: 'Cloud', type: 'CLOUD', files: [] } as any);
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.directive(CloudViewStub))).toBeTruthy();
      expect(fixture.debugElement.query(By.directive(LocalViewStub))).toBeNull();
    });

    test('データがない場合にNO_DATAメッセージが表示されること', () => {
      isLoading.set(false);
      selectedItem.set(null);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('COMMON.NO_DATA');
    });
  });

  describe('DOM要素イベント', () => {
    test('モバイル用メニューボタンクリックでuiStore.toggleMobileSidebarが呼ばれること', () => {
      const menuBtn = fixture.debugElement.query(By.css('.header-button-default'));
      menuBtn.triggerEventHandler('click', null);
      expect(mockUiStore.toggleMobileSidebar).toHaveBeenCalled();
    });

    test('戻るボタンクリックでlocation.backは呼ばれない(リンク遷移のため)', () => {
      // app-icon-button is a link in this case
      const backBtn = fixture.debugElement.query(By.directive(IconButtonStub));
      expect(backBtn.componentInstance.link()).toBe(ROUTES.APP.ADMIN_TRAINING_DATA);
    });

    test('goBackメソッドでlocation.backが呼ばれること', () => {
      component.goBack();
      expect(mockLocation.back).toHaveBeenCalled();
    });
  });

  describe('モーダル操作・バリデーション', () => {
    test('onRenameで編集モーダルが開くこと', () => {
      selectedItem.set({ id: '1', name: 'Folder', type: 'LOCAL', description: 'Desc' } as any);
      component.onRename();
      expect(mockDialog.open).toHaveBeenCalled();
      expect(component.editFolderForm.value.name).toBe('Folder');
    });

    test('バリデーションエラーが正しく返されること', () => {
      selectedItem.set({ id: '1', name: 'Folder', type: 'LOCAL' } as any);
      component.onRename();
      component.editFolderForm.get('name')?.setValue('');
      component.submitted.set(true);
      fixture.detectChanges();

      expect(component.isEditFolderValid()).toBe(false);
      expect(component.folderNameError()).toBe('VALIDATION.REQUIRED');
    });

    test('submitEditFolderでstore.updateFolderが呼ばれること', async () => {
      selectedItem.set({ id: '1', name: 'Folder', type: 'LOCAL' } as any);
      component.onRename();
      await fixture.whenStable();
      component.editFolderForm.patchValue({ name: 'Updated', endpointId: 'ep-local-1' });
      fixture.detectChanges();

      await component.submitEditFolder();
      expect(mockStore.updateFolder).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({
          name: 'Updated',
          endpointIds: ['ep-local-1'],
          groupIds: ['group-1'],
        }),
      );
      expect(mockDialog.closeAll).toHaveBeenCalled();
    });

    test('CLOUDタイプのフォルダでもsubmitEditFolderでstore.updateFolderが呼ばれること', async () => {
      folderModalSelectedEndpointIds.set(['vdb-1', 'embedding-1']);
      selectedItem.set({ id: '1', name: 'Folder', type: 'SAAS_GLOBAL' } as any);
      component.onRename();
      await fixture.whenStable();
      component.editFolderForm.patchValue({ name: 'Updated' });
      fixture.detectChanges();

      await component.submitEditFolder();
      expect(mockStore.updateFolder).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({
          name: 'Updated',
          endpointIds: ['vdb-1', 'embedding-1'],
          groupIds: ['group-1'],
        }),
      );
      expect(mockDialog.closeAll).toHaveBeenCalled();
    });

    test('onDeleteFolderで確認ダイアログが開くこと', () => {
      selectedItem.set({ id: '1', name: 'Folder', type: 'LOCAL' } as any);
      mockDialog.open.mockReturnValue({ afterClosed: () => of(true) } as any);

      component.onDeleteFolder();
      expect(mockDialog.open).toHaveBeenCalled();
      expect(mockStore.deleteFolder).toHaveBeenCalledWith('1');
      expect(mockLocation.back).toHaveBeenCalled();
    });
  });
});
