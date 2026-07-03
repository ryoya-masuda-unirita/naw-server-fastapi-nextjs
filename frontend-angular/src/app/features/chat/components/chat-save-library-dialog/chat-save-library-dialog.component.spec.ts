import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Component, input, model, output, Pipe, PipeTransform, signal } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { SelectOption } from '@app-types/common';
import { TagItem } from '@app-types/admin/library.types';
import { Team } from '@core/constants/mock-data/teams.mock';
import {
  ChatSaveLibraryDialogComponent,
  ChatSaveLibraryDialogActionBridge,
} from './chat-save-library-dialog.component';
import { TeamsService } from '../../services/teams.service';
import { TagsService } from '../../services/tags.service';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

@Component({ selector: 'app-form-input', standalone: true, template: '' })
class FormInputStub {
  readonly label = input.required<string>();
  readonly supportText = input<string>('');
  readonly value = input<string>('');
  readonly valueChange = output<string>();
}

@Component({ selector: 'app-combobox-multi', standalone: true, template: '' })
class ComboboxMultiStub {
  readonly id = input.required<string>();
  readonly name = input.required<string>();
  readonly options = input.required<SelectOption<string>[]>();
  readonly placeholder = input<string>('');
  readonly panelSize = input<string>('default');
  readonly searchHint = input<string>('');
  readonly value = model<string[]>([]);
}

@Component({ selector: 'app-optional-label', standalone: true, template: '' })
class OptionalLabelStub {}

const mockDialogRef = { close: vi.fn() };
const teamsSignal = signal<Team[]>([]);
const tagsSignal = signal<TagItem[]>([]);
const mockTeamsService = {
  teams: teamsSignal,
  isLoading: signal(false),
  loadTeams: vi.fn().mockResolvedValue(undefined),
};
const mockTagsService = {
  tags: tagsSignal,
  isLoading: signal(false),
  loadTags: vi.fn().mockResolvedValue(undefined),
};
const mockTranslate = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  onLangChange: { subscribe: vi.fn() },
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

describe('ChatSaveLibraryDialogComponent', () => {
  let fixture: ComponentFixture<ChatSaveLibraryDialogComponent>;
  let component: ChatSaveLibraryDialogComponent;

  const contentNameSignal = signal('');
  const selectedTagIdsSignal = signal<string[]>([]);
  const selectedTeamIdsSignal = signal<string[]>([]);
  const mockActionBridge: ChatSaveLibraryDialogActionBridge = {
    runCancel: vi.fn(),
    runSave: vi.fn(),
    contentName: contentNameSignal,
    selectedTagIds: selectedTagIdsSignal,
    selectedTeamIds: selectedTeamIdsSignal,
  };

  beforeEach(async () => {
    teamsSignal.set([]);
    tagsSignal.set([]);
    contentNameSignal.set('');
    selectedTagIdsSignal.set([]);
    selectedTeamIdsSignal.set([]);

    await TestBed.configureTestingModule({
      imports: [ChatSaveLibraryDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: TeamsService, useValue: mockTeamsService },
        { provide: TagsService, useValue: mockTagsService },
        { provide: TranslateService, useValue: mockTranslate },
      ],
    })
      .overrideComponent(ChatSaveLibraryDialogComponent, {
        set: {
          imports: [FakeTranslatePipe, FormInputStub, ComboboxMultiStub, OptionalLabelStub],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ChatSaveLibraryDialogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('actionBridge', mockActionBridge);
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('tagsService が空のとき tagOptions は空配列を返すこと', () => {
      expect(component.tagOptions()).toEqual([]);
    });

    test('tagsService のタグが tagOptions に SelectOption として変換されること', () => {
      const tags: TagItem[] = [
        { id: 'tag1', name: 'タグ1', updatedAt: '2025-09-29T00:00:00.000Z' },
        { id: 'tag2', name: 'タグ2', updatedAt: '2025-09-28T00:00:00.000Z' },
      ];
      tagsSignal.set(tags);
      fixture.detectChanges();
      expect(component.tagOptions()).toEqual([
        { label: 'タグ1', value: 'tag1' },
        { label: 'タグ2', value: 'tag2' },
      ]);
    });

    test('teamsService が空のとき teamOptions は空配列を返すこと', () => {
      expect(component.teamOptions()).toEqual([]);
    });

    test('teamsService のチームが teamOptions に SelectOption として変換されること', () => {
      const teams: Team[] = [
        { id: 'team1', name: 'チームA' },
        { id: 'team2', name: 'チームB' },
      ];
      teamsSignal.set(teams);
      fixture.detectChanges();
      expect(component.teamOptions()).toEqual([
        { label: 'チームA', value: 'team1' },
        { label: 'チームB', value: 'team2' },
      ]);
    });

    test('コンストラクタで loadTeams と loadTags が呼ばれること', () => {
      expect(mockTeamsService.loadTeams).toHaveBeenCalled();
      expect(mockTagsService.loadTags).toHaveBeenCalled();
    });

    test('effect により actionBridge の runCancel が dialogRef.close(null) を呼ぶ関数に上書きされること', () => {
      mockActionBridge.runCancel();
      expect(mockDialogRef.close).toHaveBeenCalledWith(null);
    });
  });

  describe('DOM要素表示', () => {
    test('app-form-input が表示されること', () => {
      const formInput = fixture.debugElement.query(By.css('app-form-input'));
      expect(formInput).toBeTruthy();
    });

    test('app-combobox-multi が2つ表示されること', () => {
      const multiSelects = fixture.debugElement.queryAll(By.css('app-combobox-multi'));
      expect(multiSelects.length).toBe(2);
    });

    test('app-optional-label が表示されること', () => {
      const optLabel = fixture.debugElement.query(By.css('app-optional-label'));
      expect(optLabel).toBeTruthy();
    });

    test('tagOptions が tags-multi-select に渡されること', () => {
      const tags: TagItem[] = [{ id: 't1', name: 'タグ1', updatedAt: '2025-09-29T00:00:00.000Z' }];
      tagsSignal.set(tags);
      fixture.detectChanges();
      const tagSelect = fixture.debugElement.query(By.css('#tags-multi-select'));
      expect(tagSelect.componentInstance.options()).toEqual([{ label: 'タグ1', value: 't1' }]);
    });

    test('teamOptions が team-multi-select に渡されること', () => {
      const teams: Team[] = [{ id: 'tm1', name: 'チームA' }];
      teamsSignal.set(teams);
      fixture.detectChanges();
      const teamSelect = fixture.debugElement.query(By.css('#team-multi-select'));
      expect(teamSelect.componentInstance.options()).toEqual([{ label: 'チームA', value: 'tm1' }]);
    });

    test('app-form-input の value に actionBridge.contentName の値が渡されること', () => {
      contentNameSignal.set('テスト名称');
      fixture.detectChanges();
      const formInput = fixture.debugElement.query(By.css('app-form-input'));
      expect(formInput.componentInstance.value()).toBe('テスト名称');
    });
  });

  describe('DOM要素イベント', () => {
    test('app-form-input の valueChange イベントで actionBridge.contentName が更新されること', () => {
      const formInput = fixture.debugElement.query(By.css('app-form-input'));
      formInput.triggerEventHandler('valueChange', 'テストタイトル');
      expect(contentNameSignal()).toBe('テストタイトル');
    });

    test('runCancel を呼ぶと dialogRef.close(null) が実行されること', () => {
      mockActionBridge.runCancel();
      expect(mockDialogRef.close).toHaveBeenCalledWith(null);
      expect(mockDialogRef.close).toHaveBeenCalledTimes(1);
    });
  });
});
