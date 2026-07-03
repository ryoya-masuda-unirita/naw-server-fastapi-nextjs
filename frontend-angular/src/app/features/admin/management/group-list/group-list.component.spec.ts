import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GroupListComponent } from './group-list.component';
import { GroupListStore } from './stores/group-list.store';
import { GroupApiService } from './services/group-api.service';
import { GroupUsersApiService } from './services/group-users-api.service';
import { GroupAssistantsApiService } from './services/group-assistants-api.service';
import { GroupTemplatesApiService } from './services/group-templates-api.service';
import { ToastService } from '../../../../core/services/toast.service';
import { AuthStore } from '@core/stores/auth.store';

const mockAuthStore = {
  isGroupAdminOnly: vi.fn(() => false),
};

// ─── helpers ────────────────────────────────────────────────────────────────

interface DialogRefSpy {
  close: ReturnType<typeof vi.fn>;
  componentInstance: { data: { confirmAction?: () => unknown } & Record<string, unknown> };
}

function buildDialogRef(): DialogRefSpy {
  return {
    close: vi.fn(),
    componentInstance: { data: {} as { confirmAction?: () => unknown } & Record<string, unknown> },
  };
}

function buildStoreSpy() {
  return {
    filter: signal<{ pageIndex: number; pageSize: number }>({ pageIndex: 1, pageSize: 12 }),
    totalPages: signal(1),
    isLoading: signal(false),
    items: signal([]),
    totalItems: signal(0),
    pageRange: signal<{ from: number; to: number; total: number }>({ from: 0, to: 0, total: 0 }),
    setNameResolver: vi.fn(),
    loadItems: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    updateFilter: vi.fn(),
    updatePageIndex: vi.fn(),
    addOne: vi.fn(),
  };
}

interface MockGroupApiResponse {
  id: string;
  name: string;
  adminUserIds?: string[];
  users?: string[];
  assistants?: string[];
  promptTemplates?: string[];
  updatedAt?: string;
}

function buildSetup() {
  const storeSpy = buildStoreSpy();
  const usersApi = {
    list: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'u1',
          displayName: 'User 1',
          userId: 'u1',
          role: 'user',
          usedTokens: 0,
          loginKey: '',
          accountType: 'none',
          email: '',
          updatedAt: new Date(),
        },
      ],
      total: 1,
      page: 0,
      size: 1000,
    }),
  };
  const assistantsApi = {
    list: vi.fn().mockResolvedValue({
      content: [
        {
          id: 'a1',
          name: 'Assist 1',
          description: '',
          type: 'SECURE',
          includeHistory: false,
          iconColor: '',
          groups: [],
          category: null,
          endpoints: [],
        },
      ],
      totalElements: 1,
      number: 0,
      size: 1000,
    }),
  };
  const templatesApi = {
    list: vi.fn().mockResolvedValue({
      content: [{ id: 't1', name: 'Tmpl 1', description: '', systemPrompt: '' }],
      totalElements: 1,
      number: 0,
      size: 1000,
    }),
  };
  const groupApi = {
    create: vi.fn<(payload: object) => Promise<MockGroupApiResponse>>().mockResolvedValue({
      id: 'g-new',
      name: 'New Group',
      updatedAt: '2026-01-01T00:00:00',
    }),
  };
  const toast = { success: vi.fn<() => void>(), error: vi.fn<() => void>() };
  const dialogRef = buildDialogRef();
  const dialog = { open: vi.fn().mockReturnValue(dialogRef) };

  return {
    storeSpy,
    usersApi,
    assistantsApi,
    templatesApi,
    groupApi,
    toast,
    dialog,
    dialogRef,
    providers: [
      GroupListComponent,
      { provide: GroupListStore, useValue: storeSpy },
      { provide: GroupUsersApiService, useValue: usersApi },
      { provide: GroupAssistantsApiService, useValue: assistantsApi },
      { provide: GroupTemplatesApiService, useValue: templatesApi },
      { provide: GroupApiService, useValue: groupApi },
      { provide: ToastService, useValue: toast },
      { provide: MatDialog, useValue: dialog },
      { provide: AuthStore, useValue: mockAuthStore },
    ],
  };
}

// ─── GroupListComponent ──────────────────────────────────────────────────────

