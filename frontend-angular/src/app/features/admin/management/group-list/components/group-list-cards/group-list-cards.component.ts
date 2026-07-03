import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonComponent } from '@shared/components/button/button.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { GroupListItem } from '@app-types/admin/group-management.types';

@Component({
  selector: 'app-group-list-cards',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, ButtonComponent, SvgIconComponent],
  templateUrl: './group-list-cards.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupListCardsComponent {
  readonly items = input.required<GroupListItem[]>();

  formatNames(names: string[]): string {
    return names.length === 0 ? '—' : names.join('、');
  }

  detailLink(id: string): string[] {
    return ['/admin/groups', id, 'users'];
  }
}
