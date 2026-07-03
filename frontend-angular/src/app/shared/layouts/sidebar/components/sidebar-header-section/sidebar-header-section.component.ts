import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import type { SectionGroup } from '@app-types/layout.type';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-sidebar-header-section',
  standalone: true,
  imports: [TranslateModule, SvgIconComponent, NgClass],
  templateUrl: './sidebar-header-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarHeaderSectionComponent {
  readonly section = input.required<SectionGroup>();
  readonly sectionIndex = input.required<number>();
  readonly sidebarCollapsed = input<boolean>(false);

  readonly sectionToggle = output<number>();
  readonly chatMenuOpened = output<MouseEvent>();

  onHeaderClick(): void {
    if (this.section().labelKey !== 'SIDEBAR.CHAT') {
      this.sectionToggle.emit(this.sectionIndex());
    }
  }

  onToggleButtonClick(event: MouseEvent): void {
    event.stopPropagation();
    this.sectionToggle.emit(this.sectionIndex());
  }

  onChatMenuClick(event: MouseEvent): void {
    this.chatMenuOpened.emit(event);
  }
}
