import { Component, ChangeDetectionStrategy, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ChatHistoryItem } from '@app-types/chat-history.types';
import { IconButtonComponent } from '@shared/components/icon-button/icon-button.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { ROUTES } from '@core/constants/routes.config';
import { TableListComponent, TableListItemComponent } from '@shared/components';

@Component({
  selector: 'app-chat-history-list',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    TableListComponent,
    TableListItemComponent,
    IconButtonComponent,
    SvgIconComponent,
  ],
  templateUrl: './chat-history-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatHistoryListComponent {
  private readonly router = inject(Router);

  readonly items = input.required<ChatHistoryItem[]>();

  navigateToDetail(item: ChatHistoryItem): void {
    void this.router.navigate([ROUTES.APP.ADMIN_CHAT_HISTORY_DETAIL(item.id)], {
      state: {
        roomName: item.roomName,
        userName: item.userName,
        userId: item.userId,
      },
    });
  }
}