describe('GroupListComponent', () => {
  let component: GroupListComponent;
  let storeSpy: ReturnType<typeof buildStoreSpy>;
  let usersApi: ReturnType<typeof buildSetup>['usersApi'];
  let assistantsApi: ReturnType<typeof buildSetup>['assistantsApi'];
  let templatesApi: ReturnType<typeof buildSetup>['templatesApi'];
  let groupApi: ReturnType<typeof buildSetup>['groupApi'];
  let toast: ReturnType<typeof buildSetup>['toast'];
  let dialog: ReturnType<typeof buildSetup>['dialog'];
  let dialogRef: ReturnType<typeof buildSetup>['dialogRef'];

  beforeEach(async () => {
    const setup = buildSetup();
    ({ storeSpy, usersApi, assistantsApi, templatesApi, groupApi, toast, dialog, dialogRef } =
      setup);
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: setup.providers,
    });
    await TestBed.compileComponents();
    component = TestBed.inject(GroupListComponent);
  });

  // ── 初期状態 ──────────────────────────────────────────────────────────────

  describe('初期状態', () => {
    it('コンポーネントが生成されること', () => {
      expect(component).toBeTruthy();
    });

    it('追加フォームの初期値が空であること', () => {
      expect(component.addForm.getRawValue()).toEqual({ name: '' });
    });

    it('追加処理の初期状態では送信中でないこと', () => {
      expect(component.isAddSubmitting()).toBe(false);
    });
  });

  // ── グループ追加フォームのバリデーション ──────────────────────────────────

  describe('グループ追加フォームのバリデーション', () => {
    it('グループ名を入力しないと作成できないこと', () => {
      const ctrl = component.addForm.controls.name;
      ctrl.setValue('');
      expect(ctrl.valid).toBe(false);
      expect(ctrl.errors?.['required']).toBeTruthy();
    });

    it('グループ名が100文字を超えると作成できないこと', () => {
      const ctrl = component.addForm.controls.name;
      ctrl.setValue('a'.repeat(101));
      expect(ctrl.valid).toBe(false);
      expect(ctrl.errors?.['maxlength']).toBeTruthy();
    });

    it('グループ名が100文字以内であれば有効であること', () => {
      const ctrl = component.addForm.controls.name;
      ctrl.setValue('a'.repeat(100));
      expect(ctrl.valid).toBe(true);
    });

    it('グループ名を入力するとフォームが有効になること', () => {
      component.addForm.setValue({ name: 'Team Alpha' });
      expect(component.addForm.valid).toBe(true);
    });
  });

  // ── 件数表示 ──────────────────────────────────────────────────────────────

  describe('件数表示', () => {
    it('グループが0件のときページ範囲が表示されないこと', () => {
      storeSpy.pageRange.set({ from: 0, to: 0, total: 0 });
      expect(component.countDisplay()).toBe('');
    });

    it('グループが存在するとき現在のページ範囲が表示されること', () => {
      storeSpy.pageRange.set({ from: 1, to: 12, total: 50 });
      expect(component.countDisplay()).toBeTruthy();
    });
  });

  // ── 初期化 ────────────────────────────────────────────────────────────────

  describe('初期化', () => {
    it('グループ一覧の表示に必要なデータが初期化されること', () => {
      component.ngOnInit();
      expect(storeSpy.setNameResolver).toHaveBeenCalledWith(expect.any(Function));
    });

    it('名前解決用のマスタデータが読み込まれること', async () => {
      component.ngOnInit();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(usersApi.list).toHaveBeenCalled();
      expect(assistantsApi.list).toHaveBeenCalled();
      expect(templatesApi.list).toHaveBeenCalled();
    });

    it('選択肢の読み込み後にグループ一覧が表示されること', async () => {
      component.ngOnInit();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(storeSpy.loadItems).toHaveBeenCalled();
    });
  });

  // ── 絞り込み ──────────────────────────────────────────────────────────────

  describe('絞り込み', () => {
    it('ソート条件を変更すると一覧の並び順が変わること', () => {
      component.onFilterChange({ query: 'team', sortField: 'name', sortOrder: 'asc' });
      expect(storeSpy.updateFilter).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'team', sortField: 'name', sortOrder: 'asc' }),
      );
    });

    it('検索キーワードが空のとき絞り込みが解除されること', () => {
      component.onFilterChange({ query: '', sortField: 'updatedAt', sortOrder: 'desc' });
      expect(storeSpy.updateFilter).toHaveBeenCalledWith(
        expect.objectContaining({ query: undefined }),
      );
    });
  });

  // ── グループ追加 ──────────────────────────────────────────────────────────

  describe('グループ追加', () => {
    it('追加ダイアログが開くこと', async () => {
      await component.onAddTeam();
      expect(dialog.open).toHaveBeenCalled();
    });

    it('ダイアログを開く前にフォームがリセットされること', async () => {
      component.addForm.controls.name.setValue('Old Name');
      await component.onAddTeam();
      expect(component.addForm.controls.name.value).toBe('');
    });

    it('ダイアログを開く前に送信状態がリセットされること', async () => {
      component.isAddSubmitting.set(true);
      await component.onAddTeam();
      expect(component.isAddSubmitting()).toBe(false);
    });

    describe('グループ作成', () => {
      async function openAndGetConfirm() {
        await component.onAddTeam();
        return dialogRef.componentInstance.data.confirmAction as () => Promise<void>;
      }

      it('必須項目を入力しないとグループを作成できないこと', async () => {
        const confirm = await openAndGetConfirm();
        await confirm();
        expect(component.addForm.controls.name.touched).toBe(true);
        expect(groupApi.create).not.toHaveBeenCalled();
      });

      it('グループ名の前後スペースを除去して作成されること', async () => {
        const confirm = await openAndGetConfirm();
        component.addForm.setValue({ name: '  Team A  ' });
        await confirm();
        expect(groupApi.create).toHaveBeenCalledWith({ name: 'Team A' });
      });

      it('グループを作成できること', async () => {
        const confirm = await openAndGetConfirm();
        component.addForm.setValue({ name: 'Team A' });
        await confirm();
        expect(storeSpy.addOne).toHaveBeenCalled();
        expect(toast.success).toHaveBeenCalled();
        expect(dialogRef.close).toHaveBeenCalledWith(true);
      });

      it('グループの作成に失敗するとエラーが表示されること', async () => {
        groupApi.create.mockRejectedValue(new Error('500'));
        const confirm = await openAndGetConfirm();
        component.addForm.setValue({ name: 'Team A' });
        await confirm();
        expect(toast.error).toHaveBeenCalled();
        expect(storeSpy.addOne).not.toHaveBeenCalled();
      });

      it('作成失敗後に再度作成を試みられること', async () => {
        groupApi.create.mockRejectedValue(new Error('fail'));
        const confirm = await openAndGetConfirm();
        component.addForm.setValue({ name: 'Team A' });
        await confirm();
        expect(component.isAddSubmitting()).toBe(false);
      });

      it('作成処理中に二重送信されないこと', async () => {
        const confirm = await openAndGetConfirm();
        component.addForm.setValue({ name: 'Team A' });
        component.isAddSubmitting.set(true);
        await confirm();
        expect(groupApi.create).not.toHaveBeenCalled();
      });
    });
  });
});
