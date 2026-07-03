import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it, beforeEach } from 'vitest';
import { TemplateListItemsComponent } from './template-list-items.component';
import type { AdminTemplate } from '@app-types/admin/template.types';

describe('TemplateListItemsComponent', () => {
  let fixture: ComponentFixture<TemplateListItemsComponent>;

  const template: AdminTemplate = {
    id: 't1',
    name: 'Template 1',
    description: 'Description',
    systemPrompt: 'System prompt',
    teams: ['Team A'],
    updatedAt: '2026-01-02T03:04:00',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), TemplateListItemsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TemplateListItemsComponent);
    fixture.componentRef.setInput('items', [template]);
    fixture.componentRef.setInput('selectedIds', new Set<string>());
    fixture.detectChanges();
  });

  it('更新日時が表示されること', () => {
    expect(fixture.nativeElement.textContent).toContain('2026/01/02 03:04');
  });
});
