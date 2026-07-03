import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ChatAlertComponent } from '@app/features/chat/components/chat-alert/chat-alert.component';
// import { ChatErrorComponent } from '@app/features/chat/components/chat-error/chat-error.component';
import { UiStore } from '@core/stores/ui.store';
import { ChatInputComponent } from '@features/chat/components/chat-input/chat-input.component';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    ChatInputComponent,
    // ChatErrorComponent,
    ChatAlertComponent,
  ],
  templateUrl: './dashboard.component.html',
})
export class AdminDashboardComponent {
  onAlertDismissed() {
    throw new Error('Method not implemented.');
  }
  private readonly uiStore = inject(UiStore);

  toggleSidebar() {
    this.uiStore.toggleMobileSidebar();
  }
}
