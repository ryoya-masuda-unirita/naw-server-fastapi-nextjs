import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChatSummaryComponent } from '@shared/components/features/chat/chat-summary/chat-summary.component';
import { ViewerService } from '@features/chat/services/viewer.service';

@Component({
  selector: 'app-chat-viewer',
  standalone: true,
  imports: [ChatSummaryComponent],
  templateUrl: './chat-viewer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatViewerComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly viewerService = inject(ViewerService);

  readonly chatId = signal<string | null>(null);
  readonly headerOptions = computed(() => this.viewerService.viewers());

  async ngOnInit(): Promise<void> {
    const chatIdParam = this.route.snapshot.paramMap.get('chatId');
    this.chatId.set(chatIdParam);

    const libraryId = this.route.snapshot.queryParamMap.get('libraryId');
    await this.viewerService.loadList(chatIdParam ?? '', libraryId ? { autoSelect: false } : {});

    if (!libraryId) return;

    const item = this.viewerService.viewers().find((viewer) => viewer.id === libraryId);
    if (item) {
      this.viewerService.selectLibrary(item);
      return;
    }

    await this.viewerService.showLibrary({ id: libraryId, title: '' });
  }
}
