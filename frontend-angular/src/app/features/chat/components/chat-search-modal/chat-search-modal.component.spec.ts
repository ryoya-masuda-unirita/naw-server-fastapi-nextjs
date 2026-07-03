beforeAll(() => {
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    },
    writable: true,
  });
});
import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ChatSearchModalComponent } from './chat-search-modal.component';
import { FakeTranslatePipe } from 'src/testing/fake-translate.pipe';
import { SearchInputComponent } from '@shared/components/input/search-input.component';
import { MatDialogRef } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ChatService } from '@features/chat/services/chat.service';
import { ApiClientService } from '@core/services/api-client';
import type { ChatRoom, RoomsListApiResponse } from '@app-types/chat/chat-room.type';

@Component({ selector: 'app-pagination', standalone: true, template: '' })
class PaginationStub {
  readonly totalPages = input<number>(1);
  readonly useQueryParams = input<boolean>(false);
  readonly showPageSize = input<boolean>(false);
  readonly showFirstLast = input<boolean>(false);
  readonly currentPageOverride = input<number>(1);
}

@Component({ selector: 'app-circular-loading', standalone: true, template: '' })
class CircularLoadingStub {}

@Component({ selector: 'app-mat-icon', standalone: true, template: '' })
class MatIconStub {
  readonly icon = input<string>('');
}

const mockTranslate = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  onLangChange: { subscribe: vi.fn() },
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

const mockRooms: ChatRoom[] = [
  {
    id: 'room1',
    name: 'ルーム1',
    isPinned: false,
    lastMessage: 'メッセージ1',
    lastMessageTime: new Date('2026-01-01'),
    category: 'chat',
  },
  {
    id: 'room2',
    name: 'ルーム2',
    isPinned: false,
    lastMessage: 'メッセージ2',
    lastMessageTime: new Date('2026-01-02'),
    category: 'chat',
  },
];

const mockApiResponse: RoomsListApiResponse = {
  content: [
    {
      id: 'room1',
      name: 'ルーム1',
      pinned: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      defaultAssistantId: 'assistant-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      rating: null,
      shareUrl: null,
    },
    {
      id: 'room2',
      name: 'ルーム2',
      pinned: false,
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      defaultAssistantId: 'assistant-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      rating: null,
      shareUrl: null,
    },
  ],
  total: 2,
  page: 0,
  pageSize: 20,
};

const mockChatService = {
  allRooms: signal(mockRooms),
  selectRoom: vi.fn(),
};

const mockApiClient = {
  get: vi.fn().mockResolvedValue(mockApiResponse),
};

const matDialogRefMock = { close: vi.fn() };
const routerMock = { navigate: vi.fn() };

async function searchWithQuery(
  fixture: ComponentFixture<ChatSearchModalComponent>,
  component: ChatSearchModalComponent,
  query: string,
): Promise<void> {
  component.query.set(query);
  await vi.advanceTimersByTimeAsync(300);
  fixture.detectChanges();
  await fixture.whenStable();
}

describe('ChatSearchModalComponent', () => {
  let fixture: ComponentFixture<ChatSearchModalComponent>;
  let component: ChatSearchModalComponent;

  beforeEach(async () => {
    vi.useFakeTimers();
    mockApiClient.get.mockResolvedValue(mockApiResponse);
    mockChatService.allRooms.set(mockRooms);

    await TestBed.configureTestingModule({
      imports: [ChatSearchModalComponent, NoopAnimationsModule],
      providers: [
        { provide: ChatService, useValue: mockChatService },
        { provide: ApiClientService, useValue: mockApiClient },
        { provide: MatDialogRef, useValue: matDialogRefMock },
        { provide: TranslateService, useValue: mockTranslate },
        { provide: Router, useValue: routerMock },
      ],
    })
      .overrideComponent(ChatSearchModalComponent, {
        set: {
          imports: [
            CommonModule,
            FakeTranslatePipe,
            SearchInputComponent,
            MatIconStub,
            PaginationStub,
            CircularLoadingStub,
          ],
        },
      })
      .overrideComponent(SearchInputComponent, {
        remove: { imports: [TranslateModule] },
        add: { imports: [FakeTranslatePipe] },
      })
      .compileComponents();
    fixture = TestBed.createComponent(ChatSearchModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('初期値・ゲッター', () => {
    test('results, isSearchLoadingが正しく取得できること', async () => {
      await searchWithQuery(fixture, component, 'a');

      expect(component.results().length).toBe(2);
      expect(component.isSearchLoading()).toBe(false);
    });
  });

  describe('DOM要素表示', () => {
    test('検索結果が正しく表示されること', () => {
      component.query.set('a');
      component.results.set(mockRooms);
      component.isSearchLoading.set(false);
      fixture.detectChanges();

      const buttons = fixture.debugElement
        .queryAll(By.css('button[type=button]'))
        .filter((el) => !el.nativeElement.closest('app-search-input'));
      expect(buttons.length).toBe(2);
    });
  });

  describe('DOM要素イベント', () => {
    test('検索結果ボタンをクリックするとselectRoomが呼ばれること', () => {
      component.query.set('a');
      component.results.set(mockRooms);
      component.isSearchLoading.set(false);
      fixture.detectChanges();

      const buttons = fixture.debugElement
        .queryAll(By.css('button[type=button]'))
        .filter((el) => !el.nativeElement.closest('app-search-input'));
      buttons[0].nativeElement.click();
      expect(mockChatService.selectRoom).toHaveBeenCalledWith('room1');
    });
  });
});
