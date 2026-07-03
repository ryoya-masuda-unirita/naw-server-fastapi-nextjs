import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AdminPageShellComponent } from '@shared/layouts/admin-page-shell/admin-page-shell.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { resolvePeriodRange } from '@shared/components/filter/period-filter/period-filter.utils';
import {
  ChatHistoryFilterChange,
  ChatHistoryFilterComponent,
} from './components/chat-history-filter/chat-history-filter.component';
import { ChatHistoryListComponent } from './components/chat-history-list/chat-history-list.component';
import { ChatHistoryStore } from './stores/chat-history.store';
import { ChatHistoryApiService } from './services/chat-history-api.service';
import { SelectOption } from '@app-types/common';

@Component({
  selector: 'app-chat-history-page',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    AdminPageShellComponent,
    ChatHistoryFilterComponent,
    ChatHistoryListComponent,
    MatProgressSpinnerModule,
    PaginationComponent,
  ],
  templateUrl: './chat-history.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col h-full',
  },
})
export class ChatHistoryPageComponent implements OnInit {
  readonly store = inject(ChatHistoryStore);
  private readonly translate = inject(TranslateService);
  private readonly api = inject(ChatHistoryApiService);

  readonly userOptions = signal<SelectOption[]>([]);

  readonly countDisplay = computed(() => {
    const r = this.store.pageRange();
    if (r.total === 0) return '';
    return this.translate.instant('CHAT_HISTORY.PAGE_COUNT', {
      from: r.from,
      to: r.to,
      total: r.total,
    });
  });

  ngOnInit() {
    this.store.loadItems();
    void this.api.listUsers().then((users) => {
      this.userOptions.set(users.map((u) => ({ label: u.userName ?? u.userId, value: u.userId })));
    });
  }

  onFilterChange(event: ChatHistoryFilterChange) {
    const range = resolvePeriodRange(event.period, event.periodRange);
    const userId = event.user && event.user !== 'all' ? event.user : undefined;
    this.store.updateFilter({
      query: event.query || undefined,
      userId,
      period: event.period,
      periodFrom: range.from,
      periodTo: range.to,
      sortField: event.sortField ?? 'updatedAt',
      sortOrder: event.sortOrder ?? 'desc',
    });
  }
}
