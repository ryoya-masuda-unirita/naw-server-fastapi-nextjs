import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-chat-history-page',
  standalone: true,
  imports: [CommonModule, TranslateModule, MatProgressSpinnerModule],
  template: `
    <div class="flex flex-col h-full bg-white rounded-lg">
      <div class="p-4 md:p-6">
        <h1 class="text-lg md:text-xl font-bold mb-4 md:mb-6 text-text-default">
          {{ 'CHAT_HISTORY.TITLE' | translate }}
        </h1>

        <!-- TODO: Add ChatHistoryFilterComponent when created -->
        <div class="mb-4 p-4 bg-slate-50 rounded-lg">
          <p class="text-sm text-slate-600">Chat history filters will appear here</p>
        </div>

        <!-- TODO: Add ChatHistoryListComponent when created -->
        <div class="p-4 bg-slate-50 rounded-lg">
          <p class="text-sm text-slate-600">Chat history list will appear here</p>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatHistoryPageComponent {}
