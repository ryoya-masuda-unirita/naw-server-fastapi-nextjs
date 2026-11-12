import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { Pipe, PipeTransform } from '@angular/core';
import { TableListComponent, TableListItemComponent } from '@shared/components';
import { IconButtonComponent } from '@shared/components/icon-button/icon-button.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { GroupAssistantItem } from '@app-types/admin/group-management.types';
import { GroupAssistantsTableComponent } from './group-assistants-table.component';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

const FIXTURE_ITEM: GroupAssistantItem = {
  id: 'assistant-1',
  name: 'サポートBot',
  description: '',
  type: 'SECURE',
  iconColor: '#000000',
  groups: [],
  category: null,
  endpoints: [],
  historyLabel: '送信する',
  serverLabel: 'ローカル',
  endpointLabel: 'GPT-4',
  addedAt: '2026-01-15T09:30:00Z',
};

describe('GroupAssistantsTableComponent', () => {
  let fixture: ComponentFixture<GroupAssistantsTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GroupAssistantsTableComponent],
    })
      .overrideComponent(GroupAssistantsTableComponent, {
        set: {
          imports: [
            CommonModule,
            FakeTranslatePipe,
            TableListComponent,
            TableListItemComponent,
            IconButtonComponent,
            SvgIconComponent,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(GroupAssistantsTableComponent);
    fixture.componentRef.setInput('items', [FIXTURE_ITEM]);
    fixture.componentRef.setInput('selectedIds', new Set<string>());
    fixture.detectChanges();
  });

  test('追加日時が一覧に表示されること', () => {
    // テスト実行環境のタイムゾーン(Asia/Tokyo)でのローカル表記
    expect(fixture.nativeElement.textContent).toContain('2026/01/15 18:30');
  });
});
