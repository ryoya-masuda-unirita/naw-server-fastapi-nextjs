import { NgClass, NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, Type } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
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
  selector: 'app-sidebar-route-button',
  standalone: true,
  imports: [
    NgClass,
    NgComponentOutlet,
    RouterLink,
    RouterLinkActive,
    TranslateModule,
    SvgIconComponent,
    IconButtonComponent,
  ],
  templateUrl: './sidebar-route-button.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarRouteButtonComponent {
  readonly item = input.required<MenuItem>();
  readonly sidebarCollapsed = input<boolean>(false);
  readonly iconComponents = input<Record<string, Type<unknown>>>({});

  readonly roomMenuOpened = output<RoomMenuEvent>();

  onRoomMenuClick(event: MouseEvent): void {
    const { roomId, hasPin } = this.item();
    if (roomId) {
      this.roomMenuOpened.emit({ event, roomId, isPinned: !!hasPin });
    }
  }
}
