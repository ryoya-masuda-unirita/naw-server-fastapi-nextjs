import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

import { IconButtonComponent } from '@shared/components';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import type { MenuItem } from '@app-types/layout.type';

export interface RoomMenuEvent {
  event: MouseEvent;
  roomId: string;
  isPinned: boolean;
}

@Component({
  selector: 'app-sidebar-button',
  standalone: true,
  imports: [NgClass, TranslateModule, SvgIconComponent, IconButtonComponent],
  templateUrl: './sidebar-button.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarButtonComponent {
  readonly item = input.required<MenuItem>();
  readonly sidebarCollapsed = input<boolean>(false);

  readonly roomMenuOpened = output<RoomMenuEvent>();

  onRoomMenuClick(event: MouseEvent): void {
    const { roomId, hasPin } = this.item();
    if (roomId) {
      this.roomMenuOpened.emit({ event, roomId, isPinned: !!hasPin });
    }
  }
}
