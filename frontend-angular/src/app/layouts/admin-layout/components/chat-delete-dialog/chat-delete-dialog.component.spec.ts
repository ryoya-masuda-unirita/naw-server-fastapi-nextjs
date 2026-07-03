import { Component, input, output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ChatDeleteDialogComponent } from './chat-delete-dialog.component';
import { ChatService } from '@features/chat/services/chat.service';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@core/constants/api-paths.config';
import { FakeTranslatePipe } from 'src/testing/fake-translate.pipe';

@Component({ selector: 'app-button', standalone: true, template: '' })
class ButtonStub {
  readonly variant = input<string>('solid');
  readonly size = input<string>('md');
  readonly fullWidth = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly loading = input<boolean>(false);
  readonly buttonClick = output<void>();
}

@Component({ selector: 'app-table', standalone: true, template: '' })
class TableStub {
  readonly columns = input<unknown[]>([]);
  readonly data = input<unknown[]>([]);
  readonly selectable = input<boolean>(false);
  readonly mobileRowTemplate = input<unknown>();
  readonly selectionChange = output<unknown[]>();
}

@Component({ selector: 'app-skeleton', standalone: true, template: '' })
class SkeletonStub {
  readonly width = input<string>('');
  readonly height = input<string>('');
  readonly variant = input<string>('rect');
}

@Component({ selector: 'app-skeleton-block', standalone: true, template: '' })
class SkeletonBlockStub {
  readonly length = input<number>(1);
}

@Component({ selector: 'app-pagination', standalone: true, template: '' })
class PaginationStub {
  readonly totalPages = input<number>(1);
  readonly useQueryParams = input<boolean>(false);
  readonly showPageSize = input<boolean>(false);
  readonly showFirstLast = input<boolean>(false);
  readonly currentPageOverride = input<number>(1);
  readonly pageChange = output<number>();
}

@Component({ selector: 'app-circular-loading', standalone: true, template: '' })
class CircularLoadingStub {}

const mockApi = {
  get: vi.fn().mockResolvedValue({ content: [], total: 0, page: 0, pageSize: 20 }),
};

const mockChatService = {
  allRooms: signal([]),
  isAllRoomsLoading: signal(false),
  deleteRooms: vi.fn().mockResolvedValue(undefined),
};

const mockDialogRef = {
  close: vi.fn(),
};

const mockDialog = {
  open: vi.fn(),
};

const mockTranslate = {
  instant: vi.fn((key: string) => key),
};

describe('ChatDeleteDialogComponent', () => {
  let fixture: ComponentFixture<ChatDeleteDialogComponent>;
  let component: ChatDeleteDialogComponent;

  beforeEach(async () => {
    mockChatService.allRooms.set([]);
    mockChatService.isAllRoomsLoading.set(false);

    await TestBed.configureTestingModule({
      imports: [ChatDeleteDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: ChatService, useValue: mockChatService },
        { provide: ApiClientService, useValue: mockApi },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MatDialog, useValue: mockDialog },
        { provide: TranslateService, useValue: mockTranslate },
      ],
    })
      .overrideComponent(ChatDeleteDialogComponent, {
        set: {
          imports: [
            FakeTranslatePipe,
            MatIconModule,
            ButtonStub,
            TableStub,
            SkeletonStub,
            SkeletonBlockStub,
            PaginationStub,
            CircularLoadingStub,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ChatDeleteDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('ダイアログを開いたとき', () => {
    it('ダイアログを開くと、削除対象のチャット一覧を読み込む', () => {
      expect(mockApi.get).toHaveBeenCalledWith(API_PATHS.ROOMS.LIST, {
        params: { page: 0, size: 10 },
      });
    });

    it('読み込んだチャット一覧を rooms シグナルに保持する', async () => {
      mockApi.get.mockResolvedValue({
        content: [
          {
            id: 'room-1',
            name: 'Test Room',
            pinned: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            defaultAssistantId: 'a1',
            tenantId: 't1',
            userId: 'u1',
            rating: null,
            shareUrl: null,
          },
        ],
        total: 1,
        page: 0,
        pageSize: 20,
      });

      await component['loadRoomsPage'](1);
      fixture.detectChanges();

      expect(component.rooms()[0]?.name).toBe('Test Room');
    });
  });

  describe('日付の表示', () => {
    it('最終更新日が yyyy/mm/dd 形式で表示される', () => {
      expect(component.formatDate(new Date('2026-05-22T00:00:00.000Z'))).toBe('2026/05/22');
    });

    it('サーバーから返る日付文字列も yyyy/mm/dd 形式で表示される', () => {
      expect(component.formatDate('2026-05-22T00:00:00.000Z')).toBe('2026/05/22');
    });

    it('日付がないチャットは日付欄を空のまま表示する', () => {
      expect(component.formatDate(undefined)).toBe('');
    });
  });

  describe('チャットの選択', () => {
    it('ユーザーがチェックしたチャットだけ削除対象として数える', () => {
      const selected = [
        { id: 'room-1', name: 'Room 1', isPinned: false, category: 'chat' as const },
      ];
      component.onSelectionChange(selected);
      expect(component.selectedRooms()).toEqual(selected);
      expect(component.selectedCount()).toBe(1);
    });
  });

  describe('キャンセル', () => {
    it('キャンセルボタンで削除を中止してダイアログを閉じる', () => {
      component.onCancel();
      expect(mockDialogRef.close).toHaveBeenCalledWith(null);
    });
  });

  describe('削除', () => {
    it('削除実行時に、選択したチャットだけを一括削除する', async () => {
      component.selectedRooms.set([
        { id: 'room-1', name: 'Room 1', isPinned: false, category: 'chat' },
        { id: 'room-2', name: 'Room 2', isPinned: false, category: 'chat' },
      ]);

      await component.onDelete();

      expect(mockChatService.deleteRooms).toHaveBeenCalledWith(['room-1', 'room-2']);
    });
  });
});
