import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { ChatSummaryComponent } from '@app/shared/components/features/chat/chat-summary/chat-summary.component';
import { ViewerService } from '@features/chat/services/viewer.service';
import { ViewerListItem } from '@core/constants/mock-data/viewer-content.mock';

@Component({
  selector: 'app-library-detail',
  standalone: true,
  imports: [CommonModule, MatIconModule, TranslateModule, ChatSummaryComponent],
  templateUrl: './library-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'w-full h-screen min-w-0 flex flex-col flex-1 rounded-t-2xl md:rounded-bl-2xl md:rounded-tr-none shadow-overlay md:shadow-viewer overflow-hidden md:border-t md:border-l md:border-b md:border-border-weak',
  },
})
export class LibraryDetailComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly viewerService = inject(ViewerService);

  readonly libraryId = signal<string | null>(null);

  // 単一ライブラリ表示のため、ヘッダーの選択肢は対象ライブラリ 1 件のみ
  readonly headerOptions = signal<ViewerListItem[]>([]);

  async ngOnInit(): Promise<void> {
    const libraryIdParam = this.route.snapshot.paramMap.get('id');
    this.libraryId.set(libraryIdParam);
    if (!libraryIdParam) return;

    await this.viewerService.showLibrary({ id: libraryIdParam, title: '' });
    const active = this.viewerService.activeLibrary();
    this.headerOptions.set(active ? [active] : [{ id: libraryIdParam, title: '' }]);
  }

  goBack(): void {
    this.router.navigate(['../'], { relativeTo: this.route });
  }
}
