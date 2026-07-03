import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Component, input, model, signal } from '@angular/core';
import {
  ChatShareDialogComponent,
  ChatShareDialogActionBridge,
} from './chat-share-dialog.component';
import { FakeTranslatePipe } from 'src/testing/fake-translate.pipe';
import { TranslateService } from '@ngx-translate/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { SelectOption } from '@app-types/common';
import { SharesService } from '../../services/shares.service';
import { ChatService } from '../../services/chat.service';
import { TeamsService } from '../../services/teams.service';

@Component({ selector: 'app-combobox-multi', standalone: true, template: '' })
class ComboboxMultiStub {
  readonly id = input.required<string>();
  readonly name = input.required<string>();
  readonly options = input.required<SelectOption<string>[]>();
  readonly placeholder = input<string>('');
  readonly supportText = input<string>('');
  readonly value = model<string[]>([]);
  readonly disabled = input<boolean>(false);
  readonly panelSize = input<string>('default');
  readonly searchHint = input<string>('');
}

const activeRoomSignal = signal<
  { id: string; shareId: string | null; teamIds: string[] } | undefined
>({
  id: 'room-1',
  shareId: 'share-1',
  teamIds: ['team-1'],
});

const mockSharesService = {
  shareId: signal<string | null>(null),
  isSharing: signal(false),
  isUnsharing: signal(false),
  shareRoom: vi.fn(),
  unshareRoom: vi.fn(),
};

const mockChatService = {
  activeRoom: activeRoomSignal,
};

const mockTeamsService = {
  loadTeams: vi.fn().mockResolvedValue(undefined),
  teams: signal<{ id: string; name: string }[]>([]),
};

const matDialogRefMock = { close: vi.fn() };
const matDialogMock = { open: vi.fn() };
const mockTranslateService = {
  instant: vi.fn((key: string) => key),
};

let mockActionBridge: ChatShareDialogActionBridge;

describe('ChatShareDialogComponent', () => {
  let fixture: ComponentFixture<ChatShareDialogComponent>;
  let component: ChatShareDialogComponent;

  beforeEach(async () => {
    mockSharesService.shareId.set(null);
    mockSharesService.isSharing.set(false);
    mockSharesService.isUnsharing.set(false);
    activeRoomSignal.set({ id: 'room-1', shareId: 'share-1', teamIds: ['team-1'] });
    mockTeamsService.teams.set([]);
    mockTeamsService.loadTeams.mockResolvedValue(undefined);
    matDialogRefMock.close.mockReset();
    matDialogMock.open.mockReset();

    await TestBed.configureTestingModule({
      imports: [ChatShareDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: SharesService, useValue: mockSharesService },
        { provide: ChatService, useValue: mockChatService },
        { provide: TeamsService, useValue: mockTeamsService },
        { provide: MatDialogRef, useValue: matDialogRefMock },
        { provide: MatDialog, useValue: matDialogMock },
        { provide: TranslateService, useValue: mockTranslateService },
      ],
    })
      .overrideComponent(ChatShareDialogComponent, {
        set: { imports: [FakeTranslatePipe, ComboboxMultiStub] },
      })
      .compileComponents();

    mockActionBridge = {
      runUnshare: vi.fn(),
      runCancel: vi.fn(),
      runShare: vi.fn(),
    };

    fixture = TestBed.createComponent(ChatShareDialogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('roomId', 'room-1');
    fixture.componentRef.setInput('actionBridge', mockActionBridge);
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('shareId, isSharing, isUnsharingがSharesServiceのシグナルと同じであること', () => {
      expect(component.shareId).toBe(mockSharesService.shareId);
      expect(component.isSharing).toBe(mockSharesService.isSharing);
      expect(component.isUnsharing).toBe(mockSharesService.isUnsharing);
    });

    test('activeRoomのshareIdがshareIdシグナルに反映されること', () => {
      expect(component.shareId()).toBe('share-1');
    });

    test('activeRoomのteamIdsがselectedTeamIdsに反映されること', () => {
      expect(component.selectedTeamIds()).toEqual(['team-1']);
    });

    test('teamsOptionsがteamsServiceのteamsから変換されること', () => {
      mockTeamsService.teams.set([
        { id: 't1', name: 'Team A' },
        { id: 't2', name: 'Team B' },
      ]);
      fixture.detectChanges();
      expect(component.teamsOptions()).toEqual([
        { value: 't1', label: 'Team A' },
        { value: 't2', label: 'Team B' },
      ]);
    });

    test('teamsが空のときteamsOptionsが空配列であること', () => {
      mockTeamsService.teams.set([]);
      fixture.detectChanges();
      expect(component.teamsOptions()).toEqual([]);
    });

    test('コンストラクタでloadTeamsが呼ばれること', () => {
      expect(mockTeamsService.loadTeams).toHaveBeenCalled();
    });

    test('actionBridgeのrunShare, runCancel, runUnshareが関数として設定されること', () => {
      const bridge = component.actionBridge();
      expect(typeof bridge.runShare).toBe('function');
      expect(typeof bridge.runCancel).toBe('function');
      expect(typeof bridge.runUnshare).toBe('function');
    });

    test('activeRoomにshareIdがないときshareIdシグナルはnullにクリアされること', () => {
      activeRoomSignal.set({ id: 'room-2', shareId: null, teamIds: [] });
      mockSharesService.shareId.set('stale-share');
      const f = TestBed.createComponent(ChatShareDialogComponent);
      const bridge: ChatShareDialogActionBridge = {
        runUnshare: vi.fn(),
        runCancel: vi.fn(),
        runShare: vi.fn(),
      };
      f.componentRef.setInput('roomId', 'room-2');
      f.componentRef.setInput('actionBridge', bridge);
      f.detectChanges();
      expect(f.componentInstance.shareId()).toBeNull();
      expect(f.componentInstance.showShareLinkActions()).toBe(false);
      expect(f.componentInstance.selectedTeamIds()).toEqual([]);
    });

    test('roomにshareIdがなくSharesServiceに残っているときshowShareLinkActionsがfalseであること', () => {
      activeRoomSignal.set({ id: 'room-2', shareId: null, teamIds: [] });
      mockSharesService.shareId.set('stale-share');
      fixture.detectChanges();
      expect(component.showShareLinkActions()).toBe(false);
    });
  });

  describe('DOM要素表示', () => {
    test('app-combobox-multiが表示されること', () => {
      const multiSelect = fixture.debugElement.query(By.css('app-combobox-multi'));
      expect(multiSelect).toBeTruthy();
    });

    test('app-combobox-multiにteamsOptionsが渡されること', () => {
      mockTeamsService.teams.set([{ id: 't1', name: 'Team Alpha' }]);
      fixture.detectChanges();
      const multiSelect = fixture.debugElement.query(By.directive(ComboboxMultiStub));
      expect(multiSelect.componentInstance.options()).toEqual([
        { value: 't1', label: 'Team Alpha' },
      ]);
    });

    test('app-combobox-multiにselectedTeamIdsのvalueが渡されること', () => {
      const multiSelect = fixture.debugElement.query(By.directive(ComboboxMultiStub));
      expect(multiSelect.componentInstance.value()).toEqual(['team-1']);
    });

    test('roomにshareIdがあるときコピー・解除ボタンが表示されること', () => {
      const buttons = fixture.debugElement.queryAll(By.css('button'));
      const labels = buttons.map((b) => b.nativeElement.textContent?.trim());
      expect(labels.some((t) => t?.includes('CHAT.SHARE_DIALOG.COPY_LINK'))).toBe(true);
      expect(labels.some((t) => t?.includes('CHAT.SHARE_DIALOG.UNSHARE'))).toBe(true);
    });

    test('roomにshareIdがないときコピー・解除ボタンが表示されないこと', () => {
      activeRoomSignal.set({ id: 'room-1', shareId: null, teamIds: [] });
      mockSharesService.shareId.set(null);
      fixture.detectChanges();
      const buttons = fixture.debugElement.queryAll(By.css('button'));
      expect(buttons.length).toBe(0);
    });
  });

  describe('DOM要素イベント', () => {
    test('handleCancel: dialogRefをfalseで閉じること', () => {
      component.handleCancel();
      expect(matDialogRefMock.close).toHaveBeenCalledWith(false);
    });

    test('handleShare: shareRoomを呼び出して正常終了時にダイアログを閉じないこと', async () => {
      component.selectedTeamIds.set(['t1', 't2']);
      mockSharesService.shareRoom.mockResolvedValue({
        id: 'new-share',
        roomId: 'room-1',
        teamIds: ['t1', 't2'],
      });
      await component.handleShare();
      expect(mockSharesService.shareRoom).toHaveBeenCalledWith('room-1', ['t1', 't2']);
      expect(matDialogRefMock.close).not.toHaveBeenCalled();
    });

    test('handleShare: shareRoomがエラーのときdialogRefをfalseで閉じること', async () => {
      mockSharesService.shareRoom.mockRejectedValue(new Error('network error'));
      await component.handleShare();
      expect(matDialogRefMock.close).toHaveBeenCalledWith(false);
    });

    test('handleUnshare: shareIdがnullのときunshareRoomを呼ばずdialogRefをfalseで閉じること', async () => {
      mockSharesService.shareId.set(null);
      activeRoomSignal.set({ id: 'room-1', shareId: null, teamIds: [] });
      fixture.detectChanges();
      await component.handleUnshare();
      expect(mockSharesService.unshareRoom).not.toHaveBeenCalled();
      expect(matDialogRefMock.close).toHaveBeenCalledWith(false);
    });

    test('handleUnshare: shareIdがある場合unshareRoomを呼び出してdialogRefを閉じること', async () => {
      mockSharesService.shareId.set('share-1');
      mockSharesService.unshareRoom.mockResolvedValue(undefined);
      await component.handleUnshare();
      expect(mockSharesService.unshareRoom).toHaveBeenCalledWith('share-1');
      expect(matDialogRefMock.close).toHaveBeenCalledWith({
        action: 'unshare',
        shareId: 'share-1',
        roomId: 'room-1',
      });
    });

    test('handleUnshare: unshareRoomがエラーのときdialogRefをfalseで閉じること', async () => {
      mockSharesService.shareId.set('share-1');
      mockSharesService.unshareRoom.mockRejectedValue(new Error('fail'));
      await component.handleUnshare();
      expect(matDialogRefMock.close).toHaveBeenCalledWith(false);
    });

    test('runCancelが呼ばれるとhandleCancelが実行されること', () => {
      const spy = vi.spyOn(component, 'handleCancel');
      mockActionBridge.runCancel();
      expect(spy).toHaveBeenCalled();
    });

    test('runShareが呼ばれるとhandleShareが実行されること', () => {
      const spy = vi.spyOn(component, 'handleShare').mockResolvedValue(undefined);
      mockActionBridge.runShare();
      expect(spy).toHaveBeenCalled();
    });

    test('runUnshareが呼ばれるとopenUnshareConfirmDialogが実行されること', () => {
      const spy = vi.spyOn(component, 'openUnshareConfirmDialog').mockImplementation(() => {});
      component.actionBridge().runUnshare();
      expect(spy).toHaveBeenCalled();
    });
  });
});
